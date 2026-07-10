import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import sensible from '@fastify/sensible';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

import { healthRoutes } from './routes/health';
import { domainRoutes } from './routes/domains';
import { templateRoutes } from './routes/templates';
import { sendRoutes } from './routes/send';
import { inboxRoutes } from './routes/inbox';
import { apiKeyRoutes } from './routes/api-keys';
import { logRoutes } from './routes/logs';
import { mailboxRoutes } from './routes/mailboxes';
import { metricsRoutes } from './routes/metrics';
import { webhookRoutes } from './routes/webhooks';
import { suppressionRoutes } from './routes/suppressions';
import { trackingRoutes } from './routes/tracking';
import { statisticsRoutes } from './routes/statistics';
import { validateRoutes } from './routes/validate';
import { bimiPublicRoutes } from './routes/bimi-public';
import { authPlugin } from './plugins/auth';
import { errorHandler } from './plugins/error-handler';
import { domainScope } from './plugins/domain-scope';
import { createMailWorker, closeMailQueue } from './services/queue';
import { startDomainVerifier } from './services/domain-verifier';
import { startLogWatcher } from './services/log-parser';
import { startLmtpProxy } from './services/lmtp-proxy';
import { httpRequestsTotal, httpRequestDuration } from './services/metrics';
import { createDovecotUser, deleteDovecotUser, updateDovecotPassword, listDovecotUsers } from './services/dovecot';
import { readFileSync } from 'fs';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

async function start() {
  // Decorate with shared instances
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  // Plugins
  await app.register(errorHandler);
  await app.register(sensible);

  await app.register(cors, {
    origin: process.env.API_ALLOWED_ORIGINS?.split(',') || ['*'],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // API key varsa key bazlı, yoksa IP bazlı
      return request.apiKey?.id || request.ip;
    },
    hook: 'preHandler', // Auth sonrası çalışsın
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Sentroy Mail Server API',
        version: '1.0.0',
        description: 'Self-hosted mail server REST API',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
  });

  // Request metrikleri hook'u
  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url || request.url;
    httpRequestsTotal.inc({
      method: request.method,
      route,
      status_code: reply.statusCode.toString(),
    });
    httpRequestDuration.observe(
      { method: request.method, route },
      reply.elapsedTime / 1000
    );
    done();
  });

  // Auth plugin
  await app.register(authPlugin);
  await app.register(domainScope);

  // Routes — /api/v1 prefix
  await app.register(
    async (api) => {
      // Public — auth gerektirmeyen
      await api.register(healthRoutes);
      await api.register(metricsRoutes);

      // Tracking — public (email client'lardan çağrılır)
      await api.register(trackingRoutes, { prefix: '/t' });

      // BIMI public lookup — inbox'ta gonderici logolarini gostermek icin
      await api.register(bimiPublicRoutes, { prefix: '/public' });

      // Protected — tüm authenticated route'lar
      await api.register(
        async (secured) => {
          secured.addHook('onRequest', app.authenticate);
          secured.addHook('preHandler', app.enforceDomainScope);

          // Admin scope
          await secured.register(domainRoutes, { prefix: '/domains' });
          await secured.register(apiKeyRoutes, { prefix: '/api-keys' });
          await secured.register(mailboxRoutes, { prefix: '/mailboxes' });
          await secured.register(webhookRoutes, { prefix: '/webhooks' });
          await secured.register(suppressionRoutes, { prefix: '/suppressions' });

          // Send scope
          await secured.register(templateRoutes, { prefix: '/templates' });
          await secured.register(sendRoutes, { prefix: '/send' });
          await secured.register(validateRoutes, { prefix: '/validate' });

          // Read scope
          await secured.register(inboxRoutes, { prefix: '/inbox' });

          // Any authenticated
          await secured.register(logRoutes, { prefix: '/logs' });
          await secured.register(statisticsRoutes, { prefix: '/statistics' });
        }
      );
    },
    { prefix: '/api/v1' }
  );

  // Sistem kullanıcılarını oluştur/güncelle (IMAP/SMTP)
  try {
    const usersFile = process.env.DOVECOT_USERS_FILE || '/etc/dovecot/users-data/users';
    let fileContent = '';
    try { fileContent = readFileSync(usersFile, 'utf-8'); } catch {}

    const systemUsers = [
      { email: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
      { email: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    ];

    for (const su of systemUsers) {
      if (!su.email || !su.pass) continue;

      // Eski hash formatını kontrol et (SHA512-CRYPT → BLF-CRYPT'e migrate)
      const line = fileContent.split('\n').find((l) => l.startsWith(`${su.email}:`));
      if (line && !line.includes('{BLF-CRYPT}')) {
        app.log.info(`Migrating ${su.email} to BLF-CRYPT hash`);
        await deleteDovecotUser(su.email);
        await createDovecotUser(su.email, su.pass);
        app.log.info(`System mailbox recreated: ${su.email}`);
      } else if (line) {
        // BLF-CRYPT hash var — env şifresiyle eşleşiyor mu kontrol et
        const storedHash = line.split(':')[1]?.replace('{BLF-CRYPT}', '');
        if (storedHash && !bcrypt.compareSync(su.pass, storedHash)) {
          app.log.info(`Password mismatch for ${su.email}, updating hash`);
          await updateDovecotPassword(su.email, su.pass);
          app.log.info(`System mailbox password updated: ${su.email}`);
        }
      } else {
        await createDovecotUser(su.email, su.pass);
        app.log.info(`System mailbox created: ${su.email}`);
      }
    }
  } catch (err) {
    app.log.warn({ err }, 'Failed to ensure system mailboxes');
  }

  // Dovecot master user dosyasını oluştur/güncelle (IMAP APPEND için)
  try {
    const masterUser = process.env.IMAP_MASTER_USER || 'sentroy';
    const masterPass = process.env.IMAP_MASTER_PASS || process.env.IMAP_PASS || '';
    if (masterPass) {
      const usersFile = process.env.DOVECOT_USERS_FILE || '/etc/dovecot/users-data/users';
      const { writeFileSync, mkdirSync } = await import('fs');
      const { dirname, join } = await import('path');
      const masterUsersFile = join(dirname(usersFile), 'master-users');
      const masterHash = bcrypt.hashSync(masterPass, 10);
      try { mkdirSync(dirname(masterUsersFile), { recursive: true }); } catch {}
      writeFileSync(
        masterUsersFile,
        `# Dovecot master user — API tarafından yönetilir\n${masterUser}:{BLF-CRYPT}${masterHash}\n`,
        { mode: 0o644 },
      );
      app.log.info(
        `Dovecot master user file updated at ${masterUsersFile} (user: ${masterUser})`
      );
    } else {
      app.log.warn(
        'IMAP_MASTER_PASS not set — Sent folder append will be disabled'
      );
    }
  } catch (err) {
    app.log.warn({ err }, 'Failed to create Dovecot master user file');
  }

  // Postfix virtual dosyalarını DB + Dovecot users ile senkronize et
  // Bu, API restart'tan sonra da virtual domains/mailboxes dosyalarının
  // güncel olmasını sağlar (Postfix'in dış mailleri kabul edebilmesi için kritik)
  try {
    const { updateVirtualDomains, updateVirtualMailboxes, reloadPostfix } =
      await import('./services/postfix');

    const domains = await prisma.domain.findMany({
      where: { status: { in: ['active', 'pending', 'verifying'] } },
      select: { domain: true },
    });

    const users = await listDovecotUsers();

    await updateVirtualDomains(domains.map((d) => d.domain));
    app.log.info(
      `Postfix virtual domains synced: ${domains.length} domain(s)`
    );

    await updateVirtualMailboxes(
      users.map((u) => ({
        email: u.email,
        domain: u.domain,
        user: u.username,
      })),
    );
    app.log.info(
      `Postfix virtual mailboxes synced: ${users.length} mailbox(es)`
    );

    await reloadPostfix();
  } catch (err) {
    app.log.warn({ err }, 'Failed to sync Postfix virtual files on startup');
  }

  // Mail queue worker
  const mailWorker = createMailWorker(prisma, redis);
  app.log.info('Mail queue worker started');

  // Domain DNS verification poller
  const verifierTimer = startDomainVerifier(prisma);

  // Postfix log watcher (production ortamında)
  const logWatcher = startLogWatcher(prisma);

  // LMTP proxy — Postfix bu porta teslim eder; proxy Redis'e event yayıp
  // Dovecot'a relay eder. Real-time mail push'un kaynağı burası.
  const lmtpListenPort = parseInt(process.env.LMTP_PROXY_PORT || '2424', 10);
  const lmtpServer = startLmtpProxy({
    listenPort: lmtpListenPort,
    dovecotHost: process.env.DOVECOT_HOST || 'dovecot',
    dovecotPort: parseInt(process.env.DOVECOT_LMTP_PORT || '24', 10),
    redis,
  });

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    clearInterval(verifierTimer);
    logWatcher?.close();
    lmtpServer.close();
    await mailWorker.close();
    await closeMailQueue();
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start
  const port = parseInt(process.env.API_PORT || '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Server running on port ${port}`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

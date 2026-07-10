import { FastifyPluginAsync } from 'fastify';
import net from 'net';

/**
 * TCP bağlantı testi — belirtilen host:port'a bağlanabilir mi?
 */
function checkTcp(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /health — Tüm servislerin durumu
  fastify.get('/health', async (request, reply) => {
    // Probe'lar paralel — eskiden sıralı çalışıyordu, postfix/dovecot/rspamd
    // hep beraber yavaşlasa toplam 9s'i bulup outer 5s probe timeout'una
    // takılıyordu. Promise.all ile en yavaş probe kadar süre alır (worst-case 3s).
    const smtpHost = process.env.SMTP_HOST || 'postfix';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const imapHost = process.env.IMAP_HOST || 'dovecot';
    const imapPort = parseInt(process.env.IMAP_PORT || '143', 10);

    const [postgresOk, redisOk, postfixOk, dovecotOk, rspamdOk] =
      await Promise.all([
        fastify.prisma
          .$queryRaw`SELECT 1`.then(() => true)
          .catch(() => false),
        fastify.redis
          .ping()
          .then((pong) => pong === 'PONG')
          .catch(() => false),
        checkTcp(smtpHost, smtpPort),
        checkTcp(imapHost, imapPort),
        checkTcp('rspamd', 11334),
      ]);

    const checks: Record<string, string> = {
      postgres: postgresOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      postfix: postfixOk ? 'ok' : 'error',
      dovecot: dovecotOk ? 'ok' : 'error',
      rspamd: rspamdOk ? 'ok' : 'error',
    };

    const allOk = Object.values(checks).every((v) => v === 'ok');
    // Eğer sadece mail servisleri down ise degraded, DB down ise unhealthy
    const coreOk = checks.postgres === 'ok' && checks.redis === 'ok';

    return reply.code(coreOk ? 200 : 503).send({
      data: {
        status: allOk ? 'healthy' : coreOk ? 'degraded' : 'unhealthy',
        services: checks,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  });

  // GET /health/queue — BullMQ istatistikleri
  fastify.get('/health/queue', async (request, reply) => {
    try {
      const { getMailQueue } = await import('../services/queue');
      const queue = getMailQueue(fastify.redis);

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return reply.send({
        data: {
          queue: 'mail-send',
          counts: { waiting, active, completed, failed, delayed },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      return reply.code(503).send({
        data: null,
        error: 'Queue unavailable',
      });
    }
  });
};

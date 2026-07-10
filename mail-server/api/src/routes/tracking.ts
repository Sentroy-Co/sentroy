import { FastifyPluginAsync } from 'fastify';
import { decodeTrackingToken } from '../services/tracking';
import { dispatchWebhook } from '../services/webhook';
import { addToSuppression } from '../services/suppression';

// 1x1 transparent GIF
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export const trackingRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /t/open/:token — Open tracking pixel
  fastify.get('/open/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const mailLogId = decodeTrackingToken(token);

    if (mailLogId) {
      // Event kaydet (fire-and-forget)
      fastify.prisma.trackingEvent
        .create({
          data: {
            mailLogId,
            type: 'open',
            ip: request.ip,
            userAgent: request.headers['user-agent'] || null,
          },
        })
        .then(async () => {
          // İlk açılış ise openedAt güncelle
          const log = await fastify.prisma.mailLog.findUnique({
            where: { id: mailLogId },
          });

          if (log && !log.openedAt) {
            await fastify.prisma.mailLog.update({
              where: { id: mailLogId },
              data: { openedAt: new Date() },
            });
          }

          // Webhook tetikle
          if (log) {
            await dispatchWebhook(fastify.prisma, log.domainId, 'opened', {
              mailLogId,
              to: log.to,
              from: log.from,
              subject: log.subject,
              domainId: log.domainId,
              ip: request.ip,
            });
          }
        })
        .catch(() => {});
    }

    return reply
      .header('Content-Type', 'image/gif')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate')
      .send(PIXEL_GIF);
  });

  // GET /t/click/:token — Click tracking redirect
  fastify.get('/click/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { url } = request.query as { url?: string };

    if (!url) {
      return reply.code(400).send('Missing url parameter');
    }

    const mailLogId = decodeTrackingToken(token);
    const targetUrl = decodeURIComponent(url);

    if (mailLogId) {
      fastify.prisma.trackingEvent
        .create({
          data: {
            mailLogId,
            type: 'click',
            url: targetUrl,
            ip: request.ip,
            userAgent: request.headers['user-agent'] || null,
          },
        })
        .then(async () => {
          const log = await fastify.prisma.mailLog.findUnique({
            where: { id: mailLogId },
          });

          if (log && !log.clickedAt) {
            await fastify.prisma.mailLog.update({
              where: { id: mailLogId },
              data: { clickedAt: new Date() },
            });
          }

          if (log) {
            await dispatchWebhook(fastify.prisma, log.domainId, 'clicked', {
              mailLogId,
              to: log.to,
              from: log.from,
              subject: log.subject,
              domainId: log.domainId,
              url: targetUrl,
              ip: request.ip,
            });
          }
        })
        .catch(() => {});
    }

    return reply.redirect(302, targetUrl);
  });

  // GET /t/unsubscribe/:token — Unsubscribe sayfası
  fastify.get('/unsubscribe/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const mailLogId = decodeTrackingToken(token);

    if (!mailLogId) {
      return reply.code(400).send('Invalid or expired unsubscribe link');
    }

    const log = await fastify.prisma.mailLog.findUnique({
      where: { id: mailLogId },
    });

    if (!log) {
      return reply.code(404).send('Message not found');
    }

    // Basit HTML unsubscribe sayfası
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Unsubscribe</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center}
button{background:#dc2626;color:#fff;border:none;padding:12px 32px;border-radius:6px;font-size:16px;cursor:pointer}
button:hover{background:#b91c1c}.done{color:#16a34a}</style></head>
<body><h2>Abonelikten Çık</h2>
<p><strong>${log.to}</strong> adresine gönderilen e-postalardan çıkmak istiyor musunuz?</p>
<form method="POST" action="/t/unsubscribe/${token}">
<button type="submit">Abonelikten Çık</button></form></body></html>`;

    return reply.header('Content-Type', 'text/html').send(html);
  });

  // POST /t/unsubscribe/:token — Unsubscribe işlemi (RFC 8058 one-click)
  fastify.post('/unsubscribe/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const mailLogId = decodeTrackingToken(token);

    if (!mailLogId) {
      return reply.code(400).send('Invalid or expired unsubscribe link');
    }

    const log = await fastify.prisma.mailLog.findUnique({
      where: { id: mailLogId },
    });

    if (!log) {
      return reply.code(404).send('Message not found');
    }

    // Suppression listesine ekle
    await addToSuppression(fastify.prisma, log.to, log.domainId, 'unsubscribe');

    // Tracking event
    await fastify.prisma.trackingEvent.create({
      data: {
        mailLogId,
        type: 'unsubscribe',
        ip: request.ip,
        userAgent: request.headers['user-agent'] || null,
      },
    });

    // Webhook
    await dispatchWebhook(fastify.prisma, log.domainId, 'unsubscribed', {
      mailLogId,
      to: log.to,
      from: log.from,
      subject: log.subject,
      domainId: log.domainId,
      ip: request.ip,
    });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Unsubscribed</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center}
.done{color:#16a34a}</style></head>
<body><h2 class="done">Abonelikten çıkıldı</h2>
<p><strong>${log.to}</strong> adresine artık e-posta gönderilmeyecektir.</p></body></html>`;

    return reply.header('Content-Type', 'text/html').send(html);
  });
};

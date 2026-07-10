import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getMailQueue, SendEmailData } from '../services/queue';
import { renderTemplate, resolveLocalized, type LocalizedValue } from '../services/template-engine';
import { isEmailSuppressed } from '../services/suppression';
import {
  createTrackingToken,
  injectOpenPixel,
  rewriteLinks,
  getUnsubscribeHeaders,
} from '../services/tracking';
import { domainScope, throughDomainScope } from '../utils/company-scope';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

const attachmentSchema = z.object({
  filename: z.string(),
  content: z.string(), // base64 encoded
  contentType: z.string().optional(),
});

const sendSingleSchema = z.object({
  to: z.string().email(),
  from: z.string().email(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  replyTo: z.string().email().optional(),
  subject: z.string().min(1),
  templateId: z.string().uuid().optional(),
  lang: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  // Section desteği: scalar (string/number/boolean) ya da array of rows.
  // Her row scalar map. Mustache-benzeri {#products}...{/products} render'ı
  // bu array'i iterler.
  variables: z
    .record(
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))),
      ])
    )
    .optional(),
  domainId: z.string().uuid(),
  attachments: z.array(attachmentSchema).optional(),
  scheduledAt: z.string().datetime().optional(),
  headers: z.record(z.string()).optional(),
  /** RFC 5322 — yanit verilen mesajin Message-ID'si (ornek: "<abc@example.com>") */
  inReplyTo: z.string().optional(),
  /** RFC 5322 — thread'deki onceki mesajlarin Message-ID listesi */
  references: z.array(z.string()).optional(),
  /** Per-send tracking override (domain default'unu ezer). Internal
   *  mail'lerde (invitation, password reset) link integrity icin false. */
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
});

const sendBatchSchema = z.object({
  recipients: z
    .array(
      z.object({
        to: z.string().email(),
        variables: z
          .record(
            z.union([
              z.string(),
              z.number(),
              z.boolean(),
              z.array(z.record(z.union([z.string(), z.number(), z.boolean()]))),
            ])
          )
          .optional(),
      })
    )
    .min(1)
    .max(500),
  from: z.string().email(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  replyTo: z.string().email().optional(),
  subject: z.string().min(1),
  templateId: z.string().uuid().optional(),
  lang: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  domainId: z.string().uuid(),
  attachments: z.array(attachmentSchema).optional(),
  scheduledAt: z.string().datetime().optional(),
  headers: z.record(z.string()).optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
});

export const sendRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireScope('send'));

  // Tüm route'lar/metrics paylaşımlı tek Queue instance kullansın — eskiden
  // /metrics ve /health/queue kendi Queue'larını açıp kapatıyordu, send burada
  // ayrı bir tane tutuyordu. Tek singleton ile Redis bağlantı sayısını sabitliyoruz.
  const mailQueue = getMailQueue(fastify.redis);

  /**
   * HTML'e tracking pixel ve link rewriting uygular (domain ayarlarına göre).
   */
  function applyTracking(
    html: string | undefined,
    token: string,
    trackOpens: boolean,
    trackClicks: boolean
  ): string | undefined {
    if (!html) return html;

    let result = html;

    if (trackOpens) {
      const pixelUrl = `${API_BASE_URL}/t/open/${token}`;
      result = injectOpenPixel(result, pixelUrl);
    }

    if (trackClicks) {
      result = rewriteLinks(result, API_BASE_URL, token);
    }

    return result;
  }

  // POST /send/single
  fastify.post('/single', async (request, reply) => {
    const body = sendSingleSchema.parse(request.body);

    // Domain kontrolü
    const domain = await fastify.prisma.domain.findFirst({
      where: { id: body.domainId, ...domainScope(request) },
    });

    if (!domain || domain.status !== 'active') {
      return reply.code(400).send({
        data: null,
        error: 'Domain not found or not active',
      });
    }

    const fromDomain = body.from.split('@')[1];
    if (fromDomain !== domain.domain) {
      return reply.code(400).send({
        data: null,
        error: `Sender email must belong to domain ${domain.domain}`,
      });
    }

    // Suppression check
    if (await isEmailSuppressed(fastify.prisma, body.to, body.domainId)) {
      return reply.code(422).send({
        data: null,
        error: `Email ${body.to} is in the suppression list for this domain`,
      });
    }

    // Template veya raw HTML hazırla
    let html = body.html;
    let subject = body.subject;
    let text = body.text;

    if (body.templateId) {
      const template = await fastify.prisma.template.findFirst({
        where: { id: body.templateId, ...throughDomainScope(request) },
      });

      if (!template) {
        return reply.code(404).send({
          data: null,
          error: 'Template not found',
        });
      }

      html = resolveLocalized(template.htmlBody as LocalizedValue, body.lang);
      subject = resolveLocalized(template.subject as LocalizedValue, body.lang);

      if (body.variables) {
        const rendered = renderTemplate(html, subject, body.variables);
        html = rendered.html;
        subject = rendered.subject;
      }
    }

    if (!html && !text) {
      return reply.code(400).send({
        data: null,
        error: 'Either templateId, html, or text must be provided',
      });
    }

    // Mail log oluştur
    const mailLog = await fastify.prisma.mailLog.create({
      data: {
        to: body.to,
        from: body.from,
        subject,
        status: body.scheduledAt ? 'queued' : 'queued',
        domainId: body.domainId,
        templateId: body.templateId,
        variables: body.variables || undefined,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      },
    });

    // Tracking token + injection. Per-send override (body.trackOpens /
    // body.trackClicks) varsa domain default'unu ezer — invitation, password
    // reset gibi internal mail'lerde sender tracking opt-out ister, link'ler
    // proxy'den geçmesin (404 riski + UX bozulur).
    const token = createTrackingToken(mailLog.id);
    const trackOpens = body.trackOpens ?? domain.trackOpens;
    const trackClicks = body.trackClicks ?? domain.trackClicks;
    html = applyTracking(html, token, trackOpens, trackClicks);

    // Unsubscribe headers
    const unsubHeaders = getUnsubscribeHeaders(API_BASE_URL, token);

    // Kuyruğa ekle
    const delay = body.scheduledAt
      ? Math.max(0, new Date(body.scheduledAt).getTime() - Date.now())
      : undefined;

    const job = await mailQueue.add(
      'send-email',
      {
        mailLogId: mailLog.id,
        to: body.to,
        from: body.from,
        cc: body.cc,
        subject,
        html,
        text,
        replyTo: body.replyTo,
        attachments: body.attachments,
        headers: { ...unsubHeaders, ...body.headers },
        inReplyTo: body.inReplyTo,
        references: body.references,
      } as any,
      delay ? { delay } : undefined
    );

    return reply.code(202).send({
      data: {
        jobId: job.id,
        mailLogId: mailLog.id,
        status: delay ? 'scheduled' : 'queued',
        scheduledAt: body.scheduledAt || null,
      },
    });
  });

  // POST /send/batch
  fastify.post('/batch', async (request, reply) => {
    const body = sendBatchSchema.parse(request.body);

    const domain = await fastify.prisma.domain.findFirst({
      where: { id: body.domainId, ...domainScope(request) },
    });

    if (!domain || domain.status !== 'active') {
      return reply.code(400).send({
        data: null,
        error: 'Domain not found or not active',
      });
    }

    const fromDomain = body.from.split('@')[1];
    if (fromDomain !== domain.domain) {
      return reply.code(400).send({
        data: null,
        error: `Sender email must belong to domain ${domain.domain}`,
      });
    }

    // Template varsa hazırla
    let baseHtml = body.html;
    let baseSubject = body.subject;

    if (body.templateId) {
      const template = await fastify.prisma.template.findFirst({
        where: { id: body.templateId, ...throughDomainScope(request) },
      });

      if (!template) {
        return reply.code(404).send({
          data: null,
          error: 'Template not found',
        });
      }

      baseHtml = resolveLocalized(template.htmlBody as LocalizedValue, body.lang);
      baseSubject = resolveLocalized(template.subject as LocalizedValue, body.lang);
    }

    if (!baseHtml && !body.text) {
      return reply.code(400).send({
        data: null,
        error: 'Either templateId, html, or text must be provided',
      });
    }

    const delay = body.scheduledAt
      ? Math.max(0, new Date(body.scheduledAt).getTime() - Date.now())
      : undefined;

    const results: { jobId: string | undefined; mailLogId: string; to: string; suppressed?: boolean }[] = [];

    for (const recipient of body.recipients) {
      // Suppression check — suppress edilmişleri atla
      if (await isEmailSuppressed(fastify.prisma, recipient.to, body.domainId)) {
        results.push({ jobId: undefined, mailLogId: '', to: recipient.to, suppressed: true });
        continue;
      }

      let html = baseHtml;
      let subject = baseSubject;

      if (recipient.variables && html) {
        const rendered = renderTemplate(html, subject, recipient.variables);
        html = rendered.html;
        subject = rendered.subject;
      }

      const mailLog = await fastify.prisma.mailLog.create({
        data: {
          to: recipient.to,
          from: body.from,
          subject,
          status: 'queued',
          domainId: body.domainId,
          templateId: body.templateId,
          variables: recipient.variables || undefined,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        },
      });

      const token = createTrackingToken(mailLog.id);
      const batchTrackOpens = body.trackOpens ?? domain.trackOpens;
      const batchTrackClicks = body.trackClicks ?? domain.trackClicks;
      html = applyTracking(html, token, batchTrackOpens, batchTrackClicks);

      const unsubHeaders = getUnsubscribeHeaders(API_BASE_URL, token);

      const job = await mailQueue.add(
        'send-email',
        {
          mailLogId: mailLog.id,
          to: recipient.to,
          from: body.from,
          cc: body.cc,
          subject,
          html,
          text: body.text,
          replyTo: body.replyTo,
          attachments: body.attachments,
          headers: { ...unsubHeaders, ...body.headers },
        } as any,
        delay ? { delay } : undefined
      );

      results.push({ jobId: job.id, mailLogId: mailLog.id, to: recipient.to });
    }

    const queued = results.filter((r) => !r.suppressed).length;
    const suppressed = results.filter((r) => r.suppressed).length;

    return reply.code(202).send({
      data: {
        totalQueued: queued,
        totalSuppressed: suppressed,
        jobs: results,
      },
    });
  });

  // GET /send/:jobId/status
  fastify.get('/:jobId/status', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const job = await mailQueue.getJob(jobId);

    if (!job) {
      return reply.code(404).send({
        data: null,
        error: 'Job not found',
      });
    }

    const state = await job.getState();

    return reply.send({
      data: {
        jobId: job.id,
        state,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
      },
    });
  });

  // DELETE /send/:jobId — Zamanlanmış gönderimi iptal et
  fastify.delete('/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const job = await mailQueue.getJob(jobId);
    if (!job) {
      return reply.code(404).send({ data: null, error: 'Job not found' });
    }

    const state = await job.getState();
    if (state !== 'delayed' && state !== 'waiting') {
      return reply.code(400).send({
        data: null,
        error: `Cannot cancel job in state: ${state}`,
      });
    }

    await job.remove();

    // MailLog da güncelle
    if (job.data.mailLogId) {
      await fastify.prisma.mailLog.update({
        where: { id: job.data.mailLogId },
        data: { status: 'failed', error: 'Cancelled by user' },
      });
    }

    return reply.send({ data: { message: 'Job cancelled' } });
  });

  // Cleanup
  fastify.addHook('onClose', async () => {
    await mailQueue.close();
  });
};

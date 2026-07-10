import { Worker, Queue, Job, QueueEvents } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { Redis } from 'ioredis';
import { mailsSentTotal, mailBouncesTotal, mailErrorsTotal, mailSendDuration } from './metrics';
import { dispatchWebhook } from './webhook';
import { addToSuppression } from './suppression';
import { ImapService } from './imap';

export interface SendEmailData {
  mailLogId: string;
  to: string;
  from: string;
  cc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
  headers?: Record<string, string>;
  /** Yanit verilen mesajin Message-ID'si — In-Reply-To header'i */
  inReplyTo?: string;
  /** Thread'deki onceki Message-ID'ler — References header'i */
  references?: string[];
}

// Dead letter queue — tüm denemeler başarısız olan job'lar buraya taşınır
const DLQ_NAME = 'mail-send-dlq';

/**
 * Gönderilen maili, gönderenin IMAP Sent klasörüne kaydeder.
 *
 * Dovecot master user ile herhangi bir kullanıcı adına bağlanılır;
 * connection pool üzerinden reused → eskiden her gönderim için yeni IMAP
 * handshake açılıyordu, worker concurrency=5 altında her mailde 5 ekstra
 * tam handshake demekti.
 */
async function appendToSentFolder(data: SendEmailData): Promise<void> {
  const masterUser = process.env.IMAP_MASTER_USER;
  const masterPass = process.env.IMAP_MASTER_PASS;
  if (!masterUser || !masterPass) {
    console.warn(
      '[sent-folder] IMAP_MASTER_USER/IMAP_MASTER_PASS not set — skipping Sent folder append'
    );
    return;
  }

  const senderEmail = data.from;

  // Raw RFC 822 mesaj oluştur
  const composer = new MailComposer({
    from: data.from,
    to: data.to,
    cc: data.cc || undefined,
    subject: data.subject,
    html: data.html || undefined,
    text: data.text || undefined,
    replyTo: data.replyTo || undefined,
    inReplyTo: data.inReplyTo || undefined,
    references: data.references || undefined,
    headers: data.headers,
    attachments: data.attachments?.map((att) => ({
      filename: att.filename,
      content: Buffer.from(att.content, 'base64'),
      contentType: att.contentType,
    })),
  });

  const rawMessage = await composer.compile().build();

  const imap = new ImapService();
  await imap.init(senderEmail);
  try {
    await imap.appendToSent(rawMessage);
    console.info(`[sent-folder] Appended message to Sent for ${senderEmail}`);
  } catch (err) {
    const e = err as Error & {
      authenticationFailed?: boolean;
      response?: string;
      responseText?: string;
    };
    console.error(
      `[sent-folder] Append failed for ${senderEmail} (user: ${senderEmail}*${masterUser}):`,
      {
        message: e.message,
        authFailed: e.authenticationFailed,
        response: e.response,
        responseText: e.responseText,
      }
    );
    throw err;
  } finally {
    imap.release();
  }
}

export function createMailQueue(redis: Redis): Queue<SendEmailData> {
  return new Queue<SendEmailData>('mail-send', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s → 10s → 20s
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: false, // DLQ'ya taşımak için tutuyoruz
    },
  });
}

// ── Singleton mail queue accessor ──────────────────────────────────────────
// Önceden /metrics, /health/queue ve /send route'ları her istekte
// `new Queue(...)` + `queue.close()` yapıyordu. BullMQ bunun için yeni
// blocking Redis bağlantıları açıp kapatıyor; Prometheus scrape'leri ve
// system-status probe'ları sürekli connection churn yaratıyordu. Tek
// instance üzerinden paylaşıyoruz; uygulama kapanırken graceful close.
let _mailQueue: Queue<SendEmailData> | null = null;

export function getMailQueue(redis: Redis): Queue<SendEmailData> {
  if (!_mailQueue) {
    _mailQueue = createMailQueue(redis);
  }
  return _mailQueue;
}

export async function closeMailQueue(): Promise<void> {
  if (_mailQueue) {
    await _mailQueue.close();
    _mailQueue = null;
  }
}

export function createMailWorker(prisma: PrismaClient, redis: Redis): Worker {
  const smtpPort = parseInt(process.env.SMTP_PORT || '25', 10);
  const useAuth = smtpPort !== 25;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'postfix',
    port: smtpPort,
    secure: false,
    ...(useAuth && {
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    }),
    tls: {
      rejectUnauthorized: false,
    },
    pool: true,
    maxConnections: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    maxMessages: 100,
  });

  const dlq = new Queue(DLQ_NAME, { connection: redis });

  const worker = new Worker<SendEmailData>(
    'mail-send',
    async (job: Job<SendEmailData>) => {
      const { mailLogId, to, from, cc, subject, html, text, replyTo, attachments, headers, inReplyTo, references } = job.data;

      const sendStart = Date.now();
      const fromDomain = from.split('@')[1] || 'unknown';

      // Status güncelle: processing
      await prisma.mailLog.update({
        where: { id: mailLogId },
        data: { status: 'processing' },
      });

      // domainId al (webhook dispatch için)
      const mailLog = await prisma.mailLog.findUnique({
        where: { id: mailLogId },
        select: { domainId: true },
      });

      try {
        const info = await transporter.sendMail({
          from,
          to,
          cc: cc || undefined,
          subject,
          replyTo: replyTo || undefined,
          inReplyTo: inReplyTo || undefined,
          references: references && references.length > 0 ? references : undefined,
          html: html || undefined,
          text: text || undefined,
          headers: {
            'X-Sentroy-LogId': mailLogId,
            ...headers,
          },
          attachments: attachments?.map((att) => ({
            filename: att.filename,
            content: Buffer.from(att.content, 'base64'),
            contentType: att.contentType,
          })),
        });

        // Bounce kontrolü — SMTP response code'a göre
        const isBounce =
          info.rejected && info.rejected.length > 0;

        const duration = (Date.now() - sendStart) / 1000;

        if (isBounce) {
          mailBouncesTotal.inc({ domain: fromDomain });
          mailsSentTotal.inc({ status: 'bounced', domain: fromDomain });
          mailSendDuration.observe({ status: 'bounced' }, duration);

          await prisma.mailLog.update({
            where: { id: mailLogId },
            data: {
              status: 'bounced',
              messageId: info.messageId,
              bouncedAt: new Date(),
              error: `Rejected by server: ${info.rejected.join(', ')}`,
            },
          });

          // Bounce → suppression listesine ekle
          if (mailLog) {
            await addToSuppression(prisma, to, mailLog.domainId, 'bounce');
            await dispatchWebhook(prisma, mailLog.domainId, 'bounced', {
              mailLogId, to, from, subject, domainId: mailLog.domainId,
              messageId: info.messageId,
            });
          }

          return { messageId: info.messageId, bounced: true };
        }

        mailsSentTotal.inc({ status: 'sent', domain: fromDomain });
        mailSendDuration.observe({ status: 'sent' }, duration);

        await prisma.mailLog.update({
          where: { id: mailLogId },
          data: {
            status: 'sent',
            messageId: info.messageId,
            sentAt: new Date(),
          },
        });

        // Webhook: sent
        if (mailLog) {
          await dispatchWebhook(prisma, mailLog.domainId, 'sent', {
            mailLogId, to, from, subject, domainId: mailLog.domainId,
            messageId: info.messageId,
          });
        }

        // Sent klasörüne kaydet (hata olursa gönderimi engelleme)
        try {
          await appendToSentFolder(job.data);
        } catch (err) {
          console.error('[queue] Failed to append to Sent folder:', (err as Error).message);
        }

        return { messageId: info.messageId, bounced: false };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        const isLastAttempt =
          job.attemptsMade >= (job.opts.attempts || 3) - 1;

        mailErrorsTotal.inc({ domain: fromDomain, error_type: 'smtp_error' });

        if (isLastAttempt) {
          mailsSentTotal.inc({ status: 'failed', domain: fromDomain });
          // Dead letter queue'ya taşı
          await dlq.add('dead-letter', {
            ...job.data,
            originalJobId: job.id,
            failedAt: new Date().toISOString(),
            error: errorMessage,
            attempts: job.attemptsMade + 1,
          } as any);

          await prisma.mailLog.update({
            where: { id: mailLogId },
            data: {
              status: 'failed',
              error: `After ${job.attemptsMade + 1} attempts: ${errorMessage}`,
            },
          });

          // Webhook: failed
          if (mailLog) {
            await dispatchWebhook(prisma, mailLog.domainId, 'failed', {
              mailLogId, to, from, subject, domainId: mailLog.domainId,
              error: errorMessage,
            });
          }
        }

        throw err;
      }
    },
    {
      connection: redis,
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    }
  );

  worker.on('completed', (job) => {
    console.log(`[queue] Job ${job.id} completed for ${job.data.to}`);
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[queue] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`
    );
  });

  worker.on('error', (err) => {
    console.error('[queue] Worker error:', err.message);
  });

  return worker;
}

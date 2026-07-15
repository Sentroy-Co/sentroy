import { SMTPServer, SMTPServerSession } from 'smtp-server';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { Redis } from 'ioredis';
import { Readable } from 'stream';
import { publishMailDelivered } from './events';
import { categorize } from './mail-categorizer';
import { stampDeliveredCategory } from './category-stamper';

/**
 * Inline LMTP proxy:
 *   Postfix ──LMTP──▶ bu server ──LMTP──▶ Dovecot
 *
 * Her teslim edilen mesaj için Redis'e `mail:delivered` event'i publish eder.
 * Relay'dan dönen SMTP kodu (2xx/4xx/5xx) istemciye (Postfix'e) aynen geri
 * verilir — böylece teslim başarısız olursa Postfix retry/bounce mekanizması
 * etkilenmez.
 */

interface LmtpProxyConfig {
  /** Dinleme portu — Postfix buraya teslim edecek */
  listenPort: number;
  /** Gerçek Dovecot LMTP hostu (genellikle "dovecot") */
  dovecotHost: string;
  /** Gerçek Dovecot LMTP portu (genellikle 24) */
  dovecotPort: number;
  /** Event publish için Redis bağlantısı */
  redis: Redis;
}

/**
 * Bir LMTP oturumundaki tek teslim girişimini Dovecot'a relay eder.
 * Başarıda `true`, hata atarsa yukarıya propagate edilir.
 */
async function relayToDovecot(
  host: string,
  port: number,
  from: string,
  to: string[],
  raw: Buffer,
): Promise<void> {
  // nodemailer LMTP istemcisi — `lmtp: true` ile LMTP protokolünü konuşur.
  // Each transporter bir mesaj için açılıp kapatılır (pool değil).
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    lmtp: true,
    tls: { rejectUnauthorized: false },
  } as any);

  try {
    await transporter.sendMail({
      envelope: { from, to },
      raw,
    });
  } finally {
    transporter.close();
  }
}

export function startLmtpProxy(config: LmtpProxyConfig): SMTPServer {
  const { listenPort, dovecotHost, dovecotPort, redis } = config;

  const server = new SMTPServer({
    lmtp: true,
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    size: 50 * 1024 * 1024, // 50 MB sınırı
    logger: false,

    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', async () => {
        const raw = Buffer.concat(chunks);
        const envelopeFrom = session.envelope.mailFrom
          ? session.envelope.mailFrom.address
          : '';
        const recipients = session.envelope.rcptTo.map((r) => r.address);

        // Önce Dovecot'a relay. Teslim başarısızsa event de publish etme.
        try {
          await relayToDovecot(
            dovecotHost,
            dovecotPort,
            envelopeFrom,
            recipients,
            raw,
          );
        } catch (err) {
          console.error(
            '[lmtp-proxy] Dovecot relay failed:',
            (err as Error).message,
          );
          return callback(err as Error);
        }

        // Event metadata + kategorizasyon için mesajı tek seferde parse et.
        // Önceden iki ayrı `simpleParser` çağrısı vardı; mailparser CPU-heavy
        // olduğu için her gelen mailde gereksiz iki kat iş yapılıyordu →
        // event loop bloklanması. Tek parse ile gereken tüm alanları çıkarıyoruz.
        let subject: string | null = null;
        let from: string | null = null;
        let messageId: string | null = null;
        let inReplyTo: string | null = null;
        const parsedHeaders: Record<string, string> = {};
        try {
          const parsed = await simpleParser(Readable.from(raw), {
            skipHtmlToText: true,
            skipImageLinks: true,
            skipTextToHtml: true,
            skipTextLinks: true,
          });
          subject = parsed.subject || null;
          if (parsed.from && 'value' in parsed.from && parsed.from.value[0]) {
            const a = parsed.from.value[0];
            from = a.name ? `${a.name} <${a.address}>` : a.address || null;
          }
          messageId = parsed.messageId || null;
          inReplyTo = (parsed.inReplyTo as string) || null;
          for (const [key, value] of parsed.headers) {
            if (typeof value === 'string') parsedHeaders[key] = value;
          }
        } catch {
          // Parsing zayıf ise event yine de en azından mailbox ile publish edilir
        }

        const category = categorize({
          from: from || undefined,
          subject: subject || undefined,
          headers: parsedHeaders,
          inReplyTo,
        });

        // Her alıcı için ayrı event publish et
        const arrivedAt = new Date().toISOString();
        await Promise.all(
          recipients.map((mailbox) =>
            publishMailDelivered(redis, {
              mailbox: mailbox.toLowerCase(),
              folder: 'INBOX',
              messageId,
              from,
              subject,
              arrivedAt,
              category,
            }).catch((err) =>
              console.error(
                '[lmtp-proxy] publish failed for',
                mailbox,
                err.message,
              ),
            ),
          ),
        );

        // Kategori damgası — mesajın üzerine IMAP keyword yazar (kalıcı +
        // kullanıcı-değiştirilebilir). Fire-and-forget: teslim yolunu asla
        // beklemez; başarısızlıkta read-fallback kategoriyi yine gösterir.
        for (const mailbox of recipients) {
          void stampDeliveredCategory({
            mailbox: mailbox.toLowerCase(),
            messageId,
            category,
          }).catch(() => {});
        }

        callback();
      });
      stream.on('error', (err) => callback(err));
    },
  });

  server.on('error', (err) => {
    console.error('[lmtp-proxy] Server error:', err.message);
  });

  server.listen(listenPort, '0.0.0.0', () => {
    console.info(
      `[lmtp-proxy] Listening on :${listenPort} → relaying to ${dovecotHost}:${dovecotPort}`,
    );
  });

  return server;
}

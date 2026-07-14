import { PrismaClient } from '@prisma/client';
import { subscribeMailDelivered, type MailDeliveredEvent } from './events';

/**
 * Yeni mail → Web Push köprüsü. `mail:delivered` event'ini dinler, mailbox'tan
 * domain'i çözer, `Domain.companyId` (UI Company.id) ile core'un
 * /api/internal/mail-push endpoint'ine fire-and-forget POST atar. Push
 * abonelikleri + VAPID keypair + blocklist filtresi + alıcı çözümü CORE
 * tarafında (mongo) — mail-server sadece "şu şirkette şu mailbox'a mail geldi"
 * sinyalini iletir.
 *
 * Neden burada: web push KAPALI sekme/uygulama için de gelmeli → her teslimi
 * kaçırmadan yakalayan always-on bir tüketici gerekir. apps/mail'in inbox SSE
 * consumer'ı yalnız client bağlıyken çalışır; mail-server (Fastify) her zaman
 * ayakta ve `mail:delivered`'ı publish eden süreçle aynı → doğal ev.
 *
 * Env (biri yoksa no-op — mevcut kurulumları bozmaz):
 *   CORE_INTERNAL_URL   core app kökü (örn https://sentroy.com)
 *   INTERNAL_API_SECRET core ile paylaşılan server-to-server secret
 */
export function startPushNotifier(opts: {
  prisma: PrismaClient;
  redisUrl: string;
}): () => void {
  const coreUrl = (process.env.CORE_INTERNAL_URL || '').replace(/\/+$/, '');
  const secret = process.env.INTERNAL_API_SECRET || '';
  if (!coreUrl || !secret) {
    console.log(
      '[push-notify] CORE_INTERNAL_URL / INTERNAL_API_SECRET tanımlı değil — web push köprüsü devre dışı',
    );
    return () => {};
  }

  async function notify(event: MailDeliveredEvent): Promise<void> {
    const mailbox = (event.mailbox || '').trim().toLowerCase();
    const domainName = mailbox.includes('@') ? mailbox.split('@')[1] : '';
    if (!domainName) return;

    // domain → Sentroy company. Legacy/system domain (companyId NULL) → atla.
    const domain = await opts.prisma.domain.findUnique({
      where: { domain: domainName },
      select: { companyId: true },
    });
    const companyId = domain?.companyId;
    if (!companyId) return;

    const res = await fetch(`${coreUrl}/api/internal/mail-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({
        companyId,
        mailbox,
        from: event.from ?? null,
        subject: event.subject ?? null,
        messageId: event.messageId ?? null,
      }),
      // Core yavaşsa mail teslimini etkilememesi için kısa timeout.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[push-notify] core ${res.status} for ${mailbox}`);
    }
  }

  const stop = subscribeMailDelivered(opts.redisUrl, (event) => {
    // Fire-and-forget — teslim yolunu (LMTP) bloklamaz; hata sessiz yutulur.
    void notify(event).catch((err) => {
      console.warn(
        '[push-notify] dispatch failed:',
        err instanceof Error ? err.message : err,
      );
    });
  });

  console.log('[push-notify] web push köprüsü aktif →', coreUrl);
  return stop;
}

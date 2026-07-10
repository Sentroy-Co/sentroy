import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

type WebhookEventType = 'sent' | 'bounced' | 'failed' | 'opened' | 'clicked' | 'unsubscribed';

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: {
    mailLogId: string;
    to: string;
    from: string;
    subject: string;
    domainId: string;
    messageId?: string | null;
    error?: string | null;
    url?: string | null; // click event için
    ip?: string | null;
  };
}

/**
 * HMAC-SHA256 imzası oluşturur.
 */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Belirtilen event tipi için ilgili domain'in webhook'larını tetikler.
 * Fire-and-forget — webhook hataları ana akışı bloklamaz.
 */
export async function dispatchWebhook(
  prisma: PrismaClient,
  domainId: string,
  event: WebhookEventType,
  data: WebhookPayload['data']
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: {
      domainId,
      active: true,
      events: { has: event },
    },
  });

  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const body = JSON.stringify(payload);

  for (const webhook of webhooks) {
    const signature = signPayload(body, webhook.secret);

    // Fire-and-forget — hata logla ama fırlatma
    fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentroy-Signature': signature,
        'X-Sentroy-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    }).catch((err) => {
      console.error(
        `[webhook] Failed to deliver ${event} to ${webhook.url}: ${err.message}`
      );
    });
  }
}

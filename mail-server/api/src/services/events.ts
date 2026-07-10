import { Redis } from 'ioredis';
import type { MailCategory } from './mail-categorizer';

/**
 * Mail delivered event'i — LMTP proxy yeni bir mesaj teslim ettiğinde fırlatır.
 * SSE endpoint bu kanalı dinleyip istemcilere stream eder.
 */
export interface MailDeliveredEvent {
  /** Teslim edilen mailbox (örn. "info@example.com") */
  mailbox: string;
  /** Hedef klasör (LMTP her zaman INBOX) */
  folder: string;
  /** Mesajın Message-ID header'ı — thread için */
  messageId?: string | null;
  /** Gönderen email + ad */
  from?: string | null;
  /** Konu satırı */
  subject?: string | null;
  /** Teslim zamanı (ISO) */
  arrivedAt: string;
  /** Otomatik kategorizasyon sonucu */
  category?: MailCategory;
}

export const MAIL_DELIVERED_CHANNEL = 'mail:delivered';

/**
 * Yeni bir Redis connection üretir — pub/sub için subscribe ve publish bağlantıları
 * ayrı olmalı (ioredis subscribe modundayken başka komut kabul etmez).
 */
export function publishMailDelivered(
  redis: Redis,
  event: MailDeliveredEvent,
): Promise<number> {
  return redis.publish(MAIL_DELIVERED_CHANNEL, JSON.stringify(event));
}

/**
 * Subscribe helper — callback'i `mail:delivered` kanalındaki her event için çağırır.
 * Döndürülen fonksiyon subscription'ı kapatır.
 */
export function subscribeMailDelivered(
  redisUrl: string,
  onEvent: (event: MailDeliveredEvent) => void,
): () => void {
  const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
  subscriber.subscribe(MAIL_DELIVERED_CHANNEL).catch((err) => {
    console.error('[events] Subscribe failed:', err);
  });
  subscriber.on('message', (channel, message) => {
    if (channel !== MAIL_DELIVERED_CHANNEL) return;
    try {
      const parsed = JSON.parse(message) as MailDeliveredEvent;
      onEvent(parsed);
    } catch (err) {
      console.error('[events] Invalid payload on', channel, err);
    }
  });
  return () => {
    subscriber.disconnect();
  };
}

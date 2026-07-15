import { ImapService } from './imap';
import type { MailCategory } from './mail-categorizer';

/**
 * Category stamper — LMTP proxy'nin teslimatta hesapladigi kategoriyi mesajin
 * uzerine IMAP custom keyword olarak damgalar ($CatPromotions vb.).
 *
 * Neden keyword: kategori mesajla birlikte yasar — klasor tasimalarinda
 * (3. parti IMAP client'lar dahil) kaybolmaz, kullanici degisikligi ayni
 * STORE mekanizmasidir, yeni depolama yuzeyi gerektirmez. Damga yoksa okuma
 * yolundaki categorize() fallback'i devreye girer; yani stamper'in kacirdigi
 * mesaj kategorisiz kalmaz, sadece override-kalici olmaz.
 *
 * Fire-and-forget: LMTP teslim yolunu ASLA beklemez/bloklamaz. Dovecot 250
 * dondukten sonra mesaj Maildir'dedir ama indekste gorunmesi milisaniyeler
 * alabilir — bulunamazsa kisa gecikmeyle bir kez daha denenir.
 */

const RETRY_DELAY_MS = 2_000;
const MAX_ATTEMPTS = 2;

export async function stampDeliveredCategory(opts: {
  mailbox: string;
  messageId: string | null;
  category: MailCategory;
}): Promise<void> {
  const { mailbox, messageId, category } = opts;
  // Message-ID yoksa aranamaz; primary'de keyword yoklugu zaten dogru durum.
  if (!messageId || category === 'primary') return;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const stamped = await withImap(mailbox, (imap) =>
        imap.stampCategoryByMessageId(messageId, category),
      );
      if (stamped) return;
    } catch (err) {
      console.warn(
        `[category-stamper] attempt ${attempt} failed for ${mailbox}:`,
        (err as Error).message,
      );
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  // Tum denemeler bitti — read-fallback kategoriyi yine gosterecek; sadece
  // damga kalici olmadi. Sessizce birak (mail-critical path degil).
}

async function withImap<T>(
  email: string,
  fn: (imap: ImapService) => Promise<T>,
): Promise<T> {
  const imap = new ImapService();
  await imap.init(email);
  try {
    return await fn(imap);
  } finally {
    imap.release();
  }
}

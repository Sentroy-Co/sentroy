/**
 * Mail Categorizer — gelen e-postalari baslik/gonderen/icerik analizi ile
 * sanal kategorilere ayirir.
 *
 * Kategoriler:
 *   - `promotions` — pazarlama, bulten, indirim, kampanya
 *   - `updates`    — guvenlik, hesap bildirimi, sifremi unuttum, giris onayı
 *   - `receipts`   — fatura, siparis, odeme, dekont
 *   - `social`     — sosyal medya bildirimleri
 *   - `primary`    — hicbir kurala uymayan kisisel/is e-postalari
 *
 * Strateji: header → sender → subject → body sirasinda taranir.
 * Ilk eslesen kural kategorisini belirler (short-circuit).
 */

export type MailCategory =
  | 'primary'
  | 'promotions'
  | 'updates'
  | 'receipts'
  | 'social';

export interface CategorizationInput {
  from?: string;
  subject?: string;
  headers?: Record<string, string>;
  /** Gelen mesajin In-Reply-To baslig — diyalog parcasiysa primary */
  inReplyTo?: string | null;
}

// ── Keyword / pattern catalogs ─────────────────────────────────────────────

const SOCIAL_DOMAINS = new Set([
  'facebookmail.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'pinterest.com',
  'reddit.com',
  'quora.com',
  'medium.com',
  'discord.com',
  'slack.com',
  'github.com',
  'youtube.com',
]);

const PROMO_SENDER_PATTERNS = [
  /^(marketing|news|newsletter|offers?|promo|campaign|deals|sales|info)@/i,
  /^no-?reply@/i, // no-reply singlealone → generic, ama List-Unsubscribe ile birlikte promosyon
];

const RECEIPT_SENDER_PATTERNS = [
  /^(billing|order|receipt|invoice|payment|transactions?|purchase|store|noreply.*(order|invoice|receipt))@/i,
];

const UPDATE_SENDER_PATTERNS = [
  /^(security|account|auth|verify|alert|notification|noreply.*(security|account|auth|verify))@/i,
];

const RECEIPT_SUBJECT_RE =
  /\b(invoice|receipt|fatura|sipari[sş]|[oö]deme|dekont|ekstre|order\s*confirm|purchase|transaction|payment\s*(received|confirm))\b/i;

const UPDATE_SUBJECT_RE =
  /\b(verify|do[gğ]rula|security\s*alert|g[uü]venlik|[sş]ifre\s*(s[ıi]f[ıi]rla|de[gğ]i[sş])|password\s*(reset|change)|new\s*sign.?in|yeni\s*giri[sş]|two.?factor|2fa|otp|login\s*(attempt|alert))\b/i;

const PROMO_SUBJECT_RE =
  /\b(sale|indirim|kampanya|f[ıi]rsat|off|discount|free\s*trial|unsubscribe|abonelik|special\s*offer|limited\s*time|coupon|kupon)\b/i;

// ── Categorizer ────────────────────────────────────────────────────────────

export function categorize(input: CategorizationInput): MailCategory {
  const { from = '', subject = '', headers = {}, inReplyTo } = input;

  // ── 0. Diyalog parcasi → primary (biri sana yazmis, sen cevaplayip karsilik almissin)
  if (inReplyTo) return 'primary';

  // ── 1. Header-based rules ──────────────────────────────────────────────

  const listUnsubscribe =
    headers['list-unsubscribe'] || headers['List-Unsubscribe'] || '';
  const precedence =
    (headers['precedence'] || headers['Precedence'] || '').toLowerCase();
  const autoSubmitted =
    (headers['auto-submitted'] || headers['Auto-Submitted'] || '').toLowerCase();

  // Bulk/list precedence → büyük ihtimal promo/newsletter
  const isBulk =
    precedence === 'bulk' || precedence === 'list' || !!listUnsubscribe;

  // Auto-generated system mail → updates
  if (autoSubmitted === 'auto-generated' || autoSubmitted === 'auto-replied') {
    // Ama receipt patterni varsa receipt
    if (RECEIPT_SUBJECT_RE.test(subject)) return 'receipts';
    return 'updates';
  }

  // ── 2. Sender domain → social ─────────────────────────────────────────
  const fromLower = from.toLowerCase();
  const fromDomain = fromLower.includes('@')
    ? fromLower.split('@').pop() || ''
    : '';

  // Domain listesinde direkt eslesen → social
  if (SOCIAL_DOMAINS.has(fromDomain)) return 'social';
  // Subdomain kontrolu (notification.facebook.com gibi)
  for (const sd of SOCIAL_DOMAINS) {
    if (fromDomain.endsWith(`.${sd}`)) return 'social';
  }

  // ── 3. Sender address pattern ─────────────────────────────────────────
  if (RECEIPT_SENDER_PATTERNS.some((re) => re.test(fromLower))) {
    return 'receipts';
  }

  if (UPDATE_SENDER_PATTERNS.some((re) => re.test(fromLower))) {
    return 'updates';
  }

  // ── 4. Subject keyword scan ───────────────────────────────────────────
  if (RECEIPT_SUBJECT_RE.test(subject)) return 'receipts';
  if (UPDATE_SUBJECT_RE.test(subject)) return 'updates';
  if (PROMO_SUBJECT_RE.test(subject)) return 'promotions';

  // ── 5. Bulk mail (List-Unsubscribe) + sender pattern → promotions ─────
  if (isBulk) {
    // Bulk + promo sender pattern → kesin promo
    if (PROMO_SENDER_PATTERNS.some((re) => re.test(fromLower))) {
      return 'promotions';
    }
    // Bulk ama belirli bir kategori degil — genel promosyon
    return 'promotions';
  }

  // ── 6. Genel promo sender pattern (List-Unsubscribe olmadan) ──────────
  // no-reply tek basina promo saymiyoruz; ama marketing@, offers@ vb. evet
  if (
    PROMO_SENDER_PATTERNS.some((re) => re.test(fromLower)) &&
    !/^no-?reply@/i.test(fromLower)
  ) {
    return 'promotions';
  }

  // ── 7. Varsayilan: primary ────────────────────────────────────────────
  return 'primary';
}

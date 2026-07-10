import crypto from 'crypto';

const TRACKING_SECRET = process.env.JWT_SECRET || 'sentroy-tracking-secret';

/**
 * Tracking token oluşturur — mailLogId'yi encode eder.
 * URL-safe base64 formatında.
 */
export function createTrackingToken(mailLogId: string): string {
  const data = JSON.stringify({ id: mailLogId, ts: Date.now() });
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    crypto.createHash('sha256').update(TRACKING_SECRET).digest(),
    Buffer.alloc(16, 0)
  );
  let encrypted = cipher.update(data, 'utf8', 'base64url');
  encrypted += cipher.final('base64url');
  return encrypted;
}

/**
 * Tracking token'ı decode eder → mailLogId döndürür.
 */
export function decodeTrackingToken(token: string): string | null {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      crypto.createHash('sha256').update(TRACKING_SECRET).digest(),
      Buffer.alloc(16, 0)
    );
    let decrypted = decipher.update(token, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');
    const parsed = JSON.parse(decrypted);
    return parsed.id || null;
  } catch {
    return null;
  }
}

/**
 * HTML'e open tracking pixel ekler.
 * </body> tagından önce 1x1 transparent pixel inject eder.
 */
export function injectOpenPixel(html: string, pixelUrl: string): string {
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;" />`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * HTML'deki tüm <a href> linklerini tracking proxy URL'leriyle değiştirir.
 * Unsubscribe linkleri ve mailto: linkleri hariç tutulur.
 */
export function rewriteLinks(
  html: string,
  baseUrl: string,
  token: string
): string {
  return html.replace(
    /<a\s+([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/gi,
    (match, before, url, after) => {
      // Unsubscribe linki veya tracking linki ise dokunma
      if (url.includes('unsubscribe') || url.includes('/t/')) {
        return match;
      }
      const encoded = encodeURIComponent(url);
      const trackUrl = `${baseUrl}/t/click/${token}?url=${encoded}`;
      return `<a ${before}href="${trackUrl}"${after}>`;
    }
  );
}

/**
 * List-Unsubscribe header'larını oluşturur (RFC 8058).
 */
export function getUnsubscribeHeaders(
  baseUrl: string,
  token: string
): Record<string, string> {
  const unsubUrl = `${baseUrl}/t/unsubscribe/${token}`;
  return {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

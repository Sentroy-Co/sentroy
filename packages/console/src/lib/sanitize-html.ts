import DOMPurify from "isomorphic-dompurify"

/**
 * HTML sanitizer (DOMPurify, isomorphic — hem server hem client çalışır).
 * `dangerouslySetInnerHTML` ile render edilen ya da DB'ye yazılan tüm
 * KULLANICI/LLM kaynaklı HTML buradan geçmeli (stored/reflected XSS koruması).
 *
 * `<script>`, `on*` event handler'ları, `javascript:`/`data:` URI'leri,
 * `<iframe>/<object>/<embed>` vb. çıkarılır; yaygın biçimlendirme + link +
 * img + tablo etiketleri korunur (email/template/landing içeriği için yeterli).
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ""
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } })
}

/**
 * Düz string VEYA lokalize `{ tr, en, … }` HTML map'ini sanitize et —
 * static-page/template gibi i18n içerikler için. String olmayan değerler
 * (number/boolean) olduğu gibi bırakılır.
 */
export function sanitizeHtmlValue<T extends string | Record<string, unknown>>(
  value: T,
): T {
  if (typeof value === "string") return sanitizeHtml(value) as T
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === "string" ? sanitizeHtml(v) : v
    }
    return out as T
  }
  return value
}

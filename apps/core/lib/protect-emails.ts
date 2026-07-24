/**
 * Statik sayfa (p/[slug]) içeriğindeki e-posta adreslerini bot scraper'lardan
 * korur. İçerik admin-yazımı HTML (DB); render'da `dangerouslySetInnerHTML`.
 *
 * Yaklaşım (contact RevealEmail deseniyle aynı ruh): e-postalar public GET
 * yanıtından ÇIKARILIR (`protectContent` → düz metin/mailto YOK; yerine indeksli
 * placeholder span). Gerçek adresler yalnız Cloudflare Turnstile geçilince
 * ayrı endpoint'ten (`extractEmails` ile yeniden çıkarılıp) döner. Böylece ne
 * HTML'de ne de public API yanıtında düz e-posta bulunur.
 */

export type LocalizedContent = Record<string, string> | string

// mailto anchor'ı (href'ten adresi al) VEYA çıplak e-posta. Alternation +
// tek geçiş → adresler BELGE SIRASINDA indekslenir (client span sırası ile
// reveal dizisi birebir eşleşsin). `gi`: case-insensitive, global.
const EMAIL_CORE = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
const RE = new RegExp(
  // 1) <a ... href="mailto:ADRES[?params]" ...>metin</a>
  "<a\\b[^>]*\\bhref\\s*=\\s*[\"']mailto:([^\"'?\\s]+)[^\"']*[\"'][^>]*>[\\s\\S]*?</a>" +
    "|" +
    // 2) çıplak e-posta
    "(" + EMAIL_CORE + ")",
  "gi",
)

const PLACEHOLDER = "•••@•••" // •••@•••

/**
 * HTML'deki e-postaları indeksli placeholder span'lerle değiştir; adresleri
 * belge sırasında topla. `safeHtml` düz e-posta İÇERMEZ.
 */
export function splitEmails(html: string): { safeHtml: string; emails: string[] } {
  const emails: string[] = []
  const safeHtml = html.replace(RE, (match, mailtoAddr?: string, bare?: string) => {
    const email = (mailtoAddr ?? bare ?? "").trim()
    if (!email) return match
    const idx = emails.length
    emails.push(email)
    return `<span class="sp-email" data-sp-idx="${idx}">${PLACEHOLDER}</span>`
  })
  return { safeHtml, emails }
}

/** İçeriğin her locale varyantından e-postaları çıkar (string veya {lang:...}). */
export function protectContent(content: LocalizedContent): LocalizedContent {
  if (typeof content === "string") return splitEmails(content).safeHtml
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(content)) {
    out[k] = typeof v === "string" ? splitEmails(v).safeHtml : (v as string)
  }
  return out
}

/** Görsel olarak boş mu? (tag/entity/whitespace strip sonrası — editörde açılıp
 *  boş bırakılmış `<p></p>`/`<br>`/`&nbsp;` "dolu görünen ama boş" varyantı yok say.) */
function isBlank(v: unknown): boolean {
  if (typeof v !== "string") return true
  return v.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, "").trim() === ""
}

/**
 * Lokalize içeriği çöz — **BASE DİL İNGİLİZCE**. İstenen dil yoksa VEYA boş
 * (editörde açılıp bırakılmış boş HTML) ise `en`'e düşer; `en` de yoksa ilk DOLU
 * varyant. Düz string aynen döner. Client (static-page) + server (extractEmails)
 * AYNI mantığı kullanır → korumalı e-posta span sırası birebir eşleşir.
 */
export function resolveLocalized(content: LocalizedContent, lang: string): string {
  if (typeof content === "string") return content
  const want = content[lang]
  if (!isBlank(want)) return want as string
  if (!isBlank(content.en)) return content.en as string
  const first = Object.values(content).find((v) => !isBlank(v))
  return typeof first === "string" ? first : ""
}

/** Belirli bir dil için e-posta dizisini (belge sırasında) döndür — reveal endpoint. */
export function extractEmails(content: LocalizedContent, lang: string): string[] {
  return splitEmails(resolveLocalized(content, lang)).emails
}

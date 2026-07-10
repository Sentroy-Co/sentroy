import { createHash } from "node:crypto"

/**
 * HaveIBeenPwned Pwned Passwords v3 API client.
 *
 * **Privacy model (k-anonymity):**
 * Plaintext password DB'sini upstream'e ASLA göndermiyoruz. Yerine
 * SHA-1 hash'in ilk 5 char'ını GET parametresi olarak gönderiyoruz —
 * upstream o prefix'li tüm hash suffix'lerini + count'larını döner.
 * Sentroy match'i kendi tarafında yapar. Upstream "alice@example.com'un
 * password'ü nedir" diye bilemez, sadece "31d6c hash prefix'ine başlayan
 * password sorgulandı" gibi anonim bilgi alır.
 *
 * SHA-1 brute-force güvenliği zayıf ama burada bu önemli değil — HIBP
 * v3 API'sinin protocol'ü bu. Sentroy kendi password storage'ı argon2id.
 *
 * **Failure behavior:**
 * HIBP upstream down / timeout → "open" (breach kontrolü yapamadık,
 * password'ü reject etme). Auth kritik path'i — upstream outage user'ı
 * locked out etmemeli.
 *
 * Reference: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

const HIBP_BASE = "https://api.pwnedpasswords.com/range"
const TIMEOUT_MS = 3000
const USER_AGENT = "sentroy-auth/1.0 (+https://sentroy.com)"

export interface PwnedCheckResult {
  /** Password breach DB'sinde bulundu mu. */
  breached: boolean
  /** Bulunduysa kaç farklı breach'de göründü (HIBP'in raporladığı count).
   *  Reject mesajında "this password has appeared in N breaches" gibi
   *  end-user'a feedback için. */
  count: number
  /** Kontrol yapılabildiyse true; upstream fail / timeout durumunda false
   *  (kontrol skipped, breached=false default ile geçti). */
  checked: boolean
}

/**
 * Password'ü HIBP breach DB'sine karşı kontrol et. k-anonymity ile
 * yalnız SHA-1 prefix gönderilir.
 *
 * Opsiyonel `minCount`: bazı password'ler 1-2 kere göründü (false-positive
 * gibi); production'da minCount=3 yapılınca sadece "popular" leaked
 * password'ler reject edilir. Default 1 (paranoid mode).
 */
export async function checkPwnedPassword(
  plaintext: string,
  opts: { minCount?: number } = {},
): Promise<PwnedCheckResult> {
  if (!plaintext || typeof plaintext !== "string") {
    return { breached: false, count: 0, checked: false }
  }

  const hash = createHash("sha1").update(plaintext, "utf8").digest("hex").toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  const minCount = opts.minCount ?? 1

  try {
    const res = await fetch(`${HIBP_BASE}/${prefix}`, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        // "Add-Padding: true" — response'a noise eklenir, network observer
        // hangi prefix sorulduğunu sayım'dan çıkaramaz (extra privacy).
        "Add-Padding": "true",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      return { breached: false, count: 0, checked: false }
    }
    const text = await res.text()
    // Format: "<SUFFIX>:<COUNT>\r\n..."
    for (const line of text.split("\n")) {
      const [lineSuffix, lineCountRaw] = line.trim().split(":")
      if (lineSuffix === suffix) {
        const count = Number.parseInt(lineCountRaw ?? "0", 10) || 0
        return { breached: count >= minCount, count, checked: true }
      }
    }
    return { breached: false, count: 0, checked: true }
  } catch {
    // Network/timeout — fail open. Auth path'i breach service down'ı
    // ile blok edilmemeli.
    return { breached: false, count: 0, checked: false }
  }
}

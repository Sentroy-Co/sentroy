import { createPrivateKey, createSign, type KeyObject } from "node:crypto"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"
import type { DomainConnectSettings, TemplateVars } from "./types"

const PROVIDER_ID = "sentroy.com"
const SERVICE_ID = "email-setup"

/**
 * Env-supplied PEM'i temizler: wrapping quote'ları, literal `\n` kaçışlarını,
 * CRLF'i ve dış whitespace'i normalize eder. Coolify/shell ortamlarında
 * env değerleri bazen escape'li, bazen quote'lu, bazen CRLF ile gelir;
 * hepsini OpenSSL'in beklediği LF-only PEM'e indirgeriz.
 */
function normalizePem(raw: string): string {
  let pem = raw.trim()
  // Wrapping quotes (örn. Coolify env input bazen ekler)
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1).trim()
  }
  // Literal \n / \r\n → gerçek newline
  if (pem.includes("\\n")) pem = pem.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
  // CRLF → LF (OpenSSL parser CRLF'le boğuluyor)
  pem = pem.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  return pem
}

/**
 * Domain Connect signed-sync flow için private key'i hem cleanse eder
 * hem de OpenSSL ile parse eder; `KeyObject` döner ki imzalama yolunda
 * her seferinde re-parse olmasın.
 *
 * `DOMAIN_CONNECT_KEY_ID` Cloudflare validation aşamasında
 * `<keyId>.sentroy.com` TXT lookup'ı için kullanılan label —
 * default "_dcpubkeyv1" (TXT kaydı `_dcpubkeyv1.sentroy.com`'da).
 *
 * Parse fail olursa null döner ve sebebi log'a yazar — user route
 * tarafında `signing_failed` reason'ı görür, sessiz silently bypass yok.
 */
let cachedSigning: { privateKey: KeyObject; keyId: string } | null = null
let cacheKey = ""

async function loadSigningConfig(): Promise<
  { privateKey: KeyObject; keyId: string } | null
> {
  // Üç env desteği — sırasıyla öncelik:
  //   1. `DOMAIN_CONNECT_PRIVATE_KEY_B64` — açıkça base64. Newline /
  //      quote escape yok, copy-paste güvenli. Önerilen.
  //   2. `DOMAIN_CONNECT_PRIVATE_KEY` — değer PEM ya da base64 olabilir.
  //      Auto-detect: `-----BEGIN` header'ı varsa PEM, yoksa base64
  //      decode dene. Kullanıcı yanlış env adına base64 koysa bile
  //      çalışır.
  const b64Explicit = await getEnvWithFallback("DOMAIN_CONNECT_PRIVATE_KEY_B64")
  const direct = await getEnvWithFallback("DOMAIN_CONNECT_PRIVATE_KEY")
  const keyId =
    (await getEnvWithFallback("DOMAIN_CONNECT_KEY_ID")) || "_dcpubkeyv1"

  let raw: string | undefined
  if (b64Explicit) {
    raw = Buffer.from(b64Explicit.trim(), "base64").toString("utf8")
  } else if (direct) {
    const trimmed = direct.trim()
    // PEM her zaman `-----BEGIN ...` ile başlar. Yoksa base64 sayılır.
    if (trimmed.includes("-----BEGIN")) {
      raw = direct
    } else {
      try {
        raw = Buffer.from(trimmed, "base64").toString("utf8")
      } catch {
        raw = direct // base64 decode fail, raw'ı bırak; sonraki parse aşaması log'lar
      }
    }
  }
  if (!raw) return null

  // Aynı raw için tekrar parse etmeyelim — env değişince cache invalidate.
  const fingerprint = `${raw.length}:${keyId}`
  if (cachedSigning && cacheKey === fingerprint) return cachedSigning

  const pem = normalizePem(raw)

  if (!pem.includes("-----BEGIN")) {
    console.error(
      "[domain-connect] DOMAIN_CONNECT_PRIVATE_KEY missing PEM header — " +
        `raw length=${raw.length}, normalized length=${pem.length}, ` +
        `starts with="${pem.slice(0, 40)}..."`,
    )
    return null
  }

  try {
    // PKCS#1 (`BEGIN RSA PRIVATE KEY`) ve PKCS#8 (`BEGIN PRIVATE KEY`)
    // ikisi de Node OpenSSL ile parse olur; format'ı `pem` olarak
    // veriyoruz, parser kendi tip tespiti yapıyor.
    const privateKey = createPrivateKey({ key: pem, format: "pem" })
    cachedSigning = { privateKey, keyId }
    cacheKey = fingerprint
    return cachedSigning
  } catch (err) {
    console.error(
      "[domain-connect] private key parse failed: " +
        (err instanceof Error ? err.message : String(err)) +
        ` — pem head="${pem.split("\n")[0]}", line count=${pem.split("\n").length}`,
    )
    return null
  }
}

/**
 * Build the synchronous apply URL for Domain Connect.
 * The DNS provider will show the user the exact changes and ask for approval.
 *
 * **Signed flow:** when `DOMAIN_CONNECT_PRIVATE_KEY` is set, the query string
 * (without `sig`/`key`) is signed with RSA-SHA256 and the signature + key
 * identifier are appended. Cloudflare (and other DNS providers using signed
 * sync flow) validate the signature against the TXT record at
 * `<keyId>.<syncPubKeyDomain>` — for Sentroy that's `_dcpubkeyv1.sentroy.com`,
 * which holds the public half of this private key.
 *
 * Without the env var the URL stays unsigned — DNS providers that don't
 * require signatures (most do during onboarding test phase) still work.
 */
export async function buildApplyUrl(
  settings: DomainConnectSettings,
  domain: string,
  vars: TemplateVars,
  redirectUri: string,
): Promise<string> {
  const base = settings.urlSyncUX.replace(/\/+$/, "")
  const path = `/v2/domainTemplates/providers/${PROVIDER_ID}/services/${SERVICE_ID}/apply`

  const params = new URLSearchParams({
    domain,
    serverIp: vars.serverIp,
    dkimSelector: vars.dkimSelector,
    dkimPublicKey: vars.dkimPublicKey,
    dmarcEmail: vars.dmarcEmail,
    redirect_uri: redirectUri,
    providerName: "Sentroy",
  })

  // Signed flow: tam olarak provider'ın fetch ettiği URL-encoded query
  // string'i imzalıyoruz (sig + key hariç). DNS provider tarafında ters
  // hesaplama: query string'i parse et, sig+key'i çıkar, kalan stringi
  // public key ile verify et. Ekleme sırası kritik değil çünkü provider
  // sig/key'i name ile çıkarıyor; biz append ettikten sonra toString
  // tekrar serialize ediyor — bu serialize edilmiş haliyle wire'a
  // gidiyor, provider da o haliyle geriye doğru ayrıştırıyor.
  const signing = await loadSigningConfig()
  if (signing) {
    try {
      const toSign = params.toString()
      const signer = createSign("RSA-SHA256")
      signer.update(toSign)
      signer.end()
      const sig = signer.sign(signing.privateKey, "base64")
      params.append("sig", sig)
      params.append("key", signing.keyId)
    } catch (err) {
      // Sign() başlı başına parse'ı başarmış key üzerinde fail ederse
      // (örn. RSA olmayan key, çok kısa key) — bu noktayı ayrı throw'la
      // çünkü key parse OK ama imza math fail. Caller catch eder, route
      // signing_failed reason'ı döner.
      const cause = err instanceof Error ? err.message : String(err)
      throw new Error(`signing_failed:${cause}`)
    }
  }

  return `${base}${path}?${params.toString()}`
}

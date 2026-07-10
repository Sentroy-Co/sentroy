import type { SentroyApp } from "@workspace/db/types"
import { serverRootDomain } from "@workspace/auth/lib/domains"

/**
 * C1 — self-host uyumluluk kapısı (capability-POSITIVE).
 *
 * Sorun: self-host instance'lar embed-token'ı KENDİ per-instance issuer'ıyla
 * imzalar. Backend'i yalnız auth.sentroy.com JWKS'ine güvenen bir app self-host'ta
 * sessizce 401 verir. Çözüm: self-host'ta yalnız authMode="none" VEYA
 * `supportsSelfHostedIssuers===true` app'leri sun.
 *
 * `hostedOnly` yalnız ADVISORY görüntü metadata'sıdır — kapı DEĞİL.
 * Bilinmeyen/undefined capability = FALSE (hosted-only) → güvenli varsayılan.
 */

/**
 * Bu instance hosted (sentroy.com) mı? embed-token issuer'ı app'lerin güvendiği
 * issuer'sa true. Determinant: açık SENTROY_HOSTED flag'i > serverRootDomain()
 * === "sentroy.com". (APP_REGISTRY_ENABLED'a BAKMAYIZ — dogfood'da sentroy.com
 * da sync eder ama yine hosted'dır.)
 */
export function isHostedInstance(): boolean {
  const flag = process.env.SENTROY_HOSTED
  if (flag !== undefined && flag.trim() !== "") {
    return /^(1|true|on|yes)$/i.test(flag.trim())
  }
  return serverRootDomain() === "sentroy.com"
}

/**
 * Bu instance bu app'i güvenle sunabilir mi? Hosted → her zaman true. Self-host
 * → authMode="none" VEYA supportsSelfHostedIssuers===true.
 */
export function isSelfHostCapable(
  app: Pick<SentroyApp, "authMode" | "supportsSelfHostedIssuers">,
  opts?: { isHosted?: boolean },
): boolean {
  const hosted = opts?.isHosted ?? isHostedInstance()
  if (hosted) return true
  if (app.authMode === "none") return true
  return app.supportsSelfHostedIssuers === true
}

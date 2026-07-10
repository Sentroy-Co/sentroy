import type { SentroyAppManifest } from "@workspace/app-manifest"

/**
 * App Store iframe güvenlik attribute'larını SERVER-side hesaplar. ⚠ Bu
 * değerler `SentroyApp` kaydına yazılır; runtime descriptor BUNLARDAN kurulur,
 * ham manifest'ten DEĞİL — kötü-niyetli bir manifest client'ta privilege
 * genişletemesin diye.
 *
 * ASLA verilmeyen sandbox token'ları: `allow-top-navigation` (clickjacking),
 * `allow-modals` (sahte OS-modal / phishing). `allow-same-origin` GÜVENLİ:
 * iframe farklı bir origin olduğundan app'e KENDİ origin'ini verir, Sentroy'un
 * origin'ini değil.
 */

export function computeSandboxAttr(m: SentroyAppManifest, visibility: "public" | "private"): string {
  const tokens = ["allow-scripts", "allow-same-origin"]
  const sb = m.embed.sandbox
  // allowForms default true (form gönderimi yaygın); açıkça false ise kapat.
  if (sb?.allowForms !== false) tokens.push("allow-forms")
  // popups/downloads yalnız onaylı + public app'lerde; private (unverified) daha sıkı.
  if (visibility === "public" && sb?.allowPopups) tokens.push("allow-popups")
  if (visibility === "public" && sb?.allowDownloads) tokens.push("allow-downloads")
  return tokens.join(" ")
}

export function computeAllowAttr(_m: SentroyAppManifest, _visibility: "public" | "private"): string {
  // v1: yalnız clipboard-write. camera/mic/geolocation/payment ASLA.
  return "clipboard-write"
}

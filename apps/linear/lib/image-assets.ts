/**
 * Satır içi (editör) görseller için Sentroy URL eşlemesi
 * (triage image-assets.server.ts portu — SQLite yerine Mongo
 * `linear_image_assets`, company-scoped).
 *
 * Sorun: Linear, açıklama gövdesine gömülen DIŞ KAYNAKLI görselleri kendi
 * CDN'ine içe aktarıyor (re-host) ve markdown'daki URL'i `uploads.linear.app`
 * ile değiştiriyor — bu URL auth-gated olduğundan Linear oturumu olmayan
 * (proxy) kullanıcılarda görsel kırılıyor ve Sentroy'un public-CDN amacı
 * boşa çıkıyor.
 *
 * Çözüm: Yüklemede bir token üretip `token → { url, previewUrl }` eşlemesini
 * Mongo'da tutarız. Editör token'ı görselin markdown `alt`'ına gömer
 * (`![sntr_…](url)`). Linear re-host sırasında URL'i değiştirir ama ALT METNİNİ
 * KORUR (empirik olarak doğrulandı). Açıklamayı kendi tarafımızda render
 * ederken token'lı görsellerin URL'sini orijinal Sentroy (public, optimize)
 * URL'iyle geri değiştiririz — sıra/zamanlama bağımlılığı olmadan.
 *
 * ⚠️ Triage'daki sync (better-sqlite3) API'nin aksine bu fonksiyonlar ASYNC —
 * çağıran route'lar await etmeli.
 */
import { linearImageAssetModel } from "@workspace/db/models"

/** Markdown alt + token için ortak önek (regex ve gömme tek kaynaktan). */
export const IMAGE_TOKEN_PREFIX = "sntr_"

/**
 * Yeni yükleme için token üretir, Sentroy URL'leriyle eşler ve token'ı döner.
 * Token editörde görselin `alt`'ına gömülür.
 */
export async function registerImageAsset(
  companyId: string,
  url: string,
  previewUrl: string,
): Promise<string> {
  const asset = await linearImageAssetModel.create({
    companyId,
    url,
    previewUrl,
  })
  return asset.token
}

// ![sntr_<hex>](url) ya da ![sntr_<hex>](url "title")
const IMG_RE = /!\[(sntr_[a-f0-9]+)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?)\s*\)/g

/**
 * Açıklama markdown'undaki token'lı görsellerin URL'sini Sentroy önizleme
 * URL'iyle değiştirir (Linear re-host'unu geri çevirir). Token bilinmiyorsa
 * görsel olduğu gibi bırakılır. Hızlı yol: token öneki yoksa dokunmaz.
 * Tenant izolasyonu: yalnız bu şirketin token'ları çözülür.
 */
export async function remapDescriptionImages(
  companyId: string,
  markdown: string,
): Promise<string> {
  if (!markdown || !markdown.includes(IMAGE_TOKEN_PREFIX)) return markdown

  // Önce token'ları topla, tek sorguda çöz (per-token round-trip yok).
  const tokens = new Set<string>()
  for (const match of markdown.matchAll(IMG_RE)) {
    tokens.add(match[1])
  }
  if (tokens.size === 0) return markdown

  const assets = await linearImageAssetModel.findByTokens(companyId, [
    ...tokens,
  ])
  if (assets.length === 0) return markdown
  const byToken = new Map(assets.map((a) => [a.token, a]))

  return markdown.replace(
    IMG_RE,
    (full, token: string, _url: string, title: string) => {
      const row = byToken.get(token)
      if (!row) return full
      return `![${token}](${row.previewUrl ?? row.url}${title || ""})`
    },
  )
}

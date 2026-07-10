import { pickPresetThumbnailUrl, type Media } from "@sentroy-co/client-sdk"

/**
 * Media list API çoğu kayıtta `url` / `downloadUrl` döndürmez; grid yine de
 * thumbnail CDN URL'leriyle çalışır. Picker confirm'te consumer'a geçirilecek
 * adresi burada üretiriz.
 */
export function resolveMediaPickUrl(raw: Media): string | undefined {
  const direct = raw.url?.trim()
  if (direct) return direct
  const dl = raw.downloadUrl?.trim()
  if (dl) {
    if (/^https?:\/\//i.test(dl)) return dl
    if (typeof window !== "undefined" && dl.startsWith("/")) {
      return `${window.location.origin}${dl}`
    }
  }
  const fromThumb = pickPresetThumbnailUrl(raw, "hero")
  if (fromThumb) {
    if (/^https?:\/\//i.test(fromThumb)) return fromThumb
    if (typeof window !== "undefined" && fromThumb.startsWith("/")) {
      return `${window.location.origin}${fromThumb}`
    }
  }
  return undefined
}

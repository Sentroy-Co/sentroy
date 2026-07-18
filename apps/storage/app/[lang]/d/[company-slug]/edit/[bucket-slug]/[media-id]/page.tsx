import { EditEmbedClient } from "./edit-embed-client"

/**
 * Authed dosya editörü embed sayfası — `[company-slug]` layout'u session +
 * company erişimini zorlar (WebView `.sentroy.com` cookie'sini enjekte eder).
 * `?embed&name=<file>&mime=<mime>` ile açılır; içerik `media-id`'nin download
 * route'undan gelir. Dosya adı dil/tip çıkarımı için query'den okunur (server
 * fetch gerekmez — çağıran zaten adı biliyor).
 */
export default async function EditEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{
    "company-slug": string
    "bucket-slug": string
    "media-id": string
  }>
  searchParams: Promise<{ name?: string; mime?: string }>
}) {
  const p = await params
  const sp = await searchParams
  return (
    <EditEmbedClient
      companySlug={p["company-slug"]}
      bucketSlug={p["bucket-slug"]}
      mediaId={p["media-id"]}
      fileName={sp.name || "file.txt"}
      mimeType={sp.mime}
    />
  )
}

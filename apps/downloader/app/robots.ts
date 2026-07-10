import type { MetadataRoute } from "next"
import { headers } from "next/headers"

// REQUEST-TIME host-aware — robots her host'ta kendi sitemap'ini gösterir.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") || "youtube.sentroy.com"
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"
  const base = `${proto}://${host}`
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}

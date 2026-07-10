import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { LOCALES, routing, type Locale } from "@/i18n/routing"
import { platformFromHost, siteSection } from "@/lib/platform"
import { BLOG_TOPICS, topicLocales } from "@/lib/blog/topics"
import { blogUrl, blogIndexPath } from "@/lib/blog/url"
import { TOOLS, toolLocales } from "@/lib/tools/registry"
import { TOOL_BLOG_POSTS } from "@/lib/tools/blog"

// REQUEST-TIME host-aware: her subdomain yalnız kendi bölümünün sayfalarını
// listeler (tools.→tool sayfaları, youtube.→youtube blog'u). Sızma yok.
function baseUrl(host: string | null): string {
  const h = host || "youtube.sentroy.com"
  const proto = h.startsWith("localhost") || h.startsWith("127.") ? "http" : "https"
  return `${proto}://${h}`
}
function pathFor(l: Locale, slug: string): string {
  return l === routing.defaultLocale ? `/${slug}` : `/${l}/${slug}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host")
  const BASE = baseUrl(host)
  const section = siteSection(host)
  const entries: MetadataRoute.Sitemap = []

  // Ana sayfa (her dil) — her iki bölümde.
  const homeLangs: Record<string, string> = {}
  for (const l of LOCALES) homeLangs[l] = l === routing.defaultLocale ? `${BASE}/` : `${BASE}/${l}`
  for (const l of LOCALES) {
    entries.push({
      url: homeLangs[l]!,
      changeFrequency: "weekly",
      priority: l === routing.defaultLocale ? 1 : 0.8,
      alternates: { languages: homeLangs },
    })
  }

  // ── tools.sentroy.com → LIVE araç sayfaları + rehber/blog ──
  if (section === "tools") {
    for (const tool of TOOLS) {
      if (tool.status !== "live") continue
      const locales = toolLocales(tool)
      const langs: Record<string, string> = {}
      for (const l of locales) langs[l] = `${BASE}${pathFor(l, tool.locales[l]!.slug)}`
      for (const l of locales) {
        entries.push({
          url: `${BASE}${pathFor(l, tool.locales[l]!.slug)}`,
          changeFrequency: "weekly",
          priority: 0.8,
          alternates: { languages: langs },
        })
      }
    }

    // Rehber/blog indeksi (her dil) + post'lar (slug global, içerik en-fallback).
    const guidesLangs: Record<string, string> = {}
    for (const l of LOCALES) guidesLangs[l] = `${BASE}${blogIndexPath(l)}`
    for (const l of LOCALES) {
      entries.push({
        url: `${BASE}${blogIndexPath(l)}`,
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: { languages: guidesLangs },
      })
    }
    for (const post of TOOL_BLOG_POSTS) {
      const langs: Record<string, string> = {}
      for (const l of LOCALES) langs[l] = `${BASE}${pathFor(l, post.slug)}`
      for (const l of LOCALES) {
        entries.push({
          url: `${BASE}${pathFor(l, post.slug)}`,
          changeFrequency: "monthly",
          priority: 0.7,
          alternates: { languages: langs },
        })
      }
    }
    return entries
  }

  // ── download bölümü (youtube/instagram/…) → blog index + faq + topic'ler ──
  const PLATFORM = platformFromHost(host)

  const blogLangs: Record<string, string> = {}
  for (const l of LOCALES) blogLangs[l] = `${BASE}${blogIndexPath(l)}`
  for (const l of LOCALES) {
    entries.push({
      url: `${BASE}${blogIndexPath(l)}`,
      changeFrequency: "weekly",
      priority: 0.6,
      alternates: { languages: blogLangs },
    })
  }

  const faqPath = (l: Locale) => (l === routing.defaultLocale ? "/faq" : `/${l}/faq`)
  const faqLangs: Record<string, string> = {}
  for (const l of LOCALES) faqLangs[l] = `${BASE}${faqPath(l)}`
  for (const l of LOCALES) {
    entries.push({
      url: `${BASE}${faqPath(l)}`,
      changeFrequency: "monthly",
      priority: 0.5,
      alternates: { languages: faqLangs },
    })
  }

  for (const topic of BLOG_TOPICS) {
    if (topic.platform !== PLATFORM) continue
    const locales = topicLocales(topic)
    const langs: Record<string, string> = {}
    for (const l of locales) langs[l] = blogUrl(BASE, l, topic.locales[l]!.slug)
    for (const l of locales) {
      entries.push({
        url: blogUrl(BASE, l, topic.locales[l]!.slug),
        changeFrequency: "monthly",
        priority: 0.7,
        alternates: { languages: langs },
      })
    }
  }

  return entries
}

import type { Locale } from "@/i18n/routing"
import type { Platform } from "@/lib/platform"
import { TRANSLATED_TOPIC_LOCALES } from "./topics-i18n.generated"

/**
 * SEO "tuzak sayfa" topic registry. Her topic bir hedef anahtar kelimedir;
 * içerik motoru (engine.ts) cümle bankasından (banks/<lang>.ts) makaleyi kurar.
 *
 * Her topic, dil başına {slug, keyword, title} taşır. Önce tr + en dolduruldu;
 * diğer 8 dil çeviri workflow'u ile eklenecek (her topic'in `locales`'ine yeni
 * dil anahtarı eklenir). Bir dil için kayıt yoksa o dilde sayfa üretilmez.
 *
 * `slug` site genelinde benzersiz olmalı (`/[lang]/[slug]` route'u). Makale
 * sayfası, host'tan çözülen platform ile `topic.platform`'u karşılaştırır;
 * eşleşmezse 404 (instagram topic'i youtube.sentroy.com'da görünmez).
 */
export interface BlogTopicLocale {
  /** URL slug — yerelleştirilmiş, benzersiz (örn. "youtube-video-indir"). */
  slug: string
  /** Birincil hedef anahtar kelime (metinlere gömülür). */
  keyword: string
  /** H1 / başlık. */
  title: string
}

export interface BlogTopic {
  /** Kalıcı id — seed + hreflang gruplaması için (dile bağlı değil). */
  id: string
  platform: Platform
  locales: Partial<Record<Locale, BlogTopicLocale>>
}

export const BLOG_TOPICS: BlogTopic[] = [
  // ── YouTube ────────────────────────────────────────────────────────────────
  {
    id: "yt-video-download",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-video-indir", keyword: "youtube video indir", title: "YouTube Video İndir" },
      en: { slug: "youtube-video-downloader", keyword: "youtube video downloader", title: "YouTube Video Downloader" },
    },
  },
  {
    id: "yt-to-mp3",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-mp3-indir", keyword: "youtube mp3 indir", title: "YouTube MP3 İndir" },
      en: { slug: "youtube-to-mp3", keyword: "youtube to mp3", title: "YouTube to MP3" },
    },
  },
  {
    id: "yt-mp3-converter",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-mp3-donusturucu", keyword: "youtube mp3 dönüştürücü", title: "YouTube MP3 Dönüştürücü" },
      en: { slug: "youtube-mp3-converter", keyword: "youtube mp3 converter", title: "YouTube MP3 Converter" },
    },
  },
  {
    id: "yt-mp4-download",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-mp4-indir", keyword: "youtube mp4 indir", title: "YouTube MP4 İndir" },
      en: { slug: "download-youtube-mp4", keyword: "download youtube mp4", title: "Download YouTube MP4" },
    },
  },
  {
    id: "yt-music-download",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-muzik-indir", keyword: "youtube müzik indir", title: "YouTube Müzik İndir" },
      en: { slug: "youtube-music-download", keyword: "youtube music download", title: "YouTube Music Download" },
    },
  },
  {
    id: "yt-1080p",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-1080p-indir", keyword: "youtube 1080p video indir", title: "YouTube 1080p Video İndir" },
      en: { slug: "download-youtube-1080p", keyword: "download youtube 1080p", title: "Download YouTube 1080p" },
    },
  },
  {
    id: "yt-shorts",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-shorts-indir", keyword: "youtube shorts indir", title: "YouTube Shorts İndir" },
      en: { slug: "youtube-shorts-downloader", keyword: "youtube shorts downloader", title: "YouTube Shorts Downloader" },
    },
  },
  {
    id: "yt-audio",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-ses-indir", keyword: "youtube ses indir", title: "YouTube Ses İndir" },
      en: { slug: "youtube-audio-download", keyword: "youtube audio download", title: "YouTube Audio Download" },
    },
  },
  {
    id: "yt-free-downloader",
    platform: "youtube",
    locales: {
      tr: { slug: "ucretsiz-youtube-indirici", keyword: "ücretsiz youtube indirici", title: "Ücretsiz YouTube İndirici" },
      en: { slug: "free-youtube-downloader", keyword: "free youtube downloader", title: "Free YouTube Downloader" },
    },
  },
  {
    id: "yt-to-mp4-converter",
    platform: "youtube",
    locales: {
      tr: { slug: "youtube-mp4-donusturucu", keyword: "youtube mp4 dönüştürücü", title: "YouTube MP4 Dönüştürücü" },
      en: { slug: "youtube-to-mp4-converter", keyword: "youtube to mp4 converter", title: "YouTube to MP4 Converter" },
    },
  },

  // ── Instagram (subdomain henüz canlı değil — hazır) ─────────────────────────
  {
    id: "ig-reels-download",
    platform: "instagram",
    locales: {
      tr: { slug: "instagram-reels-indir", keyword: "instagram reels indir", title: "Instagram Reels İndir" },
      en: { slug: "instagram-reels-downloader", keyword: "instagram reels downloader", title: "Instagram Reels Downloader" },
    },
  },
  {
    id: "ig-video-download",
    platform: "instagram",
    locales: {
      tr: { slug: "instagram-video-indir", keyword: "instagram video indir", title: "Instagram Video İndir" },
      en: { slug: "instagram-video-downloader", keyword: "instagram video downloader", title: "Instagram Video Downloader" },
    },
  },
  {
    id: "ig-photo-download",
    platform: "instagram",
    locales: {
      tr: { slug: "instagram-fotograf-indir", keyword: "instagram fotoğraf indir", title: "Instagram Fotoğraf İndir" },
      en: { slug: "instagram-photo-download", keyword: "instagram photo download", title: "Instagram Photo Download" },
    },
  },
  {
    id: "ig-story-download",
    platform: "instagram",
    locales: {
      tr: { slug: "instagram-story-indir", keyword: "instagram story indir", title: "Instagram Story İndir" },
      en: { slug: "instagram-story-download", keyword: "instagram story download", title: "Instagram Story Download" },
    },
  },
  {
    id: "ig-profile-pic",
    platform: "instagram",
    locales: {
      tr: { slug: "instagram-profil-resmi-indir", keyword: "instagram profil resmi indir", title: "Instagram Profil Resmi İndir" },
      en: { slug: "instagram-profile-picture-download", keyword: "instagram profile picture download", title: "Instagram Profile Picture Download" },
    },
  },
  {
    id: "ig-dp-download",
    platform: "instagram",
    locales: {
      tr: { slug: "instagram-dp-indir", keyword: "instagram dp indir", title: "Instagram DP İndir" },
      en: { slug: "instagram-dp-download", keyword: "instagram dp download", title: "Instagram DP Download" },
    },
  },
  {
    id: "ig-carousel-download",
    platform: "instagram",
    locales: {
      tr: { slug: "instagram-carousel-indir", keyword: "instagram carousel indir", title: "Instagram Carousel İndir" },
      en: { slug: "instagram-carousel-download", keyword: "instagram carousel download", title: "Instagram Carousel Download" },
    },
  },

  // ── SoundCloud (subdomain henüz canlı değil — hazır) ────────────────────────
  {
    id: "sc-to-mp3",
    platform: "soundcloud",
    locales: {
      tr: { slug: "soundcloud-mp3-indir", keyword: "soundcloud mp3 indir", title: "SoundCloud MP3 İndir" },
      en: { slug: "soundcloud-to-mp3", keyword: "soundcloud to mp3", title: "SoundCloud to MP3" },
    },
  },
  {
    id: "sc-track-download",
    platform: "soundcloud",
    locales: {
      tr: { slug: "soundcloud-sarki-indir", keyword: "soundcloud şarkı indir", title: "SoundCloud Şarkı İndir" },
      en: { slug: "soundcloud-track-downloader", keyword: "soundcloud track downloader", title: "SoundCloud Track Downloader" },
    },
  },
]

// Çeviri workflow'u ile üretilen locale'leri (es, pt, de, fr, ru, ar, hi, id)
// her topic'in elle yazılmış tr/en'ine merge et.
for (const topic of BLOG_TOPICS) {
  const extra = TRANSLATED_TOPIC_LOCALES[topic.id]
  if (extra) Object.assign(topic.locales, extra)
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

/** Bir dilde kayıtlı (slug'u olan) tüm topic'ler. */
export function topicsForLocale(lang: Locale): BlogTopic[] {
  return BLOG_TOPICS.filter((t) => t.locales[lang])
}

/** Bir platform + dilde kayıtlı topic'ler (sitemap/index için). */
export function topicsForPlatform(platform: Platform, lang: Locale): BlogTopic[] {
  return BLOG_TOPICS.filter((t) => t.platform === platform && t.locales[lang])
}

/** (lang, slug) → topic. Bulunamazsa null. */
export function findTopic(lang: Locale, slug: string): BlogTopic | null {
  return BLOG_TOPICS.find((t) => t.locales[lang]?.slug === slug) ?? null
}

/** Bir topic'in hreflang alternatifleri — kayıtlı olduğu tüm diller. */
export function topicLocales(topic: BlogTopic): Locale[] {
  return Object.keys(topic.locales) as Locale[]
}

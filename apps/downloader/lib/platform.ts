import { clientRootDomain } from "@workspace/auth/lib/domains"

export type Platform = "youtube" | "instagram" | "soundcloud"

export interface PlatformConfig {
  id: Platform
  label: string
  host: string
  /** Faz 1: yalnız youtube canlı. instagram/soundcloud "Yakında" (Faz 2). */
  enabled: boolean
  placeholder: string
}

// Host'lar `<platform>.<root>` — root NEXT_PUBLIC_ROOT_DOMAIN'den (default
// sentroy.com → mevcut host'larla BİREBİR aynı). Self-host: tek env ile taşınır.
const ROOT = clientRootDomain()

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    host: `youtube.${ROOT}`,
    enabled: true,
    placeholder: "https://youtube.com/watch?v=…",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    host: `instagram.${ROOT}`,
    enabled: true,
    placeholder: "https://instagram.com/reel/… , /p/… veya /profil",
  },
  soundcloud: {
    id: "soundcloud",
    label: "SoundCloud",
    host: `soundcloud.${ROOT}`,
    enabled: false,
    placeholder: "https://soundcloud.com/artist/track",
  },
}

export const PLATFORM_ORDER: Platform[] = ["youtube", "instagram", "soundcloud"]
export const DEFAULT_PLATFORM: Platform = "youtube"

/** Site bölümü: indirici (youtube/instagram/…) mi, online araçlar (tools.) mı. */
export type SiteSection = "download" | "tools"

export function siteSection(host: string | null | undefined): SiteSection {
  if (!host) return "download"
  let h = host.split(":")[0]!.toLowerCase()
  if (h.startsWith("www.")) h = h.slice(4)
  return h.startsWith("tools.") ? "tools" : "download"
}

/** İstek host header'ından aktif platformu çözer (subdomain). www. yok sayılır. */
export function platformFromHost(host: string | null | undefined): Platform {
  if (!host) return DEFAULT_PLATFORM
  let h = host.split(":")[0]!.toLowerCase()
  if (h.startsWith("www.")) h = h.slice(4)
  if (h.startsWith("instagram.")) return "instagram"
  if (h.startsWith("soundcloud.")) return "soundcloud"
  return "youtube"
}

// ── İndirme format/kalite presetleri (worker ytdlp.ts ile aynı; ayrı app
//    olduğu için burada tekrarlanır). ───────────────────────────────────────
export const VIDEO_QUALITIES = ["360", "480", "720", "1080"] as const
export const AUDIO_FORMATS = ["mp3", "wav", "m4a"] as const
export type VideoQuality = (typeof VIDEO_QUALITIES)[number]
export type AudioFormat = (typeof AUDIO_FORMATS)[number]

const URL_RE: Record<Platform, RegExp> = {
  youtube:
    /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)[\w-]{11}|youtu\.be\/[\w-]{11})([&?#].*)?$/i,
  instagram:
    /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[\w-]+\/?([&?#].*)?$/i,
  soundcloud: /^https?:\/\/(www\.|m\.)?soundcloud\.com\/[\w-]+\/[\w-]+\/?([&?#].*)?$/i,
}

// Profil URL'sinde kullanıcı-adı yerine gelemeyecek rezerve segment'ler.
const IG_RESERVED = new Set([
  "p", "reel", "reels", "tv", "explore", "accounts", "stories", "directory",
  "about", "developer", "legal", "press", "api", "direct", "challenge",
  "privacy", "terms", "emails", "session", "graphql",
])

export type InstagramKind = "post" | "reel" | "profile" | "story"

/** Instagram URL tipi: post (/p,/tv) | reel | story (/stories/..) | profile. */
export function instagramUrlKind(url: string): InstagramKind | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null
  const segs = u.pathname.split("/").filter(Boolean)
  if (segs.length === 0) return null
  const first = segs[0]!.toLowerCase()
  if ((first === "p" || first === "tv") && segs[1]) return "post"
  if ((first === "reel" || first === "reels") && segs[1]) return "reel"
  if (first === "stories" && segs[1]) return "story"
  // /<kullanıcı>/reel/<id> | /<kullanıcı>/p/<id> (feed/profil reel formu)
  if (segs.length >= 3) {
    const second = segs[1]!.toLowerCase()
    if (second === "reel" || second === "reels") return "reel"
    if (second === "p" || second === "tv") return "post"
  }
  if (
    segs.length === 1 &&
    !IG_RESERVED.has(first) &&
    /^[A-Za-z0-9._]{1,30}$/.test(segs[0]!)
  ) {
    return "profile"
  }
  return null
}

export function isValidUrl(url: string, platform: Platform): boolean {
  if (typeof url !== "string" || url.length > 2048) return false
  const u = url.trim()
  if (platform === "instagram") return instagramUrlKind(u) !== null
  return URL_RE[platform].test(u)
}

/** YouTube video ID → tam watch URL (`/watch?v=ID` route'u için). */
export function youtubeUrlFromId(v: string): string | null {
  return /^[\w-]{11}$/.test(v) ? `https://www.youtube.com/watch?v=${v}` : null
}

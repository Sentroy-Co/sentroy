import {
  Image01Icon,
  Pdf01Icon,
  MusicNote01Icon,
  VideoReplayIcon,
  Wrench01Icon,
  SourceCodeIcon,
  YoutubeIcon,
  InstagramIcon,
} from "@hugeicons/core-free-icons"

/**
 * Sentroy OS — tools.sentroy.com araç kataloğu (Launchpad + Spotlight için).
 *
 * ⚠ KAYNAK: apps/downloader/lib/tools/registry.ts. Bu liste oradan türetilmiş
 * statik bir aynadır (apps arası import yok → cross-app coupling/deploy bağımlılığı
 * olmadan yerelde de çalışsın diye). Yeni araç eklenince burayı da güncelle
 * (yalnız id/category/status/slug/title yeter). İleride downloader public manifest
 * endpoint'i (/api/tools/manifest) ile değiştirilebilir.
 */

export type ToolCategory = "image" | "pdf" | "audio" | "video" | "utility" | "developer"

type IconType = typeof Image01Icon

export const TOOL_CATEGORIES: { key: ToolCategory; label: { en: string; tr: string }; icon: IconType; color: string }[] = [
  { key: "image", label: { en: "Image", tr: "Görsel" }, icon: Image01Icon, color: "#38bdf8" },
  { key: "pdf", label: { en: "PDF", tr: "PDF" }, icon: Pdf01Icon, color: "#f43f5e" },
  { key: "audio", label: { en: "Audio", tr: "Ses" }, icon: MusicNote01Icon, color: "#a78bfa" },
  { key: "video", label: { en: "Video", tr: "Video" }, icon: VideoReplayIcon, color: "#fb923c" },
  { key: "utility", label: { en: "Utility", tr: "Yardımcı" }, icon: Wrench01Icon, color: "#34d399" },
  { key: "developer", label: { en: "Developer", tr: "Geliştirici" }, icon: SourceCodeIcon, color: "#818cf8" },
]

export interface ToolEntry {
  id: string
  category: ToolCategory
  /** "soon" araçların çalışan sayfası yok — Launchpad'de gizlenir. */
  status: "live" | "soon"
  en: { slug: string; title: string; keyword: string }
  tr: { slug: string; title: string; keyword: string }
}

export const TOOLS: ToolEntry[] = [
  { id: "pdf-merge", category: "pdf", status: "live", en: { slug: "merge-pdf", title: "Merge PDF", keyword: "merge pdf" }, tr: { slug: "pdf-birlestir", title: "PDF Birleştir", keyword: "pdf birleştir" } },
  { id: "pdf-compress", category: "pdf", status: "live", en: { slug: "compress-pdf", title: "Compress PDF", keyword: "compress pdf" }, tr: { slug: "pdf-sikistir", title: "PDF Sıkıştır", keyword: "pdf sıkıştır" } },
  { id: "img-to-pdf", category: "pdf", status: "live", en: { slug: "jpg-to-pdf", title: "JPG to PDF", keyword: "jpg to pdf" }, tr: { slug: "jpg-to-pdf", title: "JPG'den PDF'e", keyword: "jpg to pdf" } },
  { id: "pdf-split", category: "pdf", status: "live", en: { slug: "split-pdf", title: "Split PDF", keyword: "split pdf" }, tr: { slug: "pdf-bol", title: "PDF Böl", keyword: "pdf böl" } },
  { id: "word-to-pdf", category: "pdf", status: "soon", en: { slug: "word-to-pdf", title: "Word to PDF", keyword: "word to pdf" }, tr: { slug: "word-to-pdf", title: "Word'den PDF'e", keyword: "word to pdf" } },
  { id: "pdf-to-word", category: "pdf", status: "soon", en: { slug: "pdf-to-word", title: "PDF to Word", keyword: "pdf to word" }, tr: { slug: "pdf-to-word", title: "PDF'den Word'e", keyword: "pdf to word" } },
  { id: "excel-to-pdf", category: "pdf", status: "soon", en: { slug: "excel-to-pdf", title: "Excel to PDF", keyword: "excel to pdf" }, tr: { slug: "excel-to-pdf", title: "Excel'den PDF'e", keyword: "excel to pdf" } },
  { id: "powerpoint-to-pdf", category: "pdf", status: "soon", en: { slug: "powerpoint-to-pdf", title: "PowerPoint to PDF", keyword: "powerpoint to pdf" }, tr: { slug: "powerpoint-to-pdf", title: "PowerPoint'ten PDF'e", keyword: "powerpoint to pdf" } },

  { id: "heic-to-jpg", category: "image", status: "live", en: { slug: "heic-to-jpg", title: "HEIC to JPG", keyword: "heic to jpg" }, tr: { slug: "heic-to-jpg", title: "HEIC'ten JPG'ye", keyword: "heic to jpg" } },
  { id: "image-convert", category: "image", status: "live", en: { slug: "convert-image", title: "Convert Image", keyword: "convert image" }, tr: { slug: "gorsel-donustur", title: "Görsel Dönüştür", keyword: "görsel dönüştür" } },
  { id: "img-compress-jpg", category: "image", status: "live", en: { slug: "compress-jpg", title: "Compress JPG", keyword: "compress jpg" }, tr: { slug: "jpg-sikistir", title: "JPG Sıkıştır", keyword: "jpg sıkıştır" } },
  { id: "img-compress-png", category: "image", status: "live", en: { slug: "compress-png", title: "Compress PNG", keyword: "compress png" }, tr: { slug: "png-sikistir", title: "PNG Sıkıştır", keyword: "png sıkıştır" } },
  { id: "bg-remove", category: "image", status: "live", en: { slug: "background-remove", title: "Background Remover", keyword: "remove background" }, tr: { slug: "background-remove", title: "Arka Plan Kaldır", keyword: "arka plan kaldır" } },
  { id: "image-resize", category: "image", status: "live", en: { slug: "resize-image", title: "Resize & Crop Image", keyword: "resize image" }, tr: { slug: "gorsel-boyutlandir", title: "Görsel Boyutlandır", keyword: "görsel boyutlandır" } },

  { id: "aud-mp4-to-mp3", category: "audio", status: "live", en: { slug: "mp4-to-mp3", title: "MP4 to MP3", keyword: "mp4 to mp3" }, tr: { slug: "mp4-to-mp3", title: "MP4'ten MP3'e", keyword: "mp4 to mp3" } },
  { id: "aud-mp3-to-wav", category: "audio", status: "live", en: { slug: "mp3-to-wav", title: "MP3 to WAV", keyword: "mp3 to wav" }, tr: { slug: "mp3-to-wav", title: "MP3'ten WAV'a", keyword: "mp3 to wav" } },
  { id: "vid-extract-audio", category: "audio", status: "live", en: { slug: "video-extract-audio", title: "Extract Audio", keyword: "extract audio from video" }, tr: { slug: "video-extract-audio", title: "Videodan Ses Çıkar", keyword: "videodan ses çıkar" } },
  { id: "audio-trim", category: "audio", status: "live", en: { slug: "audio-trimmer", title: "Audio Trimmer", keyword: "audio trimmer" }, tr: { slug: "audio-trimmer", title: "Ses Kırpıcı", keyword: "ses kırpıcı" } },

  { id: "video-to-gif", category: "video", status: "live", en: { slug: "video-to-gif", title: "Video to GIF", keyword: "video to gif" }, tr: { slug: "video-to-gif", title: "Video'dan GIF'e", keyword: "video to gif" } },
  { id: "vid-webm-to-mp4", category: "video", status: "live", en: { slug: "webm-to-mp4", title: "WebM to MP4", keyword: "webm to mp4" }, tr: { slug: "webm-to-mp4", title: "WebM'den MP4'e", keyword: "webm to mp4" } },
  { id: "vid-mpeg-to-mp4", category: "video", status: "live", en: { slug: "mpeg-to-mp4", title: "MPEG to MP4", keyword: "mpeg to mp4" }, tr: { slug: "mpeg-to-mp4", title: "MPEG'den MP4'e", keyword: "mpeg to mp4" } },
  { id: "vid-mp4-to-webm", category: "video", status: "live", en: { slug: "mp4-to-webm", title: "MP4 to WebM", keyword: "mp4 to webm" }, tr: { slug: "mp4-to-webm", title: "MP4'ten WebM'e", keyword: "mp4 to webm" } },

  { id: "spreadsheet-convert", category: "utility", status: "live", en: { slug: "excel-to-csv", title: "Excel ↔ CSV / JSON", keyword: "excel to csv" }, tr: { slug: "excel-csv-cevir", title: "Excel ↔ CSV / JSON", keyword: "excel csv çevir" } },
  { id: "favicon-generator", category: "utility", status: "live", en: { slug: "favicon-generator", title: "Favicon Generator", keyword: "favicon generator" }, tr: { slug: "favicon-generator", title: "Favicon Oluşturucu", keyword: "favicon oluştur" } },
  { id: "qr-generator", category: "utility", status: "live", en: { slug: "qr-code-generator", title: "QR Code Generator", keyword: "qr code generator" }, tr: { slug: "qr-kod-olustur", title: "QR Kod Oluştur", keyword: "qr kod oluştur" } },

  { id: "json-formatter", category: "developer", status: "live", en: { slug: "json-formatter", title: "JSON Formatter", keyword: "json formatter" }, tr: { slug: "json-formatla", title: "JSON Formatla", keyword: "json formatla" } },
  { id: "base64", category: "developer", status: "live", en: { slug: "base64-encode-decode", title: "Base64 Encode / Decode", keyword: "base64" }, tr: { slug: "base64-encode-decode", title: "Base64 Encode / Decode", keyword: "base64" } },
  { id: "url-encode", category: "developer", status: "live", en: { slug: "url-encode-decode", title: "URL Encode / Decode", keyword: "url encode decode" }, tr: { slug: "url-encode-decode", title: "URL Encode / Decode", keyword: "url encode decode" } },
  { id: "uuid", category: "developer", status: "live", en: { slug: "uuid-generator", title: "UUID Generator", keyword: "uuid generator" }, tr: { slug: "uuid-generator", title: "UUID Oluşturucu", keyword: "uuid oluştur" } },
  { id: "regex-tester", category: "developer", status: "live", en: { slug: "regex-tester", title: "Regex Tester", keyword: "regex tester" }, tr: { slug: "regex-tester", title: "Regex Test Aracı", keyword: "regex test" } },
  { id: "css-gradient", category: "developer", status: "live", en: { slug: "css-gradient-generator", title: "CSS Gradient Generator", keyword: "css gradient" }, tr: { slug: "css-gradient-generator", title: "CSS Gradient Oluşturucu", keyword: "css gradient" } },
  { id: "hash-generator", category: "developer", status: "live", en: { slug: "hash-generator", title: "Hash Generator", keyword: "hash generator md5 sha256" }, tr: { slug: "hash-generator", title: "Hash Oluşturucu", keyword: "hash oluştur md5 sha256" } },
  { id: "cron-generator", category: "developer", status: "live", en: { slug: "cron-expression-generator", title: "Cron Expression Generator", keyword: "cron expression" }, tr: { slug: "cron-expression-generator", title: "Cron İfadesi Oluşturucu", keyword: "cron ifadesi" } },
  { id: "whois", category: "developer", status: "live", en: { slug: "whois", title: "WHOIS Lookup", keyword: "whois lookup" }, tr: { slug: "whois", title: "WHOIS Sorgu", keyword: "whois sorgulama" } },
  { id: "dns-checker", category: "developer", status: "live", en: { slug: "dns-checker", title: "DNS Checker", keyword: "dns checker" }, tr: { slug: "dns-checker", title: "DNS Kayıt Sorgulama", keyword: "dns checker" } },
  { id: "og-preview", category: "developer", status: "live", en: { slug: "open-graph-preview", title: "Open Graph Preview", keyword: "open graph preview" }, tr: { slug: "open-graph-preview", title: "Open Graph Önizleme", keyword: "open graph önizleme" } },
]

export const LIVE_TOOLS = TOOLS.filter((t) => t.status === "live")

/** Downloader platform host'ları — OS'ta Tools içinde ayrı "uygulama" gibi. */
export interface PlatformApp {
  key: string
  label: string
  host: string
  icon: typeof Image01Icon
  color: string
}
export const PLATFORM_APPS: PlatformApp[] = [
  { key: "youtube", label: "YouTube Downloader", host: "youtube.sentroy.com", icon: YoutubeIcon, color: "#ff0000" },
  { key: "instagram", label: "Instagram Downloader", host: "instagram.sentroy.com", icon: InstagramIcon, color: "#e1306c" },
]

/** Platform host kökü — en prefix'siz, diğer diller /<lang>. */
export function platformUrl(p: PlatformApp, lang: string): string {
  return `https://${p.host}${lang === "en" ? "" : `/${lang}`}`
}

export function toolsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_TOOLS_APP_URL || "https://tools.sentroy.com"
}

export function toolLocale(t: ToolEntry, lang: string): { slug: string; title: string; keyword: string } {
  return lang === "tr" ? t.tr : t.en
}

/** Aracın embed URL'i — as-needed locale prefix (en prefix'siz). */
export function toolUrl(t: ToolEntry, lang: string): string {
  const loc = toolLocale(t, lang)
  const path = lang === "en" ? `/${loc.slug}` : `/${lang}/${loc.slug}`
  return `${toolsBaseUrl()}${path}`
}

export function categoryMeta(cat: ToolCategory) {
  return TOOL_CATEGORIES.find((c) => c.key === cat) ?? TOOL_CATEGORIES[0]
}

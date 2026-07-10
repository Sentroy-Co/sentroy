import { routing, type Locale } from "@/i18n/routing"

/**
 * tools.sentroy.com araç kataloğu. Blog topic registry'siyle aynı desen ama
 * SECTION="tools". Mega menu + landing + sitemap bundan beslenir. Her araç
 * dil başına {slug, title, keyword, description} taşır (önce tr+en; diğer 8 dil
 * çeviri workflow'u ile). Slug yalnız tools section içinde benzersiz olmalı
 * (host-gated; youtube/instagram blog slug'larıyla çakışmaz).
 */
export type ToolCategory = "pdf" | "image" | "audio" | "video" | "utility" | "developer"
export type ToolCompute = "client" | "service" | "worker"
export type ToolStatus = "live" | "soon"

export interface ToolLocale {
  slug: string
  title: string
  keyword: string
  description: string
}

export interface Tool {
  id: string
  category: ToolCategory
  compute: ToolCompute
  status: ToolStatus
  /** Ücretli araç: Polar pack key'leri + opsiyonel günlük ücretsiz hak. */
  paid?: { packKeys: string[]; freePerDay?: number }
  locales: Partial<Record<Locale, ToolLocale>>
}

export const TOOL_CATEGORIES: { key: ToolCategory; label: Record<"en" | "tr", string> }[] = [
  { key: "image", label: { en: "Image", tr: "Görsel" } },
  { key: "pdf", label: { en: "PDF", tr: "PDF" } },
  { key: "audio", label: { en: "Audio", tr: "Ses" } },
  { key: "video", label: { en: "Video", tr: "Video" } },
  { key: "utility", label: { en: "Utility", tr: "Yardımcı" } },
  { key: "developer", label: { en: "Developer", tr: "Geliştirici" } },
]

export const TOOLS: Tool[] = [
  // ── PDF (client / WASM — ücretsiz) ───────────────────────────────────────────
  {
    id: "pdf-merge",
    category: "pdf",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "pdf-birlestir", title: "PDF Birleştir", keyword: "pdf birleştir", description: "Birden çok PDF'i sırala ve tek dosyada birleştir — tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "merge-pdf", title: "Merge PDF", keyword: "merge pdf", description: "Reorder and combine multiple PDFs into one — in your browser, free, files never leave your device." },
    },
  },
  {
    id: "pdf-compress",
    category: "pdf",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "pdf-sikistir", title: "PDF Sıkıştır", keyword: "pdf sıkıştır", description: "PDF boyutunu küçült — toplu, tarayıcıda, dosyan cihazından çıkmaz." },
      en: { slug: "compress-pdf", title: "Compress PDF", keyword: "compress pdf", description: "Shrink PDF size — batch, in your browser, files never leave your device." },
    },
  },
  {
    id: "img-to-pdf",
    category: "pdf",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "jpg-to-pdf", title: "JPG'den PDF'e", keyword: "jpg to pdf", description: "Birden çok görseli (JPG/PNG/WEBP) tek PDF'te birleştir — tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "jpg-to-pdf", title: "JPG to PDF Converter", keyword: "jpg to pdf", description: "Combine multiple images (JPG/PNG/WEBP) into one PDF — in your browser, free, files never leave your device." },
    },
  },
  {
    id: "pdf-split",
    category: "pdf",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "pdf-bol", title: "PDF Böl", keyword: "pdf böl", description: "PDF'i tek tek sayfalara böl veya bir sayfa aralığı çıkar — tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "split-pdf", title: "Split PDF", keyword: "split pdf", description: "Split a PDF into pages — in your browser, free." },
    },
  },

  // ── Office / ODF ↔ PDF (SERVER / LibreOffice worker) ─────────────────────────
  {
    id: "word-to-pdf",
    category: "pdf",
    compute: "service",
    // PASİF (CPU): server LibreOffice. Sunucu upgrade'inde "live" + OFFICE_CONVERT_ENABLED=true.
    status: "soon",
    locales: {
      tr: { slug: "word-to-pdf", title: "Word'den PDF'e", keyword: "word to pdf", description: "Word (DOC/DOCX/ODT/RTF) belgelerini yüksek doğrulukta PDF'e çevir — LibreOffice ile sunucuda, dosyan işlenip anında silinir." },
      en: { slug: "word-to-pdf", title: "Word to PDF", keyword: "word to pdf", description: "Convert Word (DOC/DOCX/ODT/RTF) documents to high-fidelity PDF — server-side via LibreOffice, your file is processed then deleted instantly." },
    },
  },
  {
    id: "pdf-to-word",
    category: "pdf",
    compute: "service",
    // PASİF (CPU): server LibreOffice. Sunucu upgrade'inde "live" + OFFICE_CONVERT_ENABLED=true.
    status: "soon",
    locales: {
      tr: { slug: "pdf-to-word", title: "PDF'den Word'e", keyword: "pdf to word", description: "PDF'i düzenlenebilir Word (DOCX) belgesine çevir — sunucuda LibreOffice ile, dosyan anında silinir. (PDF'in yapısı gereği sonuç yaklaşıktır.)" },
      en: { slug: "pdf-to-word", title: "PDF to Word", keyword: "pdf to word", description: "Convert a PDF into an editable Word (DOCX) document — server-side via LibreOffice, deleted instantly. (Results are approximate by nature of PDF.)" },
    },
  },
  {
    id: "excel-to-pdf",
    category: "pdf",
    compute: "service",
    // PASİF (CPU): server LibreOffice. Sunucu upgrade'inde "live" + OFFICE_CONVERT_ENABLED=true.
    status: "soon",
    locales: {
      tr: { slug: "excel-to-pdf", title: "Excel'den PDF'e", keyword: "excel to pdf", description: "Excel (XLS/XLSX/ODS) tablolarını PDF'e çevir — LibreOffice ile sunucuda, dosyan işlenip anında silinir." },
      en: { slug: "excel-to-pdf", title: "Excel to PDF", keyword: "excel to pdf", description: "Convert Excel (XLS/XLSX/ODS) spreadsheets to PDF — server-side via LibreOffice, your file is processed then deleted instantly." },
    },
  },
  {
    id: "powerpoint-to-pdf",
    category: "pdf",
    compute: "service",
    // PASİF (CPU): server LibreOffice. Sunucu upgrade'inde "live" + OFFICE_CONVERT_ENABLED=true.
    status: "soon",
    locales: {
      tr: { slug: "powerpoint-to-pdf", title: "PowerPoint'ten PDF'e", keyword: "powerpoint to pdf", description: "PowerPoint (PPT/PPTX/ODP) sunumlarını PDF'e çevir — LibreOffice ile sunucuda, dosyan işlenip anında silinir." },
      en: { slug: "powerpoint-to-pdf", title: "PowerPoint to PDF", keyword: "powerpoint to pdf", description: "Convert PowerPoint (PPT/PPTX/ODP) presentations to PDF — server-side via LibreOffice, your file is processed then deleted instantly." },
    },
  },

  // ── Görsel (client / WASM — ücretsiz) ────────────────────────────────────────
  {
    id: "heic-to-jpg",
    category: "image",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "heic-to-jpg", title: "HEIC'ten JPG'ye", keyword: "heic to jpg", description: "iPhone HEIC fotoğraflarını JPG/PNG/WEBP'e dönüştür — tarayıcıda (libheif), dosyan cihazından çıkmaz." },
      en: { slug: "heic-to-jpg", title: "HEIC to JPG", keyword: "heic to jpg", description: "Convert iPhone HEIC photos to JPG/PNG/WEBP — in your browser (libheif), your files never leave your device." },
    },
  },
  {
    id: "image-convert",
    category: "image",
    compute: "client",
    status: "live", // fonksiyonel (ImageConverterTool, çoklu dosya) — indexlenir
    locales: {
      tr: { slug: "gorsel-donustur", title: "Görsel Dönüştür", keyword: "görsel formatı dönüştür", description: "Birden çok görseli aynı anda PNG/JPG/WEBP'e dönüştür — tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "convert-image", title: "Convert Image", keyword: "convert image online", description: "Convert multiple images to PNG/JPG/WEBP at once — in your browser, free, files never leave your device." },
    },
  },
  {
    id: "img-compress-jpg",
    category: "image",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "jpg-sikistir", title: "JPG Sıkıştır", keyword: "jpg sıkıştır", description: "JPG/JPEG görselleri kalite kaybını sen ayarlayarak sıkıştır — toplu, tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "compress-jpg", title: "Compress JPG", keyword: "compress jpg", description: "Compress JPG/JPEG images with adjustable quality — batch, in your browser, free, files never leave your device." },
    },
  },
  {
    id: "img-compress-png",
    category: "image",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "png-sikistir", title: "PNG Sıkıştır", keyword: "png sıkıştır", description: "PNG görselleri renk kuantizasyonuyla küçült (TinyPNG tarzı) — toplu, tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "compress-png", title: "Compress PNG", keyword: "compress png", description: "Shrink PNG images with color quantization (TinyPNG-style) — batch, in your browser, free, files never leave your device." },
    },
  },
  {
    id: "bg-remove",
    category: "image",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "background-remove", title: "Arka Plan Kaldır", keyword: "arka plan kaldır", description: "Görselin arka planını yapay zekayla kaldır (şeffaf PNG) — tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "background-remove", title: "Background Remover", keyword: "remove background from image", description: "Remove image backgrounds with AI (transparent PNG) — in your browser, free, files never leave your device." },
    },
  },
  {
    id: "image-resize",
    category: "image",
    compute: "client",
    status: "live", // fonksiyonel (ImageResizerTool) — indexlenir + sitemap'te
    locales: {
      tr: { slug: "gorsel-boyutlandir", title: "Görsel Boyutlandır & Kırp", keyword: "görsel boyutlandır", description: "Görseli yeniden boyutlandır, iPhone tarzı kırp ve dönüştür — tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "resize-image", title: "Resize & Crop Image", keyword: "resize image online", description: "Resize, iPhone-style crop and convert images — in your browser, free, files never leave your device." },
    },
  },

  // ── Ses (client / WebAudio + lamejs — ücretsiz) ─────────────────────────────
  {
    id: "aud-mp4-to-mp3",
    category: "audio",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "mp4-to-mp3", title: "MP4'ten MP3'e Dönüştür", keyword: "mp4 to mp3", description: "MP4 videolarından sesi çıkarıp MP3'e dönüştür — toplu, tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "mp4-to-mp3", title: "MP4 to MP3 Converter", keyword: "mp4 to mp3", description: "Extract audio from MP4 videos and convert to MP3 — batch, in your browser, free, files never leave your device." },
    },
  },
  {
    id: "aud-mp3-to-wav",
    category: "audio",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "mp3-to-wav", title: "MP3'ten WAV'a Dönüştür", keyword: "mp3 to wav", description: "MP3 ses dosyalarını kayıpsız WAV'a dönüştür — toplu, tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "mp3-to-wav", title: "MP3 to WAV Converter", keyword: "mp3 to wav", description: "Convert MP3 audio to lossless WAV — batch, in your browser, free, files never leave your device." },
    },
  },
  {
    id: "vid-extract-audio",
    category: "audio",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "video-extract-audio", title: "Videodan Ses Çıkar", keyword: "video extract audio", description: "Videodan sesi çıkarıp MP3 veya WAV olarak indir — toplu, tarayıcıda, dosyan cihazından çıkmaz." },
      en: { slug: "video-extract-audio", title: "Extract Audio from Video", keyword: "extract audio from video", description: "Extract the audio track from a video and download as MP3 or WAV — batch, in your browser, files never leave your device." },
    },
  },
  {
    id: "audio-trim",
    category: "audio",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "audio-trimmer", title: "Ses Kırpıcı", keyword: "audio trimmer", description: "Ses dosyasını waveform üzerinde sürükleyerek kırp ve MP3/WAV indir — tarayıcıda, ücretsiz, dosyan cihazından çıkmaz." },
      en: { slug: "audio-trimmer", title: "Audio Trimmer", keyword: "audio trimmer", description: "Trim audio on a waveform by dragging and download as MP3/WAV — in your browser, free, files never leave your device." },
    },
  },

  // ── Yardımcı (saf client) ────────────────────────────────────────────────────
  {
    id: "video-to-gif",
    category: "video",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "video-to-gif", title: "Video'dan GIF'e", keyword: "video to gif", description: "Video'nun bir aralığını seç, FPS + boyut ayarla, GIF'e çevir — tarayıcıda, dosyan cihazından çıkmaz." },
      en: { slug: "video-to-gif", title: "Video to GIF", keyword: "video to gif", description: "Pick a range of your video, set FPS + size, convert to GIF — in your browser, your file never leaves your device." },
    },
  },
  {
    id: "vid-webm-to-mp4",
    category: "video",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "webm-to-mp4", title: "WebM'den MP4'e Dönüştür", keyword: "webm to mp4", description: "WebM videolarını MP4'e dönüştür — tarayıcıda (WebCodecs), donanım-hızlandırmalı, dosyan cihazından çıkmaz." },
      en: { slug: "webm-to-mp4", title: "WebM to MP4 Converter", keyword: "webm to mp4", description: "Convert WebM videos to MP4 — in your browser (WebCodecs), hardware-accelerated, your file never leaves your device." },
    },
  },
  {
    id: "vid-mpeg-to-mp4",
    category: "video",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "mpeg-to-mp4", title: "MPEG'den MP4'e Dönüştür", keyword: "mpeg to mp4", description: "MPEG videolarını MP4'e dönüştür — tarayıcıda (WebCodecs), dosyan cihazından çıkmaz." },
      en: { slug: "mpeg-to-mp4", title: "MPEG to MP4 Converter", keyword: "mpeg to mp4", description: "Convert MPEG videos to MP4 — in your browser (WebCodecs), your file never leaves your device." },
    },
  },
  {
    id: "vid-mp4-to-webm",
    category: "video",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "mp4-to-webm", title: "MP4'ten WebM'e Dönüştür", keyword: "mp4 to webm", description: "MP4 videolarını WebM'e dönüştür — tarayıcıda (WebCodecs), donanım-hızlandırmalı, dosyan cihazından çıkmaz." },
      en: { slug: "mp4-to-webm", title: "MP4 to WebM Converter", keyword: "mp4 to webm", description: "Convert MP4 videos to WebM — in your browser (WebCodecs), hardware-accelerated, your file never leaves your device." },
    },
  },
  {
    id: "spreadsheet-convert",
    category: "utility",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "excel-csv-cevir", title: "Excel ↔ CSV / JSON", keyword: "excel to csv", description: "Excel (XLSX/XLS) ile CSV ve JSON arasında dönüştür — tarayıcıda, dosyan cihazından çıkmaz." },
      en: { slug: "excel-to-csv", title: "Excel ↔ CSV / JSON", keyword: "excel to csv", description: "Convert between Excel (XLSX/XLS), CSV and JSON — in your browser, your files never leave your device." },
    },
  },
  {
    id: "favicon-generator",
    category: "utility",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "favicon-generator", title: "Favicon Oluşturucu", keyword: "favicon generator", description: "Tek bir görselden tüm favicon boyutları + .ico + site.webmanifest üret, ZIP indir — tarayıcıda, ücretsiz." },
      en: { slug: "favicon-generator", title: "Favicon Generator", keyword: "favicon generator", description: "Generate every favicon size + .ico + site.webmanifest from one image, download as ZIP — in your browser, free." },
    },
  },
  {
    id: "qr-generator",
    category: "utility",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "qr-kod-olustur", title: "QR Kod Oluştur", keyword: "qr kod oluştur", description: "Metin veya URL'den QR kod üret — renk, boyut, hata düzeltme ayarı; PNG/SVG indir. Tarayıcıda, ücretsiz." },
      en: { slug: "qr-code-generator", title: "QR Code Generator", keyword: "qr code generator", description: "Generate a QR code from text or URL — color, size, error correction; download PNG/SVG. In your browser, free." },
    },
  },
  {
    id: "json-formatter",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "json-formatla", title: "JSON Formatla & Doğrula", keyword: "json formatla", description: "JSON'u güzelleştir, küçült, doğrula ve anahtarları sırala — canlı hata gösterimi, tarayıcıda, ücretsiz." },
      en: { slug: "json-formatter", title: "JSON Formatter & Validator", keyword: "json formatter", description: "Beautify, minify, validate JSON and sort keys — live error reporting, in your browser, free." },
    },
  },
  {
    id: "base64",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "base64-encode-decode", title: "Base64 Encode / Decode", keyword: "base64 encode decode", description: "Metni Base64'e çevir veya çöz — UTF-8 güvenli, URL-safe seçeneği. Tarayıcıda, ücretsiz." },
      en: { slug: "base64-encode-decode", title: "Base64 Encode / Decode", keyword: "base64 encode decode", description: "Encode or decode text to/from Base64 — UTF-8 safe, URL-safe option. In your browser, free." },
    },
  },
  {
    id: "url-encode",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "url-encode-decode", title: "URL Encode / Decode", keyword: "url encode decode", description: "URL'leri ve parametreleri encode/decode et — component veya tam URI. Tarayıcıda, ücretsiz." },
      en: { slug: "url-encode-decode", title: "URL Encode / Decode", keyword: "url encode decode", description: "Encode/decode URLs and query params — component or full URI. In your browser, free." },
    },
  },
  {
    id: "uuid",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "uuid-generator", title: "UUID Oluşturucu", keyword: "uuid generator", description: "Rastgele UUID (v4) üret — toplu, biçim seçenekleri, kopyala/indir. Tarayıcıda, ücretsiz." },
      en: { slug: "uuid-generator", title: "UUID Generator", keyword: "uuid generator", description: "Generate random UUIDs (v4) — bulk, format options, copy/download. In your browser, free." },
    },
  },
  {
    id: "regex-tester",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "regex-tester", title: "Regex Test Aracı", keyword: "regex tester", description: "Düzenli ifadeleri canlı test et — eşleşme vurgusu, gruplar, flag'ler. Tarayıcıda, ücretsiz." },
      en: { slug: "regex-tester", title: "Regex Tester", keyword: "regex tester", description: "Test regular expressions live — match highlighting, groups, flags. In your browser, free." },
    },
  },
  {
    id: "css-gradient",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "css-gradient-generator", title: "CSS Gradient Oluşturucu", keyword: "css gradient generator", description: "Linear/radial/conic CSS gradyan oluştur — canlı önizleme, renk durakları, kopyala. Ücretsiz." },
      en: { slug: "css-gradient-generator", title: "CSS Gradient Generator", keyword: "css gradient generator", description: "Build linear/radial/conic CSS gradients — live preview, color stops, copy. Free." },
    },
  },
  {
    id: "hash-generator",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "hash-generator", title: "Hash Oluşturucu (MD5/SHA)", keyword: "hash generator", description: "Metin veya dosyadan MD5, SHA-1, SHA-256, SHA-512 hash üret — tarayıcıda, ücretsiz." },
      en: { slug: "hash-generator", title: "Hash Generator (MD5/SHA)", keyword: "md5 sha256 hash generator", description: "Generate MD5, SHA-1, SHA-256, SHA-512 hashes from text or files — in your browser, free." },
    },
  },
  {
    id: "cron-generator",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "cron-expression-generator", title: "Cron İfadesi Oluşturucu", keyword: "cron expression generator", description: "Cron ifadesi oluştur ve insan-okunur açıklamasını gör — presetler, alan editörü. Ücretsiz." },
      en: { slug: "cron-expression-generator", title: "Cron Expression Generator", keyword: "cron expression generator", description: "Build cron expressions with a human-readable description — presets, field editor. Free." },
    },
  },
  {
    id: "whois",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "whois", title: "WHOIS Sorgu", keyword: "whois sorgulama", description: "Domain WHOIS/RDAP kaydını sorgula — registrar, kayıt/bitiş tarihleri, durum, nameserver, DNSSEC. Tarayıcıda, ücretsiz." },
      en: { slug: "whois", title: "WHOIS Lookup", keyword: "whois lookup", description: "Look up a domain's WHOIS/RDAP record — registrar, registration/expiry dates, status, nameservers, DNSSEC. In your browser, free." },
    },
  },
  {
    id: "dns-checker",
    category: "developer",
    compute: "client",
    status: "live",
    locales: {
      tr: { slug: "dns-checker", title: "DNS Kayıt Sorgulama", keyword: "dns checker", description: "Bir alan adının A/AAAA/MX/TXT/CNAME/NS/SOA kayıtlarını sorgula — DNS-over-HTTPS, tarayıcıda." },
      en: { slug: "dns-checker", title: "DNS Checker", keyword: "dns checker", description: "Look up a domain's A/AAAA/MX/TXT/CNAME/NS/SOA records — DNS-over-HTTPS, in your browser." },
    },
  },
  {
    id: "og-preview",
    category: "developer",
    compute: "service",
    status: "live",
    locales: {
      tr: { slug: "open-graph-preview", title: "Open Graph Önizleme", keyword: "open graph preview", description: "Bir URL'nin sosyal paylaşım (Open Graph/Twitter) önizlemesini ve meta etiketlerini gör." },
      en: { slug: "open-graph-preview", title: "Open Graph Preview", keyword: "open graph preview", description: "See how a URL looks when shared (Open Graph/Twitter) and inspect its meta tags." },
    },
  },
]

// ── Yardımcılar ──────────────────────────────────────────────────────────────
/**
 * Aracın belirli dildeki yerelleştirmesi — yoksa EN'e düşülür. Tool slug/başlık
 * şimdilik yalnız tr+en tanımlı; diğer 8 dilde EN slug/başlıkla servis edilir
 * (UI chrome çevirili), böylece her dilde erişilebilir. (Per-dil tool başlığı
 * ileride çeviri pass'iyle eklenebilir.)
 */
export function localeOf(tool: Tool, lang: Locale): ToolLocale | undefined {
  return tool.locales[lang] ?? tool.locales.en
}

export function toolsForLocale(lang: Locale): Tool[] {
  return TOOLS.filter((t) => localeOf(t, lang))
}

/**
 * Slug'ı araca çöz — DİL-ÖNCELİKLİ cross-locale fallback:
 *   1) İstenen dildeki (localeOf) slug ile eşleşen araç → ÖNCELİK.
 *   2) Yoksa HERHANGİ bir dildeki slug ile eşleşen araç → fallback.
 *
 * Böylece bir araca hem en hem tr (hem diğer dillerin) slug'ıyla erişilebilir.
 * Dil değiştirici pathname'i koruyup yanlış-dil slug'ı ürettiğinde bile
 * (örn. `/merge-pdf` → TR → `/tr/merge-pdf`, ama TR slug `pdf-birlestir`) 404
 * yerine araç bulunur; sayfa katmanı eşleşen dilin slug'ına redirect eder.
 */
export function findTool(lang: Locale, slug: string): Tool | null {
  const direct = TOOLS.find((t) => localeOf(t, lang)?.slug === slug)
  if (direct) return direct
  return (
    TOOLS.find((t) =>
      Object.values(t.locales).some((loc) => loc?.slug === slug),
    ) ?? null
  )
}

export function findToolById(id: string): Tool | null {
  return TOOLS.find((t) => t.id === id) ?? null
}

export function toolsByCategory(lang: Locale): { category: ToolCategory; tools: Tool[] }[] {
  return TOOL_CATEGORIES.map((c) => ({
    category: c.key,
    tools: TOOLS.filter((t) => t.category === c.key && localeOf(t, lang)),
  })).filter((g) => g.tools.length > 0)
}

export function toolLocales(tool: Tool): Locale[] {
  return Object.keys(tool.locales) as Locale[]
}

/** Araç URL yolu — as-needed locale prefix (en prefix'siz). Blog deseniyle aynı. */
export function toolPath(lang: Locale, slug: string): string {
  return lang === routing.defaultLocale ? `/${slug}` : `/${lang}/${slug}`
}

/** Kategori başlığı (tr varsa tr, yoksa en). */
export function categoryLabel(cat: ToolCategory, lang: Locale): string {
  const entry = TOOL_CATEGORIES.find((c) => c.key === cat)
  if (!entry) return cat
  return lang === "tr" ? entry.label.tr : entry.label.en
}

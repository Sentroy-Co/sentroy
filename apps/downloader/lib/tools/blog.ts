import { routing, type Locale } from "@/i18n/routing"

/**
 * tools.sentroy.com blog / rehber kayıtları. Amaç: araçların farklı arama
 * adlarını (örn "jpg to png", "png to jpeg") yakalamak. Her post bir arama
 * varyasyonunu hedefler, ilgili aracı GÖMER (kullanıcı sayfada hemen yapar) +
 * SEO içeriği (intro + FAQ) taşır. Slug GLOBAL (tek, tüm dillerde aynı — sorgu
 * İngilizce yazılır); içerik dile göre (en-fallback). Tool slug'larıyla
 * çakışmaz (tools host [slug] resolver önce tool'a bakar, sonra post'a).
 */

export interface ToolBlogLocale {
  title: string
  keyword: string
  excerpt: string
  intro: string
  faq: { q: string; a: string }[]
}

export interface ToolBlogPost {
  slug: string
  /** Gömülecek/yönlendirilecek araç (registry tool id). */
  toolId: string
  locales: Partial<Record<Locale, ToolBlogLocale>>
}

export const TOOL_BLOG_POSTS: ToolBlogPost[] = [
  {
    slug: "jpg-to-png",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert JPG to PNG",
        keyword: "jpg to png",
        excerpt: "Turn JPG/JPEG photos into lossless PNG with transparency support — free, in your browser.",
        intro:
          "Need to convert a JPG (or JPEG) to PNG? Drop your image below and pick PNG as the output format. PNG is lossless and supports transparency, making it ideal for logos, screenshots and graphics. Everything runs in your browser — your files never leave your device.",
        faq: [
          { q: "Is JPG to PNG conversion lossless?", a: "PNG itself is lossless, but a JPG already lost some data when it was first saved. Converting to PNG won't recover that, but it won't add any further loss." },
          { q: "Will the PNG be larger than the JPG?", a: "Usually yes — PNG stores image data without lossy compression, so photographic images become larger. For photos, WEBP is a smaller alternative." },
        ],
      },
      tr: {
        title: "JPG'den PNG'ye Dönüştür",
        keyword: "jpg to png",
        excerpt: "JPG/JPEG fotoğraflarını şeffaflık destekli kayıpsız PNG'ye çevir — ücretsiz, tarayıcıda.",
        intro:
          "JPG (veya JPEG) dosyasını PNG'ye mi çevirmen gerekiyor? Görselini aşağıya bırak ve çıktı formatı olarak PNG seç. PNG kayıpsızdır ve şeffaflığı destekler; logo, ekran görüntüsü ve grafikler için idealdir. Her şey tarayıcında çalışır — dosyaların cihazından çıkmaz.",
        faq: [
          { q: "JPG'den PNG'ye dönüşüm kayıpsız mı?", a: "PNG kayıpsızdır, ancak JPG ilk kaydedildiğinde zaten bir miktar veri kaybetmiştir. PNG'ye çevirmek bunu geri getirmez ama ek kayıp da eklemez." },
          { q: "PNG, JPG'den büyük mü olur?", a: "Genellikle evet — PNG verileri kayıplı sıkıştırmadan saklar, bu yüzden fotoğraflar büyür. Fotoğraflar için WEBP daha küçük bir alternatiftir." },
        ],
      },
    },
  },
  {
    slug: "png-to-jpg",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert PNG to JPG",
        keyword: "png to jpg, png to jpeg",
        excerpt: "Compress PNG images into smaller JPG/JPEG files — free, in your browser.",
        intro:
          "Convert PNG to JPG (JPEG) to drastically reduce file size for photos and web use. Drop your PNG below and choose JPG as the output, then tune the quality. Transparent areas are filled with white. All processing happens locally in your browser.",
        faq: [
          { q: "What happens to transparency?", a: "JPG doesn't support transparency, so any transparent pixels are filled with a white background during conversion." },
          { q: "How much smaller will the JPG be?", a: "For photographic PNGs, JPG is often 5–10× smaller. Lower the quality slider for even smaller files." },
        ],
      },
      tr: {
        title: "PNG'den JPG'ye Dönüştür",
        keyword: "png to jpg, png to jpeg",
        excerpt: "PNG görselleri daha küçük JPG/JPEG dosyalarına sıkıştır — ücretsiz, tarayıcıda.",
        intro:
          "Fotoğraflar ve web kullanımı için dosya boyutunu ciddi şekilde küçültmek üzere PNG'yi JPG'ye (JPEG) çevir. PNG'ni aşağıya bırak, çıktı olarak JPG seç ve kaliteyi ayarla. Şeffaf alanlar beyazla doldurulur. Tüm işlem tarayıcında, yerelde gerçekleşir.",
        faq: [
          { q: "Şeffaflığa ne olur?", a: "JPG şeffaflığı desteklemez; dönüşümde şeffaf pikseller beyaz arka planla doldurulur." },
          { q: "JPG ne kadar küçük olur?", a: "Fotoğraf içeren PNG'lerde JPG genelde 5–10× daha küçüktür. Kalite çubuğunu düşürerek daha da küçültebilirsin." },
        ],
      },
    },
  },
  {
    slug: "webp-to-png",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert WEBP to PNG",
        keyword: "webp to png",
        excerpt: "Turn modern WEBP images into widely-supported PNG — free, in your browser.",
        intro:
          "WEBP is great for the web but not every app accepts it. Convert WEBP to PNG to get a universally supported, lossless image with transparency. Drop your WEBP below and select PNG. Nothing is uploaded — it all runs locally.",
        faq: [
          { q: "Does the conversion keep transparency?", a: "Yes — both WEBP and PNG support transparency, so transparent areas are preserved." },
        ],
      },
      tr: {
        title: "WEBP'den PNG'ye Dönüştür",
        keyword: "webp to png",
        excerpt: "Modern WEBP görselleri yaygın desteklenen PNG'ye çevir — ücretsiz, tarayıcıda.",
        intro:
          "WEBP web için harika ama her uygulama kabul etmez. Şeffaflık destekli, evrensel desteklenen kayıpsız bir görsel için WEBP'i PNG'ye çevir. WEBP'ini aşağıya bırak ve PNG seç. Hiçbir şey yüklenmez — hepsi yerelde çalışır.",
        faq: [
          { q: "Dönüşüm şeffaflığı korur mu?", a: "Evet — hem WEBP hem PNG şeffaflığı destekler, şeffaf alanlar korunur." },
        ],
      },
    },
  },
  {
    slug: "png-to-webp",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert PNG to WEBP",
        keyword: "png to webp",
        excerpt: "Shrink PNG images into modern WEBP — much smaller, with transparency. Free, in-browser.",
        intro:
          "WEBP gives you smaller files than PNG while keeping transparency and quality — perfect for fast websites. Drop your PNG below, choose WEBP and adjust the quality. Everything is processed in your browser.",
        faq: [
          { q: "Is WEBP smaller than PNG?", a: "Yes, often dramatically — WEBP typically produces 25–80% smaller files than PNG while preserving transparency." },
        ],
      },
      tr: {
        title: "PNG'den WEBP'ye Dönüştür",
        keyword: "png to webp",
        excerpt: "PNG görselleri modern WEBP'ye küçült — çok daha küçük, şeffaflıkla. Ücretsiz, tarayıcıda.",
        intro:
          "WEBP, şeffaflığı ve kaliteyi korurken PNG'den daha küçük dosyalar verir — hızlı siteler için ideal. PNG'ni aşağıya bırak, WEBP seç ve kaliteyi ayarla. Her şey tarayıcında işlenir.",
        faq: [
          { q: "WEBP, PNG'den küçük mü?", a: "Evet, çoğu zaman ciddi şekilde — WEBP genelde şeffaflığı korurken PNG'den %25–80 daha küçük dosya üretir." },
        ],
      },
    },
  },
  {
    slug: "jpg-to-webp",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert JPG to WEBP",
        keyword: "jpg to webp",
        excerpt: "Convert JPG/JPEG photos to smaller WEBP for faster websites — free, in your browser.",
        intro:
          "Convert JPG to WEBP to serve smaller images on the web without visible quality loss. Drop your JPG below, pick WEBP and tune the quality slider. All conversion happens locally — no upload.",
        faq: [
          { q: "Is WEBP better than JPG?", a: "For the web, usually yes — WEBP achieves similar quality at a smaller size. Browser support is now universal." },
        ],
      },
      tr: {
        title: "JPG'den WEBP'ye Dönüştür",
        keyword: "jpg to webp",
        excerpt: "JPG/JPEG fotoğrafları hızlı siteler için daha küçük WEBP'ye çevir — ücretsiz, tarayıcıda.",
        intro:
          "Web'de görünür kalite kaybı olmadan daha küçük görseller sunmak için JPG'yi WEBP'ye çevir. JPG'ni aşağıya bırak, WEBP seç ve kalite çubuğunu ayarla. Tüm dönüşüm yerelde olur — yükleme yok.",
        faq: [
          { q: "WEBP, JPG'den iyi mi?", a: "Web için genelde evet — WEBP benzer kaliteyi daha küçük boyutta sağlar. Tarayıcı desteği artık evrensel." },
        ],
      },
    },
  },
  {
    slug: "heic-to-png",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert HEIC to PNG",
        keyword: "heic to png",
        excerpt: "Turn iPhone HEIC photos into lossless PNG — free, in your browser.",
        intro:
          "iPhones save photos as HEIC, which many apps and Windows can't open. Convert HEIC to PNG for a lossless, universally supported image. Drop your HEIC below and choose PNG — your browser decodes it locally with libheif, so nothing is uploaded.",
        faq: [
          { q: "Why can't I open HEIC files?", a: "HEIC is Apple's format; many editors, websites and older devices don't support it. PNG and JPG work everywhere." },
          { q: "Can I convert several HEIC photos at once?", a: "Yes — drop multiple HEIC files and convert them all in one go, right in your browser." },
        ],
      },
      tr: {
        title: "HEIC'ten PNG'ye Dönüştür",
        keyword: "heic to png",
        excerpt: "iPhone HEIC fotoğraflarını kayıpsız PNG'ye çevir — ücretsiz, tarayıcıda.",
        intro:
          "iPhone'lar fotoğrafları HEIC olarak kaydeder; birçok uygulama ve Windows bunu açamaz. Kayıpsız, evrensel desteklenen bir görsel için HEIC'i PNG'ye çevir. HEIC'ini aşağıya bırak ve PNG seç — tarayıcın libheif ile yerelde çözer, hiçbir şey yüklenmez.",
        faq: [
          { q: "HEIC dosyalarını neden açamıyorum?", a: "HEIC Apple'ın formatıdır; birçok editör, web sitesi ve eski cihaz desteklemez. PNG ve JPG her yerde çalışır." },
          { q: "Birden çok HEIC'i aynı anda çevirebilir miyim?", a: "Evet — birden çok HEIC dosyası bırak ve hepsini tek seferde, tarayıcında çevir." },
        ],
      },
    },
  },
  {
    slug: "heic-to-webp",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert HEIC to WEBP",
        keyword: "heic to webp",
        excerpt: "Convert iPhone HEIC photos to compact WEBP for the web — free, in your browser.",
        intro:
          "Want small, web-ready images from your iPhone photos? Convert HEIC to WEBP. Drop your HEIC below and choose WEBP — decoded locally with libheif and re-encoded in your browser. No upload, no quality sent to a server.",
        faq: [
          { q: "Is WEBP a good choice for web?", a: "Yes — WEBP gives small files with good quality and is supported by every modern browser." },
        ],
      },
      tr: {
        title: "HEIC'ten WEBP'ye Dönüştür",
        keyword: "heic to webp",
        excerpt: "iPhone HEIC fotoğraflarını web için kompakt WEBP'ye çevir — ücretsiz, tarayıcıda.",
        intro:
          "iPhone fotoğraflarından küçük, web'e hazır görseller mi istiyorsun? HEIC'i WEBP'ye çevir. HEIC'ini aşağıya bırak ve WEBP seç — libheif ile yerelde çözülür ve tarayıcında yeniden kodlanır. Yükleme yok, sunucuya bir şey gitmez.",
        faq: [
          { q: "WEBP web için iyi bir seçim mi?", a: "Evet — WEBP iyi kalitede küçük dosyalar verir ve her modern tarayıcı destekler." },
        ],
      },
    },
  },
  {
    slug: "avif-to-png",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert AVIF to PNG",
        keyword: "avif to png",
        excerpt: "Turn modern AVIF images into widely-supported PNG — free, in your browser.",
        intro:
          "AVIF gives tiny file sizes but isn't accepted everywhere yet. Convert AVIF to PNG to get a lossless, universally supported image with transparency. Drop your AVIF below and choose PNG. Your browser decodes the AVIF locally — nothing is uploaded.",
        faq: [
          { q: "Why won't my AVIF open in some apps?", a: "AVIF is newer, so some editors and older devices don't support it yet. PNG works virtually everywhere." },
          { q: "Is the conversion lossless?", a: "PNG output is lossless. The AVIF may already use lossy compression, but converting to PNG adds no further loss." },
        ],
      },
      tr: {
        title: "AVIF'ten PNG'ye Dönüştür",
        keyword: "avif to png",
        excerpt: "Modern AVIF görselleri yaygın desteklenen PNG'ye çevir — ücretsiz, tarayıcıda.",
        intro:
          "AVIF çok küçük dosya boyutu verir ama henüz her yerde kabul edilmiyor. Şeffaflık destekli, evrensel desteklenen kayıpsız bir görsel için AVIF'i PNG'ye çevir. AVIF'ini aşağıya bırak ve PNG seç. Tarayıcın AVIF'i yerelde çözer — hiçbir şey yüklenmez.",
        faq: [
          { q: "AVIF'im neden bazı uygulamalarda açılmıyor?", a: "AVIF daha yeni; bazı editörler ve eski cihazlar henüz desteklemiyor. PNG neredeyse her yerde çalışır." },
          { q: "Dönüşüm kayıpsız mı?", a: "PNG çıktısı kayıpsızdır. AVIF zaten kayıplı sıkıştırma kullanmış olabilir ama PNG'ye çevirmek ek kayıp eklemez." },
        ],
      },
    },
  },
  {
    slug: "avif-to-jpg",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert AVIF to JPG",
        keyword: "avif to jpg, avif to jpeg",
        excerpt: "Convert AVIF images into universally-supported JPG/JPEG — free, in your browser.",
        intro:
          "Need a JPG from an AVIF file? Drop your AVIF below and choose JPG. JPG opens on every device, app and website. Transparent areas are filled with white. Everything runs locally in your browser — no upload.",
        faq: [
          { q: "Will I lose quality?", a: "JPG is lossy, so there's some compression — keep the quality slider high for best results. For graphics with sharp edges, PNG is a better target." },
        ],
      },
      tr: {
        title: "AVIF'ten JPG'ye Dönüştür",
        keyword: "avif to jpg, avif to jpeg",
        excerpt: "AVIF görselleri evrensel desteklenen JPG/JPEG'e çevir — ücretsiz, tarayıcıda.",
        intro:
          "AVIF dosyasından JPG mi lazım? AVIF'ini aşağıya bırak ve JPG seç. JPG her cihaz, uygulama ve web sitesinde açılır. Şeffaf alanlar beyazla doldurulur. Her şey tarayıcında, yerelde çalışır — yükleme yok.",
        faq: [
          { q: "Kalite kaybeder miyim?", a: "JPG kayıplıdır, bir miktar sıkıştırma olur — en iyi sonuç için kalite çubuğunu yüksek tut. Keskin kenarlı grafikler için PNG daha iyi bir hedeftir." },
        ],
      },
    },
  },
  {
    slug: "webp-to-jpg",
    toolId: "image-convert",
    locales: {
      en: {
        title: "Convert WEBP to JPG",
        keyword: "webp to jpg, webp to jpeg",
        excerpt: "Turn WEBP images into universally-supported JPG/JPEG — free, in your browser.",
        intro:
          "Some tools and older devices don't open WEBP. Convert WEBP to JPG to get a file that works everywhere. Drop your WEBP below and choose JPG. Transparent areas become white. It all runs in your browser.",
        faq: [
          { q: "Why convert WEBP to JPG?", a: "For maximum compatibility — JPG opens in virtually every app, editor and device, while WEBP can still be rejected by some." },
        ],
      },
      tr: {
        title: "WEBP'den JPG'ye Dönüştür",
        keyword: "webp to jpg, webp to jpeg",
        excerpt: "WEBP görselleri evrensel desteklenen JPG/JPEG'e çevir — ücretsiz, tarayıcıda.",
        intro:
          "Bazı araçlar ve eski cihazlar WEBP açmaz. Her yerde çalışan bir dosya için WEBP'i JPG'ye çevir. WEBP'ini aşağıya bırak ve JPG seç. Şeffaf alanlar beyaz olur. Hepsi tarayıcında çalışır.",
        faq: [
          { q: "Neden WEBP'i JPG'ye çevireyim?", a: "Maksimum uyumluluk için — JPG neredeyse her uygulama, editör ve cihazda açılır; WEBP bazılarınca hâlâ reddedilebilir." },
        ],
      },
    },
  },
]

export function findToolBlogPost(slug: string): ToolBlogPost | null {
  return TOOL_BLOG_POSTS.find((p) => p.slug === slug) ?? null
}

export function blogLocaleOf(post: ToolBlogPost, lang: Locale): ToolBlogLocale | undefined {
  return post.locales[lang] ?? post.locales.en
}

/** Blog post yolu — tool slug'larıyla aynı kök (as-needed locale prefix). */
export function toolBlogPath(lang: Locale, slug: string): string {
  return lang === routing.defaultLocale ? `/${slug}` : `/${lang}/${slug}`
}

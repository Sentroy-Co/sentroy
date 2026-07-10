import { getTranslations } from "next-intl/server"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import type { Locale } from "@/i18n/routing"
import { cn } from "@workspace/ui/lib/utils"
import { categoryLabel, localeOf, type Tool } from "@/lib/tools/registry"
import { ToolsAmbiance } from "./tools-ambiance"
import { ImageResizerTool } from "./image-resizer-tool"
import { ImageConverterTool } from "./image-converter-tool"
import { ImageCompressorTool } from "./image-compressor-tool"
import { BackgroundRemoveTool } from "./background-remove-tool"
import { AudioConverterTool } from "./audio-converter-tool"
import { AudioTrimmerTool } from "./audio-trimmer-tool"
import { JsonFormatterTool } from "./json-formatter-tool"
import { QrCodeTool } from "./qr-code-tool"
import { FaviconGeneratorTool } from "./favicon-generator-tool"
import { JpgToPdfTool } from "./jpg-to-pdf-tool"
import { PdfCompressorTool } from "./pdf-compressor-tool"
import { PdfMergeTool } from "./pdf-merge-tool"
import { PdfSplitTool } from "./pdf-split-tool"
import { Base64Tool } from "./base64-tool"
import { UrlEncodeTool } from "./url-encode-tool"
import { UuidTool } from "./uuid-tool"
import { RegexTesterTool } from "./regex-tester-tool"
import { CssGradientTool } from "./css-gradient-tool"
import { HashTool } from "./hash-tool"
import { CronTool } from "./cron-tool"
import { DnsCheckerTool } from "./dns-checker-tool"
import { WhoisTool } from "./whois-tool"
import { OfficeConvertTool } from "./office-convert-tool"
import { SpreadsheetTool } from "./spreadsheet-tool"
import { VideoToGifTool } from "./video-to-gif-tool"
import {
  WebmToMp4Tool,
  MpegToMp4Tool,
  Mp4ToWebmTool,
} from "./video-convert-tool"
import { OgPreviewTool } from "./og-preview-tool"

// İki SEO sayfası tek bileşeni mode ile besler.
const HeicToJpgTool = () => <ImageConverterTool defaultFormat="jpeg" />
const CompressJpgTool = () => <ImageCompressorTool mode="jpg" />
const CompressPngTool = () => <ImageCompressorTool mode="png" />
const Mp4ToMp3Tool = () => <AudioConverterTool outputs={["mp3"]} accept="video/mp4,video/*,audio/*" />
const Mp3ToWavTool = () => <AudioConverterTool outputs={["wav"]} accept="audio/*" />
const VideoExtractAudioTool = () => <AudioConverterTool outputs={["mp3", "wav"]} accept="video/*" />

// Office/ODF ↔ PDF (server, LibreOffice) — tek bileşen, dönüşüm başına instance.
const WordToPdfTool = () => <OfficeConvertTool accept=".doc,.docx,.odt,.rtf" to="pdf" inputHint="DOC · DOCX · ODT · RTF" />
const PdfToWordTool = () => <OfficeConvertTool accept=".pdf" to="docx" inputHint="PDF" fidelityNoteKey="officePdfToWordNote" />
const ExcelToPdfTool = () => <OfficeConvertTool accept=".xls,.xlsx,.ods" to="pdf" inputHint="XLS · XLSX · ODS" />
const PowerpointToPdfTool = () => <OfficeConvertTool accept=".ppt,.pptx,.odp" to="pdf" inputHint="PPT · PPTX · ODP" />

/**
 * Per-tool fonksiyonel UI kaydı. Bir aracın gerçek UI'ı buradaysa ToolPageBody
 * onu render eder (araç fonksiyonel); değilse "Yakında" ekranı. SEO go-live
 * (status="live" → sitemap/index) bu UI'dan BAĞIMSIZ — registry'de status="live"
 * yapılınca indexlenir. (Yeni tool eklerken UI'ını buraya bağla.)
 */
export const TOOL_UI: Record<string, React.ComponentType> = {
  "image-resize": ImageResizerTool,
  "bg-remove": BackgroundRemoveTool,
  "image-convert": ImageConverterTool,
  "heic-to-jpg": HeicToJpgTool,
  "img-compress-jpg": CompressJpgTool,
  "img-compress-png": CompressPngTool,
  "aud-mp4-to-mp3": Mp4ToMp3Tool,
  "aud-mp3-to-wav": Mp3ToWavTool,
  "vid-extract-audio": VideoExtractAudioTool,
  "audio-trim": AudioTrimmerTool,
  "qr-generator": QrCodeTool,
  "favicon-generator": FaviconGeneratorTool,
  "json-formatter": JsonFormatterTool,
  "img-to-pdf": JpgToPdfTool,
  "pdf-compress": PdfCompressorTool,
  "pdf-merge": PdfMergeTool,
  "pdf-split": PdfSplitTool,
  "word-to-pdf": WordToPdfTool,
  "pdf-to-word": PdfToWordTool,
  "excel-to-pdf": ExcelToPdfTool,
  "powerpoint-to-pdf": PowerpointToPdfTool,
  "spreadsheet-convert": SpreadsheetTool,
  "video-to-gif": VideoToGifTool,
  "vid-webm-to-mp4": WebmToMp4Tool,
  "vid-mpeg-to-mp4": MpegToMp4Tool,
  "vid-mp4-to-webm": Mp4ToWebmTool,
  base64: Base64Tool,
  "url-encode": UrlEncodeTool,
  uuid: UuidTool,
  "regex-tester": RegexTesterTool,
  "css-gradient": CssGradientTool,
  "hash-generator": HashTool,
  "cron-generator": CronTool,
  "dns-checker": DnsCheckerTool,
  whois: WhoisTool,
  "og-preview": OgPreviewTool,
}

/**
 * Tek araç sayfası gövdesi. Faz A'da tüm araçlar "soon" → "Yakında" ekranı
 * (blog metni + gerçek araç UI'ı her aracın kendi PR'ında eklenecek). "live"
 * araçlar için bu component ileride aracın fonksiyonel UI'ını render edecek.
 */
export async function ToolPageBody({ tool, lang }: { tool: Tool; lang: Locale }) {
  const t = await getTranslations({ locale: lang, namespace: "d" })
  const loc = localeOf(tool, lang)!
  // Yalnız "live" araçlar fonksiyonel UI render eder; "soon" → "Yakında" ekranı
  // (registry status tek anahtar: pasife alınan araç UI'ını da göstermez).
  const ToolUI = tool.status === "live" ? TOOL_UI[tool.id] : undefined

  // Fonksiyonel araçlar (cropper vb.) geniş sahne ister; "Yakında" ekranı dar kalır.
  const contentMax = ToolUI ? "max-w-6xl" : "max-w-3xl"
  return (
    <>
      {/* Full-width başlık band'i — arkada çok-renkli gradient ambiyans */}
      <section className="relative overflow-hidden border-b border-border/40">
        <ToolsAmbiance className="absolute" />
        <div className={cn("mx-auto w-full px-4 pb-10 pt-8", contentMax)}>
          <nav data-app-chrome className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <a href="/" className="flex items-center gap-1 hover:text-foreground">
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5" />
              {t("toolsAllTools")}
            </a>
            <span>/</span>
            <span className="text-foreground">{categoryLabel(tool.category, lang)}</span>
          </nav>
          <header className="flex flex-col gap-4 pt-6">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{loc.title}</h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{loc.description}</p>
          </header>
        </div>
      </section>

      {/* İçerik */}
      <main className={cn("mx-auto w-full px-4 pb-24", contentMax)}>
        {ToolUI ? (
          <ToolUI />
        ) : (
          <section className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-6" />
            </span>
            <h2 className="text-xl font-semibold tracking-tight">{t("toolComingSoonTitle")}</h2>
            <p className="max-w-md text-muted-foreground">{t("toolComingSoonBody")}</p>
            <a
              href="/"
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("toolsAllTools")}
            </a>
          </section>
        )}
      </main>
    </>
  )
}

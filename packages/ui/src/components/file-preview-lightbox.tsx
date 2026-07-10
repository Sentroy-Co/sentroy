"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { FileIcon, defaultStyles } from "react-file-icon"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  RotateClockwiseIcon,
  Download01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  RefreshIcon,
  Image01Icon,
  Video01Icon,
  MusicNote01Icon,
  File01Icon,
  Alert02Icon,
  Loading03Icon,
  PlayIcon,
  PauseIcon,
  Backward01Icon,
  Forward01Icon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMute02Icon,
  Maximize01Icon as FullscreenIcon,
  ArrowShrink02Icon,
  RepeatIcon,
  RepeatOneIcon,
  PictureInPictureOnIcon,
  Link02Icon,
  Settings02Icon,
  Tick02Icon,
  Refresh01Icon,
  CodeSimpleFreeIcons as Code02Icon,
} from "@hugeicons/core-free-icons"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import { useImageGesture } from "@workspace/ui/hooks/use-image-gesture"

/**
 * Cross-app file preview lightbox.
 *
 * Tek componente birleştirilmiş canvas-tarzı dosya önizleme:
 *   - Image: pan + zoom (mouse wheel + pinch + double-tap) + rotate +
 *     fit-to-screen, custom gesture hook (`use-image-gesture`).
 *   - PDF/Office: `@cyntler/react-doc-viewer` lazy-loaded (SSR-safe), full
 *     plugin renderer set ile (PDF.js, mammoth-DOCX, xlsx, vb).
 *   - Video / Audio: native HTML5 controls.
 *   - Text/Code: plain-text fetch + `<pre>` render (basit ama çoğu log/
 *     config için yeterli).
 *   - Fallback: file icon + "Download" CTA.
 *
 * Items array prop ile birden fazla item alır; arrow nav (← →) ile geçiş.
 * `initialIndex` ile başlangıç noktası set edilir.
 *
 * Mail attachments + storage media tile: ortak entegrasyon noktası. Ayrı
 * URL pattern'leri (signed download endpoint vs CDN) caller tarafından
 * belirlenir, lightbox sadece `url` + `mimeType`'a bakar.
 *
 * SSR notu: react-doc-viewer DOMParser/PDF.js'e bağımlı → `dynamic({ ssr:
 * false })` ile sarmalı. Image/video/audio inline render güvenli.
 */

export interface FilePreviewItem {
  id: string
  /** Tam download/view URL'i. Lightbox bu URL'i `<img>` / `<video>` /
   *  `<iframe>` / `fetch` için kullanır. Signed URL veya public, fark etmez. */
  url: string
  /** Display name + filename hint (uzantı `mimeType` belirsizse fallback). */
  name: string
  /** MIME type — viewer seçimi için kritik (`image/*`, `application/pdf`,
   *  `video/*`, `text/*`, vb). Yoksa uzantıdan tahmin. */
  mimeType?: string
  /** Footer info için (opsiyonel). */
  size?: number
  /**
   * Pre-rendered quality variants for the original asset — populated
   * by callers that already have CDN ladder data (image thumbnails,
   * video transcode rungs). The video viewer surfaces them as a
   * picker, the toolbar download dropdown adds them to the menu.
   * Empty / undefined = no picker / dropdown picks original only.
   *
   * `kind` segregates image rungs (`/<width>` semantics) from video
   * rungs (`/<height>` semantics) so the player can route the right
   * pool into the right control. `label` is the user-facing string
   * (e.g. "720p", "1000w"). `size` is byte length when known.
   */
  variants?: Array<{
    kind: "image" | "video"
    url: string
    label: string
    size?: number
  }>
  /**
   * YouTube-style initial player config — used by the public embed
   * route to honour iframe URL params (?autoplay=1&loop=1&muted=1&
   * start=42&controls=0). Audio/video viewers read this once on
   * mount; subsequent user interaction overrides as normal.
   */
  playerInit?: {
    autoplay?: boolean
    loop?: boolean
    muted?: boolean
    /** Start position in seconds. */
    start?: number
    /** Hide the player chrome entirely (still seekable from outside
     *  via iframe API in the future; for now display-only). */
    hideControls?: boolean
  }
}

export interface FilePreviewLightboxProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: FilePreviewItem[]
  initialIndex?: number
  /** Caller download akışına bağlanmak isterse (örn. analytics, signed
   *  URL refresh). Verilmezse default davranış: blob fetch + `<a download>`
   *  ile gerçek save dialog. */
  onDownload?: (item: FilePreviewItem) => void
  /** Drag-to-reorder callback. Verilirse thumbnail strip'te sortable
   *  aktif; reorder sonrası yeni sıra caller'a iletilir (caller persist
   *  edebilir). Verilmezse strip görünür ama sadece click-to-jump aktif —
   *  drag visual feedback yok. */
  onReorder?: (newItems: FilePreviewItem[]) => void
  /**
   * Convert akışı destekleyen format'lar — verilirse Toolbar'daki Download
   * butonu dropdown olur ("Download as JPG", "as PNG", vb). Caller her
   * format için bir URL üretir (CDN convert endpoint). Boş array veya yoksa
   * dropdown açılmaz, basit download.
   *
   * Format key'leri: image için `jpg|png|webp|avif`, pdf için `png-page1`,
   * video için `png-frame1`. Caller hangi item'a hangi format uygun karar
   * verir.
   */
  buildConvertUrl?: (item: FilePreviewItem, format: string) => string
  /**
   * Metin/kod dosyaları için düzenle+kaydet. Verilirse text viewer'da "Edit"
   * modu (Monaco) + Save görünür; Save caller'ın persist akışını (içerik
   * overwrite endpoint'i) çağırır. Verilmezse text salt-okunur. HTML dosyaları
   * için ayrıca canlı "Preview" (iframe) her durumda mevcuttur.
   */
  onSaveText?: (item: FilePreviewItem, content: string) => Promise<void>
  /**
   * Embed mode — when true, hides UI bits that don't make sense
   * inside an iframe (the close X button, prev/next arrows when
   * there's only one item, the dashboard's chrome). Embed page
   * uses this to give the iframe a chrome-less player surface.
   */
  embed?: boolean
}

type ViewerKind = "image" | "pdf" | "office" | "video" | "audio" | "text" | "unsupported"

function inferViewerKind(item: FilePreviewItem): ViewerKind {
  const mime = (item.mimeType ?? "").toLowerCase()
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.startsWith("text/") || mime === "application/json") return "text"
  if (
    mime.startsWith("application/vnd.openxmlformats") ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime === "application/vnd.oasis.opendocument.text" ||
    mime === "application/vnd.oasis.opendocument.spreadsheet" ||
    mime === "application/vnd.oasis.opendocument.presentation"
  ) {
    return "office"
  }

  // MIME yoksa uzantıdan tahmin
  const ext = item.name.split(".").pop()?.toLowerCase() ?? ""
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].includes(ext)) return "image"
  if (ext === "pdf") return "pdf"
  if (["mp4", "webm", "mov", "ogv"].includes(ext)) return "video"
  if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) return "audio"
  if (["txt", "log", "md", "json", "xml", "yml", "yaml", "csv"].includes(ext)) return "text"
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"].includes(ext)) return "office"
  return "unsupported"
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ""
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
}

/**
 * Toolbar dropdown'unda gösterilecek convert opsiyonlarını item kind'ına
 * göre üretir. Caller `buildConvertUrl` veriyorsa lightbox bu listeyi
 * dropdown'a yazar; her seçim `onDownloadAs(format)` tetikler.
 *
 * Format key'leri CDN convert endpoint contract'ı:
 *   - image: `jpg|png|webp|avif`
 *   - pdf: `png-page1` (ilk sayfa PNG'ye)
 *   - video: `png-frame1` (ilk frame PNG'ye)
 */
function convertFormatsForKind(kind: ViewerKind): ConvertFormatOption[] {
  switch (kind) {
    case "image":
      return [
        { format: "jpg", label: "as JPG" },
        { format: "png", label: "as PNG" },
        { format: "webp", label: "as WebP" },
        { format: "avif", label: "as AVIF" },
      ]
    case "pdf":
      return [{ format: "png-page1", label: "as PNG (page 1)" }]
    case "video":
      return [{ format: "png-frame1", label: "as PNG (first frame)" }]
    default:
      return []
  }
}

function formatToExt(format: string): string {
  if (format === "png-page1" || format === "png-frame1") return "png"
  return format
}

// Monaco editör lazy — @monaco-editor/react + monaco ana bundle'a girmesin,
// yalnız text/kod dosyası açıldığında yüklensin.
const MonacoLazy = dynamic(
  () => import("./monaco-code-editor").then((m) => m.MonacoCodeEditor),
  { ssr: false, loading: () => <ViewerSpinner /> },
)

// Markdown editör (toolbar + canlı preview) — .md dosyaları için Monaco yerine.
const MarkdownLazy = dynamic(
  () => import("./markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <ViewerSpinner /> },
)

// Dosya adı → monaco dil id (monaco-code-editor'daki EXT_LANG ile senkron;
// buraya inline çünkü o modülü statik import etmek monaco'yu bundle'a sokar).
const MONACO_EXT_LANG: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", json: "json",
  html: "html", htm: "html", vue: "html", svelte: "html",
  css: "css", scss: "scss", less: "less", md: "markdown", markdown: "markdown",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin",
  c: "c", cc: "cpp", cpp: "cpp", h: "cpp", hpp: "cpp", cs: "csharp",
  php: "php", swift: "swift", sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql", yml: "yaml", yaml: "yaml", xml: "xml", toml: "ini", ini: "ini",
  env: "ini", conf: "ini", graphql: "graphql", gql: "graphql",
  csv: "plaintext", tsv: "plaintext", txt: "plaintext", log: "plaintext",
}
function monacoLang(name: string): string {
  if (name.toLowerCase() === "dockerfile") return "dockerfile"
  const ext = name.split(".").pop()?.toLowerCase() || ""
  return MONACO_EXT_LANG[ext] || "plaintext"
}
function isHtmlName(name: string, mime?: string): boolean {
  if ((mime || "").toLowerCase().includes("html")) return true
  return /\.(html?|svelte|vue)$/i.test(name)
}
function isMarkdownName(name: string, mime?: string): boolean {
  if ((mime || "").toLowerCase().includes("markdown")) return true
  return /\.(md|markdown|mdx)$/i.test(name)
}

/**
 * Dosya-tipi glyph'i — bucket listesindeki `MediaTypeIcon` ile AYNI görsel
 * (react-file-icon + defaultStyles, uzantıya göre renkli SVG). Lightbox
 * başlığında Hugeicons kind-ikonu yerine bunu kullanıyoruz → tutarlılık.
 */
function FileTypeGlyph({
  name,
  size = 18,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  const ext = name.split(".").pop()?.toLowerCase() || "file"
  const style = (defaultStyles as Record<string, unknown>)[ext] ?? {}
  return (
    <span
      className={className}
      style={{ width: size, height: size, lineHeight: 0, display: "inline-block" }}
    >
      <FileIcon extension={ext} {...style} labelUppercase />
    </span>
  )
}

// ─── Lazy-loaded doc viewer (SSR-unsafe; PDF.js / DOMParser kullanır) ───
const DocViewerLazy = dynamic(
  async () => {
    const mod = await import("@cyntler/react-doc-viewer")
    const Inner: React.FC<{ url: string; fileName: string; fileType?: string }> = ({
      url,
      fileName,
      fileType,
    }) => {
      const DocViewer = mod.default
      const renderers = mod.DocViewerRenderers
      return (
        <DocViewer
          documents={[{ uri: url, fileName, fileType }]}
          pluginRenderers={renderers}
          config={{
            header: { disableHeader: true },
            pdfZoom: { defaultZoom: 1, zoomJump: 0.2 },
            pdfVerticalScrollByDefault: true,
          }}
          theme={{
            primary: "rgb(var(--primary, 0 0 0))",
            secondary: "rgb(var(--secondary, 200 200 200))",
            tertiary: "rgb(var(--muted, 240 240 240))",
            textPrimary: "rgb(var(--foreground, 0 0 0))",
            textSecondary: "rgb(var(--muted-foreground, 100 100 100))",
            disableThemeScrollbar: false,
          }}
          style={{ width: "100%", height: "100%" }}
        />
      )
    }
    Inner.displayName = "DocViewerLazy"
    return Inner
  },
  {
    ssr: false,
    loading: () => <ViewerSpinner />,
  },
)

// ─── Sub-viewer'lar ─────────────────────────────────────────────────────

function ViewerSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <HugeiconsIcon
        icon={Loading03Icon}
        strokeWidth={2}
        className="size-8 animate-spin"
      />
    </div>
  )
}

function ViewerError({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={1.5}
        className="size-10 text-destructive/70"
      />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function UnsupportedViewer({ item, onDownload }: {
  item: FilePreviewItem
  onDownload: () => void
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <HugeiconsIcon
        icon={File01Icon}
        strokeWidth={1.5}
        className="size-14 text-muted-foreground/50"
      />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        <p className="text-xs">
          {item.mimeType || "Unknown type"} — preview not available
        </p>
      </div>
      <button
        type="button"
        onClick={onDownload}
        className="mt-2 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-3.5" />
        Download
      </button>
    </div>
  )
}

interface ImageViewerProps {
  item: FilePreviewItem
}

function ImageViewer({ item }: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, controls] = useImageGesture({
    containerRef,
    sourceKey: item.url,
  })
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Reset loaded/error on source change
  useEffect(() => {
    setError(false)
    setLoaded(false)
  }, [item.url])

  // Klavye kısayolları image viewer aktifken
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        controls.zoomIn()
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        controls.zoomOut()
      } else if (e.key === "0") {
        e.preventDefault()
        controls.reset()
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault()
        controls.rotate()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [controls])

  const transform = `translate(-50%, -50%) translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale}) rotate(${state.rotate}deg)`

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden touch-none select-none",
        state.isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
      // Tarayıcının kendi resim sürüklemesi gesture'ları çakışıyor
      onDragStart={(e) => e.preventDefault()}
    >
      {!loaded && !error && <ViewerSpinner />}
      {error ? (
        <ViewerError message="Failed to load image" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.name}
          draggable={false}
          // İlk açılışta resim natural boyutu container'dan büyükse
          // (özellikle uzun portraitlerde), default scale=1 ekran dışına
          // taşıyordu. Container'a fit edecek scale hesaplayıp set ediyoruz.
          onLoad={(e) => {
            setLoaded(true)
            const img = e.currentTarget
            const node = containerRef.current
            if (!node) return
            const cw = node.clientWidth
            const ch = node.clientHeight
            const nw = img.naturalWidth
            const nh = img.naturalHeight
            if (cw > 0 && ch > 0 && nw > 0 && nh > 0) {
              const fit = Math.min(cw / nw, ch / nh, 1)
              if (fit < 1) {
                controls.setScale(fit)
              }
            }
          }}
          onError={() => setError(true)}
          className={cn(
            "absolute left-1/2 top-1/2 max-h-none max-w-none origin-center will-change-transform",
            !loaded && "opacity-0",
          )}
          style={{
            transform,
            transformOrigin: "center center",
            // Tarayıcı default image rendering'i — vector için önemli değil,
            // raster için interpolation kalitesi.
            imageRendering: state.scale > 4 ? "pixelated" : "auto",
          }}
        />
      )}
    </div>
  )
}

// ── Custom media player ────────────────────────────────────────────────
//
// Browser-native <video controls> / <audio controls> look out of place
// inside our own lightbox chrome — every browser draws them slightly
// differently, the audio bar is microscopic on Chrome, and we can't
// theme any of them. The viewers below render a styled overlay UI on
// top of bare <video>/<audio> elements (controls disabled), driven by
// a small reusable hook that mirrors the element state into React.

interface MediaPlayerState {
  playing: boolean
  currentTime: number
  duration: number
  bufferedEnd: number
  volume: number
  muted: boolean
  loading: boolean
  ended: boolean
  /** Playback rate — 1 = normal, 0.5 half-speed, 2 double, etc. */
  rate: number
}

interface MediaPlayerControls {
  toggle: () => void
  play: () => void
  pause: () => void
  seek: (sec: number) => void
  skip: (delta: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setRate: (rate: number) => void
}

/**
 * Bridges an <audio>/<video> element into React state. The element
 * stays the source of truth — we only mirror the pieces the UI needs
 * to render (current time, buffered range, volume, etc). All control
 * callbacks (`play`, `seek`, `setVolume`) call the underlying element
 * directly so they stay in lockstep with whatever the browser is
 * actually doing under the hood.
 */
function useMediaPlayer(
  ref: React.RefObject<HTMLMediaElement | null>,
  options?: { resetKey?: string },
): { state: MediaPlayerState; controls: MediaPlayerControls } {
  const [state, setState] = useState<MediaPlayerState>(() => ({
    playing: false,
    currentTime: 0,
    duration: 0,
    bufferedEnd: 0,
    volume: 1,
    muted: false,
    loading: true,
    ended: false,
    rate: 1,
  }))

  // Reset whenever the source flips — caller passes `resetKey` (the
  // item URL or id) so we don't carry stale playback state into a
  // freshly-loaded media file.
  useEffect(() => {
    setState((s) => ({
      ...s,
      playing: false,
      currentTime: 0,
      duration: 0,
      bufferedEnd: 0,
      loading: true,
      ended: false,
    }))
  }, [options?.resetKey])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      setState((s) => ({
        ...s,
        currentTime: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : s.duration,
        bufferedEnd:
          el.buffered.length > 0
            ? el.buffered.end(el.buffered.length - 1)
            : 0,
        volume: el.volume,
        muted: el.muted,
        rate: el.playbackRate,
      }))
    }
    const onPlay = () => setState((s) => ({ ...s, playing: true, ended: false }))
    const onPause = () => setState((s) => ({ ...s, playing: false }))
    const onLoadStart = () => setState((s) => ({ ...s, loading: true }))
    const onCanPlay = () => setState((s) => ({ ...s, loading: false }))
    const onEnded = () =>
      setState((s) => ({ ...s, playing: false, ended: true }))

    el.addEventListener("timeupdate", update)
    el.addEventListener("durationchange", update)
    el.addEventListener("progress", update)
    el.addEventListener("volumechange", update)
    el.addEventListener("ratechange", update)
    el.addEventListener("play", onPlay)
    el.addEventListener("playing", onPlay)
    el.addEventListener("pause", onPause)
    el.addEventListener("loadstart", onLoadStart)
    el.addEventListener("canplay", onCanPlay)
    el.addEventListener("waiting", onLoadStart)
    el.addEventListener("ended", onEnded)
    update()
    // Initial-load yarışı: <video src=...> çoktan `canplay` fırlatmış
    // olabilir (cache hit / küçük dosya / hızlı network). Listener'lar
    // mount sonrası attach edildiği için bu fire'ı kaçırırdık ve
    // `loading=true` ilk seek'e kadar kilitli kalırdı. readyState >= 3
    // (HAVE_FUTURE_DATA) olduğu durumda loading'i resolve et — `canplay`
    // event'i ile aynı anlama gelir.
    if (el.readyState >= 3) {
      setState((s) => (s.loading ? { ...s, loading: false } : s))
    }
    return () => {
      el.removeEventListener("timeupdate", update)
      el.removeEventListener("durationchange", update)
      el.removeEventListener("progress", update)
      el.removeEventListener("volumechange", update)
      el.removeEventListener("ratechange", update)
      el.removeEventListener("play", onPlay)
      el.removeEventListener("playing", onPlay)
      el.removeEventListener("pause", onPause)
      el.removeEventListener("loadstart", onLoadStart)
      el.removeEventListener("canplay", onCanPlay)
      el.removeEventListener("waiting", onLoadStart)
      el.removeEventListener("ended", onEnded)
    }
  }, [ref, options?.resetKey])

  const controls = useMemo<MediaPlayerControls>(
    () => ({
      play: () => {
        ref.current?.play().catch(() => {})
      },
      pause: () => ref.current?.pause(),
      toggle: () => {
        const el = ref.current
        if (!el) return
        if (el.paused) el.play().catch(() => {})
        else el.pause()
      },
      seek: (sec: number) => {
        const el = ref.current
        if (!el) return
        // ⚠ `el.duration || 0` bilinmeyen (NaN) süreyi 0'a çeviriyordu →
        // `Math.min(sec, 0)` = 0 → her seek/skip başa sarıyordu. Süre geçerli
        // değilse Infinity ile clamp'le (yani clamp yapma).
        const dur =
          Number.isFinite(el.duration) && el.duration > 0
            ? el.duration
            : Infinity
        el.currentTime = Math.max(0, Math.min(sec, dur))
      },
      skip: (delta: number) => {
        const el = ref.current
        if (!el) return
        const dur =
          Number.isFinite(el.duration) && el.duration > 0
            ? el.duration
            : Infinity
        el.currentTime = Math.max(0, Math.min(el.currentTime + delta, dur))
      },
      setVolume: (v: number) => {
        const el = ref.current
        if (!el) return
        el.volume = Math.max(0, Math.min(1, v))
        if (el.volume > 0) el.muted = false
      },
      toggleMute: () => {
        const el = ref.current
        if (!el) return
        el.muted = !el.muted
      },
      setRate: (rate: number) => {
        const el = ref.current
        if (!el) return
        // Browser-wide safe range — anything past 4x is choppy and
        // <0.25 turns into "frozen audio". Clamp instead of letting
        // the caller pass extremes through.
        el.playbackRate = Math.max(0.25, Math.min(4, rate))
      },
    }),
    [ref],
  )

  return { state, controls }
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00"
  const total = Math.floor(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
  return `${m}:${sec.toString().padStart(2, "0")}`
}

/**
 * Scrub track with buffered + played overlays. Click anywhere to
 * seek; drag to scrub. Renders with a thin idle bar that grows on
 * hover so it stays visually quiet when not in use.
 */
function ScrubBar({
  current,
  duration,
  buffered,
  onSeek,
  className,
}: {
  current: number
  duration: number
  buffered: number
  onSeek: (sec: number) => void
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  // Hover-time preview — shows the timestamp under the cursor so
  // users can scrub to a specific spot without overshooting.
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)

  const ratio = duration > 0 ? Math.min(current / duration, 1) : 0
  const bufRatio = duration > 0 ? Math.min(buffered / duration, 1) : 0

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el || duration <= 0) return
      const rect = el.getBoundingClientRect()
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
      const r = rect.width > 0 ? x / rect.width : 0
      onSeek(r * duration)
    },
    [duration, onSeek],
  )

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={current}
      // Pointer events + setPointerCapture: önceki mousedown+window-mousemove
      // sürümü tarayıcının native text-selection drag'ine yakalanıp seek
      // sırasında mousemove'leri kaybediyordu. Pointer capture sürükleme
      // boyunca tüm event'leri bu öğeye yönlendirir; preventDefault selection
      // ve drag-image yan etkilerini bastırır.
      onPointerDown={(e) => {
        if (e.button !== undefined && e.button !== 0) return
        e.preventDefault()
        const el = trackRef.current
        if (el) el.setPointerCapture(e.pointerId)
        setDragging(true)
        seekFromEvent(e.clientX)
      }}
      onPointerMove={(e) => {
        const el = trackRef.current
        if (!el || duration <= 0) return
        if (dragging) {
          seekFromEvent(e.clientX)
        }
        const rect = el.getBoundingClientRect()
        const r = (e.clientX - rect.left) / rect.width
        setHoverRatio(Math.max(0, Math.min(1, r)))
      }}
      onPointerUp={(e) => {
        const el = trackRef.current
        if (el && el.hasPointerCapture(e.pointerId))
          el.releasePointerCapture(e.pointerId)
        setDragging(false)
      }}
      onPointerCancel={() => setDragging(false)}
      onMouseLeave={() => {
        if (!dragging) setHoverRatio(null)
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onSeek(Math.max(0, current - 5))
        if (e.key === "ArrowRight") onSeek(current + 5)
      }}
      className={cn(
        "group/scrub relative flex h-4 cursor-pointer touch-none select-none items-center",
        className,
      )}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/15 transition-all group-hover/scrub:h-1.5">
        {/* Buffered range — paler than the played fill so the user
            can see how much of the file is downloaded but not yet
            played. */}
        <div
          className="absolute inset-y-0 left-0 bg-white/25"
          style={{ width: `${bufRatio * 100}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-primary"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {/* Drag thumb — only visible on hover/drag, otherwise the bar
          stays minimal. */}
      <div
        className={cn(
          "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow ring-2 ring-background transition-opacity",
          dragging || hoverRatio !== null ? "opacity-100" : "opacity-0",
        )}
        style={{ left: `${ratio * 100}%` }}
      />
      {hoverRatio !== null && duration > 0 ? (
        <div
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background shadow"
          style={{ left: `${hoverRatio * 100}%` }}
        >
          {formatTime(hoverRatio * duration)}
        </div>
      ) : null}
    </div>
  )
}

/** Volume slider with a click-to-mute icon. Layout is icon + a slim
 *  10-rem track on hover/desktop; the icon alone is fine on mobile. */
function VolumeControl({
  volume,
  muted,
  onSetVolume,
  onToggleMute,
}: {
  volume: number
  muted: boolean
  onSetVolume: (v: number) => void
  onToggleMute: () => void
}) {
  const effective = muted ? 0 : volume
  const icon =
    effective === 0
      ? VolumeMute02Icon
      : effective < 0.5
        ? VolumeLowIcon
        : VolumeHighIcon
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const setFromX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
      onSetVolume(rect.width > 0 ? x / rect.width : 0)
    },
    [onSetVolume],
  )

  // Pointer capture ile drag — mousedown+window-mousemove sürümü
  // tarayıcının text-selection drag'ine takılıyordu, drag boyunca
  // mousemove kaybediliyor; click çalışıyor ama sürükleme çalışmıyordu.
  // Pointer capture seçim ve drag-image yan etkilerini bastırır.

  return (
    <div className="group/vol flex h-8 items-center">
      <button
        type="button"
        onClick={onToggleMute}
        className="inline-flex size-8 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground"
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
      </button>
      {/* Custom slider — flex-aligned with the icon's vertical
          midpoint, expands on hover. Native `<input type=range>`
          drew a thin track with a tiny native thumb that floated
          above the icon centerline; this version paints a 4px
          rounded track, a primary fill, and a draggable disc that
          all share the same y-axis as the icon. */}
      <div
        className={cn(
          "hidden overflow-hidden transition-[width] duration-200 sm:block",
          dragging
            ? "w-24"
            : "w-0 group-hover/vol:w-24 group-focus-within/vol:w-24",
        )}
      >
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={effective}
          aria-label="Volume"
          onPointerDown={(e) => {
            if (e.button !== undefined && e.button !== 0) return
            e.preventDefault()
            const el = trackRef.current
            if (el) el.setPointerCapture(e.pointerId)
            setDragging(true)
            setFromX(e.clientX)
          }}
          onPointerMove={(e) => {
            if (dragging) setFromX(e.clientX)
          }}
          onPointerUp={(e) => {
            const el = trackRef.current
            if (el && el.hasPointerCapture(e.pointerId))
              el.releasePointerCapture(e.pointerId)
            setDragging(false)
          }}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onSetVolume(Math.max(0, effective - 0.05))
            if (e.key === "ArrowRight") onSetVolume(Math.min(1, effective + 0.05))
          }}
          className="relative ms-1 flex h-8 w-full cursor-pointer touch-none select-none items-center"
        >
          <div className="relative h-1 w-full rounded-full bg-white/25">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${effective * 100}%` }}
            />
            <div
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow ring-2 ring-background transition-transform group-hover/vol:scale-110"
              style={{ left: `${effective * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Round skip button — backward / forward arrow with a small "10"
 *  badge so the user knows the step size. Uses the `Backward01Icon`
 *  / `Forward01Icon` pair. */
function SkipButton({
  direction,
  seconds = 10,
  onClick,
}: {
  direction: "back" | "forward"
  seconds?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${direction === "back" ? "Back" : "Forward"} ${seconds}s`}
      aria-label={`Skip ${direction} ${seconds} seconds`}
      className="relative inline-flex size-9 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground"
    >
      <HugeiconsIcon
        icon={direction === "back" ? Backward01Icon : Forward01Icon}
        strokeWidth={2}
        className="size-4"
      />
      <span className="pointer-events-none absolute right-0.5 top-0.5 rounded bg-background/40 px-1 text-[8.5px] font-semibold text-foreground/80">
        {seconds}
      </span>
    </button>
  )
}

function PlayPauseButton({
  playing,
  onClick,
  size = "md",
}: {
  playing: boolean
  onClick: () => void
  size?: "md" | "lg"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={playing ? "Pause" : "Play"}
      aria-label={playing ? "Pause" : "Play"}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:brightness-110 active:scale-95",
        size === "lg" ? "size-14" : "size-10",
      )}
    >
      <HugeiconsIcon
        icon={playing ? PauseIcon : PlayIcon}
        strokeWidth={2}
        className={cn(
          size === "lg" ? "size-6" : "size-5",
          // Play icon is visually right-heavy — a tiny nudge centers
          // it inside the disc.
          !playing && "translate-x-[1px]",
        )}
      />
    </button>
  )
}

/**
 * Refresh-style skip button — `Refresh01Icon` is the curved circular
 * arrow we picked for the player's center cluster (the previous
 * straight `Backward01Icon` looked stiff next to the round play
 * disc). Forward direction renders the icon as-is; backward flips
 * horizontally so the curl points left. The seconds amount appears
 * inside the curl so the user reads "↻ 10".
 */
function SkipRefreshButton({
  direction,
  seconds = 10,
  onClick,
  size = "md",
}: {
  direction: "back" | "forward"
  seconds?: number
  onClick: () => void
  size?: "sm" | "md"
}) {
  const dim = size === "sm" ? "size-9" : "size-12"
  const iconSize = size === "sm" ? "size-4" : "size-5"
  const numSize = size === "sm" ? "text-[7.5px]" : "text-[9px]"
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${direction === "back" ? "Back" : "Forward"} ${seconds}s`}
      aria-label={`Skip ${direction} ${seconds} seconds`}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/60",
        dim,
      )}
    >
      <HugeiconsIcon
        icon={Refresh01Icon}
        strokeWidth={2}
        className={cn(
          iconSize,
          // Refresh01Icon's curl points right; flip horizontally for
          // the back direction so it reads "↺".
          direction === "back" && "-scale-x-100",
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute font-semibold tabular-nums",
          numSize,
        )}
      >
        {seconds}
      </span>
    </button>
  )
}

/**
 * Pill-shaped time display. Rendered as a button so it picks up the
 * settings-button hover treatment (rounded background reveal); tap
 * flips between elapsed-vs-total and remaining-vs-total — same
 * convention as YouTube/Apple Music. No icon by design — the
 * timestamps already self-label.
 */
function TimePill({
  current,
  duration,
}: {
  current: number
  duration: number
}) {
  const [showRemaining, setShowRemaining] = useState(false)
  const left = Math.max(0, duration - current)
  return (
    <button
      type="button"
      onClick={() => setShowRemaining((v) => !v)}
      title={showRemaining ? "Show elapsed" : "Show remaining"}
      className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 font-mono text-[11px] tabular-nums text-white/85 transition-colors hover:bg-white/10 hover:text-white"
    >
      <span>{showRemaining ? `-${formatTime(left)}` : formatTime(current)}</span>
      <span className="opacity-50">/</span>
      <span className="opacity-70">{formatTime(duration)}</span>
    </button>
  )
}

/** YouTube-aligned playback rate ladder. 0.5 / 1 / 1.25 / 1.5 / 2
 *  covers the "skim a tutorial" → "podcast on the run" range without
 *  cluttering the menu. 0.75 included because audiobooks use it. */
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

function PlaybackRateMenuGroup({
  rate,
  onSetRate,
}: {
  rate: number
  onSetRate: (r: number) => void
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
      {PLAYBACK_RATES.map((r) => (
        <DropdownMenuItem key={r} onClick={() => onSetRate(r)}>
          {r === 1 ? "Normal" : `${r}x`}
          {Math.abs(rate - r) < 0.001 ? (
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2.5}
              className="ms-auto size-3.5"
            />
          ) : null}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  )
}

/**
 * Common keyboard shortcuts for both audio and video viewers:
 *   space → toggle play
 *   ← / → → skip backward / forward 5s (10s with shift)
 *   ↑ / ↓ → volume +/- 5%
 *   m → mute toggle
 *   f → fullscreen toggle (callback optional, only video uses it)
 */
function useMediaKeyboard(
  controls: MediaPlayerControls,
  state: MediaPlayerState,
  onFullscreen?: () => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't fight inputs — the user might be typing into a search
      // box stacked above the lightbox. document.activeElement gives
      // us the focused element across portals.
      const ae = document.activeElement
      if (
        ae instanceof HTMLInputElement ||
        ae instanceof HTMLTextAreaElement ||
        ae instanceof HTMLSelectElement ||
        (ae instanceof HTMLElement && ae.isContentEditable)
      ) {
        return
      }
      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault()
          controls.toggle()
          break
        case "ArrowLeft":
          e.preventDefault()
          controls.skip(e.shiftKey ? -10 : -5)
          break
        case "ArrowRight":
          e.preventDefault()
          controls.skip(e.shiftKey ? 10 : 5)
          break
        case "ArrowUp":
          e.preventDefault()
          controls.setVolume(Math.min(1, state.volume + 0.05))
          break
        case "ArrowDown":
          e.preventDefault()
          controls.setVolume(Math.max(0, state.volume - 0.05))
          break
        case "m":
        case "M":
          e.preventDefault()
          controls.toggleMute()
          break
        case "f":
        case "F":
          if (onFullscreen) {
            e.preventDefault()
            onFullscreen()
          }
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [controls, state.volume, onFullscreen])
}

function VideoViewer({
  item,
  embed = false,
}: {
  item: FilePreviewItem
  /** Embed-mode strips download + PiP + any other action that
   *  doesn't make sense inside an iframe (PiP can confuse the host
   *  page, downloads are usually disallowed for embeds). */
  embed?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { state, controls } = useMediaPlayer(videoRef, { resetKey: item.url })
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Auto-hide overlay on idle — fades the controls away after 2.5s
  // of no mouse movement so the user gets an unobstructed view of
  // the video. Any mouse move (or tap) brings them back.
  const [overlayVisible, setOverlayVisible] = useState(true)
  const idleTimer = useRef<number | null>(null)

  // Loop, picture-in-picture, quality. Loop wraps the underlying
  // <video loop> attribute so the browser handles wrap-around
  // natively (no JS seek-to-zero on ended). PiP uses the standard
  // browser API; falls back to a no-op when unsupported.
  const playerInit = item.playerInit
  const [loop, setLoop] = useState(playerInit?.loop ?? false)
  const [pipActive, setPipActive] = useState(false)
  // Embed-style chrome suppression — when ?controls=0 in the embed
  // URL, drop both transport bars and the center cluster so the
  // iframe shows just the raw video frame. Click-to-toggle still
  // works on the surface.
  const hideChrome = playerInit?.hideControls === true

  // Quality picker — drained from item.variants where kind === "video".
  // The active URL is what we feed into <video src>; flipping it
  // restores currentTime + play state so the swap feels seamless.
  const videoVariants = useMemo(
    () =>
      (item.variants ?? []).filter((v) => v.kind === "video"),
    [item.variants],
  )
  // Default-quality picker: 480p when the ladder includes it,
  // otherwise the largest rung that's still below 720p, otherwise
  // the first rung, otherwise the original. This avoids loading the
  // multi-megabyte original by default — most users are happy with
  // 480p and can manually upgrade via the settings menu.
  const pickDefaultVariantUrl = useCallback(
    (variants: typeof videoVariants, originalUrl: string): string => {
      if (variants.length === 0) return originalUrl
      const exact480 = variants.find((v) => v.label === "480p")
      if (exact480) return exact480.url
      // Fallback: heaviest rung at or below 480p label parsed as int
      // (works for "480p", "720p" etc), else the smallest rung.
      const labelHeight = (label: string) => {
        const m = /^(\d+)p$/.exec(label)
        return m ? Number(m[1]) : 0
      }
      const sorted = [...variants].sort(
        (a, b) => labelHeight(a.label) - labelHeight(b.label),
      )
      const upTo480 = sorted.filter((v) => labelHeight(v.label) <= 480)
      if (upTo480.length > 0) return upTo480[upTo480.length - 1]!.url
      return sorted[0]!.url
    },
    [],
  )
  const [activeVariantUrl, setActiveVariantUrl] = useState<string>(() =>
    pickDefaultVariantUrl(videoVariants, item.url),
  )
  useEffect(() => {
    setActiveVariantUrl(pickDefaultVariantUrl(videoVariants, item.url))
  }, [item.url, videoVariants, pickDefaultVariantUrl])

  // Custom context menu — replaces the browser's right-click on the
  // video surface with a Sentroy-themed Loop/Copy URL/PiP/Download
  // menu. Coordinates are clamped to the viewport so the menu doesn't
  // overflow when summoned near an edge.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(
    null,
  )
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [ctxMenu])

  const showOverlay = useCallback(() => {
    setOverlayVisible(true)
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => {
      // Only fade if the video is actually playing — paused state
      // should always show controls (otherwise users can't restart).
      if (videoRef.current && !videoRef.current.paused) {
        setOverlayVisible(false)
      }
    }, 2500)
  }, [])

  // Hide on cursor leave too — when the user pulls the mouse off
  // the video surface entirely, the overlay should drop immediately
  // (mirrors YouTube). Only when actively playing; while paused we
  // keep the controls accessible.
  const hideOverlayNow = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    if (videoRef.current && !videoRef.current.paused) {
      setOverlayVisible(false)
    }
  }, [])

  useEffect(() => {
    showOverlay()
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
    }
  }, [showOverlay])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }, [])

  const togglePip = useCallback(async () => {
    const el = videoRef.current
    if (!el) return
    try {
      if (
        document.pictureInPictureElement &&
        document.pictureInPictureElement === el
      ) {
        await document.exitPictureInPicture()
      } else if (typeof el.requestPictureInPicture === "function") {
        await el.requestPictureInPicture()
      }
    } catch {
      // Browser may refuse if the document hasn't been interacted
      // with yet; surface no error toast — user just retries.
    }
  }, [])

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(item.url)
    } catch {
      /* clipboard API blocked — silently no-op */
    }
  }, [item.url])

  // Build the embed iframe snippet from the public `/embed/<id>`
  // route. Resolves origin from the current page so it works on any
  // deployment (dev → localhost, prod → storage.sentroy.com); the
  // page itself is the same host that serves the lightbox so a
  // simple `window.location.origin` is correct.
  const copyEmbed = useCallback(async () => {
    if (typeof window === "undefined") return
    const origin = window.location.origin
    const snippet =
      `<iframe src="${origin}/embed/${item.id}" width="640" height="360" ` +
      `frameborder="0" allow="autoplay; fullscreen; picture-in-picture" ` +
      `allowfullscreen></iframe>`
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      /* clipboard blocked */
    }
  }, [item.id])

  const switchQuality = useCallback((url: string) => {
    const el = videoRef.current
    if (!el) {
      setActiveVariantUrl(url)
      return
    }
    // Preserve playback position + play state across the swap so
    // the user doesn't get bounced back to t=0.
    const wasPlaying = !el.paused
    const at = el.currentTime
    setActiveVariantUrl(url)
    // After React rerenders <video src=...>, the metadata `loadeddata`
    // event fires; we reapply currentTime + play() then.
    const onLoaded = () => {
      try {
        el.currentTime = at
        if (wasPlaying) void el.play().catch(() => {})
      } catch {
        /* ignore — user can scrub manually */
      }
      el.removeEventListener("loadeddata", onLoaded)
    }
    el.addEventListener("loadeddata", onLoaded)
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onEnter = () => setPipActive(true)
    const onLeave = () => setPipActive(false)
    el.addEventListener("enterpictureinpicture", onEnter)
    el.addEventListener("leavepictureinpicture", onLeave)
    return () => {
      el.removeEventListener("enterpictureinpicture", onEnter)
      el.removeEventListener("leavepictureinpicture", onLeave)
    }
  }, [])

  useMediaKeyboard(controls, state, toggleFullscreen)

  // Apply embed playerInit once — autoplay needs muted in modern
  // browsers (Chrome refuses unmuted autoplay without user gesture),
  // start jumps to the configured offset on canplay, muted defaults
  // to playerInit.muted. Re-runs on item.url change so a new file
  // honours its own params.
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (playerInit?.muted) el.muted = true
    if (typeof playerInit?.start === "number" && playerInit.start > 0) {
      const seekOnce = () => {
        try {
          el.currentTime = playerInit.start!
        } catch {
          /* duration not yet known — best-effort */
        }
        el.removeEventListener("loadedmetadata", seekOnce)
      }
      el.addEventListener("loadedmetadata", seekOnce)
    }
    if (playerInit?.autoplay) {
      // Browsers only allow autoplay when muted (or after a user
      // gesture). We force muted to give the autoplay a fighting
      // chance, then attempt play(). Failure is silent — user can
      // still click the play disc.
      el.muted = true
      el.play().catch(() => {})
    }
  }, [playerInit, item.url])

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/video relative flex h-full w-full items-center justify-center bg-black",
        // Hide cursor in lockstep with the overlay — once controls
        // fade out the pointer should disappear too so the video
        // sits on a fully unobstructed surface. Reappears on the
        // next mouse move.
        !overlayVisible && state.playing && "cursor-none",
      )}
      onMouseMove={showOverlay}
      onMouseLeave={hideOverlayNow}
      // PointerLeave covers the case where MouseLeave doesn't fire
      // because pointer capture has snagged the event (e.g. the
      // user drags the scrubber out past the video edge). Both
      // listeners are bound for redundancy.
      onPointerLeave={hideOverlayNow}
      onContextMenu={(e) => {
        e.preventDefault()
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        // Clamp the menu so it never overflows the viewer; assumes a
        // ~210x250 menu shape. Conservative — slight whitespace on
        // tight corners is preferable to an off-screen submenu.
        const x = Math.min(e.clientX, rect.right - 220)
        const y = Math.min(e.clientY, rect.bottom - 250)
        setCtxMenu({ x: Math.max(rect.left + 8, x), y: Math.max(rect.top + 8, y) })
      }}
      onClick={(e) => {
        // Click on the video surface (not on the control bar) → toggle play
        if (e.target === e.currentTarget || e.target === videoRef.current) {
          controls.toggle()
          showOverlay()
        }
      }}
    >
      <video
        ref={videoRef}
        src={activeVariantUrl}
        autoPlay={false}
        loop={loop}
        // Lock the rendered box to the container instead of the
        // file's intrinsic size; without this, a 480p variant snaps
        // the player to ~854x480 even when the container has
        // 1920x1080 of room. `object-contain` preserves the
        // aspect ratio inside the locked box, so quality switches
        // change *bytes* but never the on-screen footprint.
        className="h-full w-full object-contain"
        preload="metadata"
        playsInline
        controlsList="nodownload"
      >
        <track kind="captions" />
      </video>

      {state.loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            className="size-10 animate-spin text-white/80"
          />
        </div>
      ) : null}

      {/* Center cluster — skip-back ▸ play/pause ▸ skip-forward.
          One unit, dead-center, always reachable in roughly the
          same place. Fades with the rest of the overlay (mouse idle
          while playing) but always visible while paused so the user
          can re-start without wiggling the mouse.
          Embed `?controls=0` hides the cluster entirely. */}
      {!state.loading && !hideChrome ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200",
            overlayVisible || !state.playing ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="pointer-events-auto flex items-center gap-5">
            <SkipRefreshButton
              direction="back"
              onClick={() => {
                controls.skip(-10)
                showOverlay()
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                controls.toggle()
                showOverlay()
              }}
              className="inline-flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105"
              aria-label={state.playing ? "Pause" : "Play"}
            >
              <HugeiconsIcon
                icon={state.playing ? PauseIcon : PlayIcon}
                strokeWidth={2}
                className={cn(
                  "size-9",
                  // Play icon visually right-heavy — nudge so the
                  // glyph sits centered in the disc.
                  !state.playing && "translate-x-[2px]",
                )}
              />
            </button>
            <SkipRefreshButton
              direction="forward"
              onClick={() => {
                controls.skip(10)
                showOverlay()
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Bottom transport bar — overlaid on a soft gradient so it
          stays legible against bright video frames. Auto-hides on
          idle (see `overlayVisible`). Embed `?controls=0` removes
          the bar entirely so the iframe ships pure video. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-10 text-white transition-opacity duration-200",
          overlayVisible ? "opacity-100" : "opacity-0",
          hideChrome && "hidden",
        )}
      >
        <div
          className="pointer-events-auto"
          onMouseMove={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <ScrubBar
            current={state.currentTime}
            duration={state.duration}
            buffered={state.bufferedEnd}
            onSeek={controls.seek}
          />
          <div className="mt-2 flex items-center gap-1.5">
            <PlayPauseButton
              playing={state.playing}
              onClick={controls.toggle}
            />
            {/* Volume right next to play — pair them as the "core
                playback controls" the user reaches for without
                thinking. Skip buttons moved to the center cluster
                so they're not duplicated here. */}
            <VolumeControl
              volume={state.volume}
              muted={state.muted}
              onSetVolume={controls.setVolume}
              onToggleMute={controls.toggleMute}
            />
            {/* Time pill — settings-style rounded button, no icon,
                hover background reveal so it reads "interactive".
                Tap-to-toggle remaining-vs-elapsed view. */}
            <TimePill
              current={state.currentTime}
              duration={state.duration}
            />
            <div className="ms-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLoop((v) => !v)}
                title={loop ? "Loop on" : "Loop off"}
                aria-pressed={loop}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10",
                  loop ? "text-primary" : "text-foreground/80",
                )}
              >
                <HugeiconsIcon
                  icon={loop ? RepeatOneIcon : RepeatIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </button>
              {/* Download dropdown — moved here from the top toolbar
                  so the player owns its own actions. Original is
                  always available; ladder rungs land below as
                  separate "smaller file" picks. Image thumbnails are
                  intentionally excluded — the user wants the source
                  video in a smaller resolution, not a JPEG of the
                  first frame.
                  Hidden in embed mode — third-party iframes usually
                  don't want to expose a download action for the
                  embedded asset. */}
              {!embed && (() => {
                const variants = videoVariants
                const hasVariants = variants.length > 0
                if (!hasVariants) {
                  return (
                    <a
                      href={item.url}
                      download={item.name}
                      title="Download"
                      aria-label="Download"
                      className="inline-flex size-8 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground"
                    >
                      <HugeiconsIcon
                        icon={Download01Icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    </a>
                  )
                }
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          title="Download"
                          aria-label="Download"
                          className="inline-flex size-8 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground"
                        >
                          <HugeiconsIcon
                            icon={Download01Icon}
                            strokeWidth={2}
                            className="size-4"
                          />
                        </button>
                      }
                    />
                    <DropdownMenuContent
                      align="end"
                      side="top"
                      container={
                        isFullscreen ? containerRef.current : undefined
                      }
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Download</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            // Trigger a real anchor click so the
                            // browser respects the `download` attr.
                            // base-ui's MenuItem doesn't accept an
                            // `asChild` like Radix does — synthesize
                            // the anchor inline.
                            const a = document.createElement("a")
                            a.href = item.url
                            a.download = item.name
                            a.rel = "noopener"
                            document.body.appendChild(a)
                            a.click()
                            document.body.removeChild(a)
                          }}
                        >
                          Original
                          <span className="ms-auto text-xs text-muted-foreground">
                            {item.name.split(".").pop()?.toUpperCase()}
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          Variants
                        </DropdownMenuLabel>
                        {variants.map((v) => {
                          const sep = v.url.includes("?") ? "&" : "?"
                          const dlUrl = `${v.url}${sep}download=1&filename=${encodeURIComponent(item.name)}`
                          return (
                            <DropdownMenuItem
                              key={`${v.kind}-${v.url}`}
                              onClick={() => {
                                const a = document.createElement("a")
                                a.href = dlUrl
                                a.download = item.name
                                a.rel = "noopener"
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                              }}
                            >
                              {v.label}
                              {v.size ? (
                                <span className="ms-auto text-[10px] text-muted-foreground">
                                  {formatBytes(v.size)}
                                </span>
                              ) : null}
                            </DropdownMenuItem>
                          )
                        })}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              })()}
              {/* Settings dropdown — bundles playback rate + quality
                  in one place so the transport bar doesn't sprout a
                  control per option. Always rendered (rate is
                  universally available); quality section appears
                  only when the caller passed video variants. */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      title="Settings"
                      aria-label="Playback settings"
                      className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground"
                    >
                      <HugeiconsIcon
                        icon={Settings02Icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                      {state.rate !== 1 ? (
                        <span className="text-[10px] font-semibold tabular-nums">
                          {state.rate}x
                        </span>
                      ) : videoVariants.length > 0 ? (
                        <span className="text-[10px] font-semibold tabular-nums">
                          {videoVariants.find(
                            (v) => v.url === activeVariantUrl,
                          )?.label ?? "Original"}
                        </span>
                      ) : null}
                    </button>
                  }
                />
                <DropdownMenuContent align="end" side="top">
                  <PlaybackRateMenuGroup
                    rate={state.rate}
                    onSetRate={controls.setRate}
                  />
                  {videoVariants.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Quality</DropdownMenuLabel>
                        {/* "Original" intentionally omitted — it's
                            the heaviest variant and shipping it as
                            an explicit picker option encourages an
                            unnecessary switch to the un-transcoded
                            source. The transcoded ladder rungs are
                            quality-ordered options on their own. */}
                        {videoVariants.map((v) => (
                          <DropdownMenuItem
                            key={v.url}
                            onClick={() => switchQuality(v.url)}
                          >
                            {v.label}
                            {v.size ? (
                              <span className="ms-2 text-[10px] text-muted-foreground">
                                {formatBytes(v.size)}
                              </span>
                            ) : null}
                            {activeVariantUrl === v.url ? (
                              <HugeiconsIcon
                                icon={Tick02Icon}
                                strokeWidth={2.5}
                                className="ms-auto size-3.5"
                              />
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Picture-in-picture — embed iframes generally don't
                  want PiP because the parent page already controls
                  layout, and PiP detaches the video from that flow.
                  Dashboard keeps the button. */}
              {!embed && (
                <button
                  type="button"
                  onClick={togglePip}
                  title={pipActive ? "Exit picture-in-picture" : "Picture-in-picture"}
                  aria-label="Picture-in-picture"
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/10",
                    pipActive ? "text-primary" : "text-foreground/80",
                  )}
                >
                  <HugeiconsIcon
                    icon={PictureInPictureOnIcon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </button>
              )}
              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                aria-label={
                  isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
                className="inline-flex size-8 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={isFullscreen ? ArrowShrink02Icon : FullscreenIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Custom right-click menu — replaces the browser's native one
          (which exposes "Save video as" + a half-broken speed
          submenu). Items: Loop / Copy URL / Picture-in-picture /
          Download. Closes on any outside click via the global
          listener installed in the effect above. */}
      {ctxMenu ? (
        <div
          role="menu"
          className="fixed z-50 w-52 overflow-hidden rounded-lg border border-border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setLoop((v) => !v)
              setCtxMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <HugeiconsIcon
              icon={loop ? RepeatOneIcon : RepeatIcon}
              strokeWidth={2}
              className="size-4"
            />
            {loop ? "Disable loop" : "Enable loop"}
          </button>
          <button
            type="button"
            onClick={() => {
              void copyUrl()
              setCtxMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <HugeiconsIcon
              icon={Link02Icon}
              strokeWidth={2}
              className="size-4"
            />
            Copy video URL
          </button>
          <button
            type="button"
            onClick={() => {
              void copyEmbed()
              setCtxMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <HugeiconsIcon
              icon={Code02Icon}
              strokeWidth={2}
              className="size-4"
            />
            Copy embed code
          </button>
          <button
            type="button"
            onClick={() => {
              void togglePip()
              setCtxMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <HugeiconsIcon
              icon={PictureInPictureOnIcon}
              strokeWidth={2}
              className="size-4"
            />
            {pipActive ? "Exit picture-in-picture" : "Picture-in-picture"}
          </button>
          <a
            href={item.url}
            download={item.name}
            onClick={() => setCtxMenu(null)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <HugeiconsIcon
              icon={Download01Icon}
              strokeWidth={2}
              className="size-4"
            />
            Download
          </a>
          <div className="border-t border-border" />
          <button
            type="button"
            onClick={() => setCtxMenu(null)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-4"
            />
            Close menu
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * SoundCloud-style waveform scrubber. Decodes the audio file once
 * via Web Audio API into a sparse peak array (one value per bar),
 * then renders the bars onto a canvas. Played portion picks up the
 * primary tint, the unplayed remainder stays muted; hover dims the
 * yet-to-be-played side and shows a timestamp + seek-target marker
 * — clicking anywhere seeks.
 *
 * Decode is opportunistic — if the browser refuses (CORS, codec) we
 * silently render a flat skeleton so the user still has a click
 * target. Re-decode on `url` change so a quality switch picks up
 * the new file's peaks.
 */
function Waveform({
  url,
  current,
  duration,
  onSeek,
}: {
  url: string
  current: number
  duration: number
  onSeek: (sec: number) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [width, setWidth] = useState(0)
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)

  // BAR_TARGET_WIDTH is the design width (px) we *want* per bar at
  // 1× DPR. Real bar count derives from the container width so the
  // waveform fills the scrubber regardless of viewport size.
  const BAR_TARGET_WIDTH = 4
  const BAR_GAP = 2
  const barCount =
    width > 0 ? Math.max(40, Math.floor(width / (BAR_TARGET_WIDTH + BAR_GAP))) : 80

  // Track container width — recomputes bar count on resize so the
  // waveform doesn't stretch ugly on a window resize.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Decode the audio file into a peak array. Web Audio API gives us
  // raw float samples; we bucket them into `barCount` chunks and
  // take the max abs amplitude per chunk. Cancellable via the abort
  // controller so a fast quality switch doesn't paint stale peaks.
  useEffect(() => {
    if (!url || barCount === 0) return
    let cancelled = false
    setPeaks(null)
    ;(async () => {
      try {
        const res = await fetch(url, { mode: "cors" })
        if (!res.ok) throw new Error("fetch failed")
        const buf = await res.arrayBuffer()
        if (cancelled) return
        const ACtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        if (!ACtx) throw new Error("no AudioContext")
        const ctx = new ACtx()
        const audio = await ctx.decodeAudioData(buf.slice(0))
        if (cancelled) return
        const channel = audio.getChannelData(0)
        const samplesPerBar = Math.floor(channel.length / barCount)
        const out = new Array<number>(barCount)
        for (let i = 0; i < barCount; i++) {
          let peak = 0
          const start = i * samplesPerBar
          const end = start + samplesPerBar
          for (let j = start; j < end; j++) {
            const v = Math.abs(channel[j] ?? 0)
            if (v > peak) peak = v
          }
          out[i] = peak
        }
        // Normalise — silent files would render as flat zero,
        // amplify so even quiet tracks have visible bars.
        const max = out.reduce((a, b) => Math.max(a, b), 0)
        const scale = max > 0 ? 1 / max : 1
        setPeaks(out.map((v) => Math.max(0.05, v * scale)))
        ctx.close().catch(() => {})
      } catch {
        // CORS-blocked or unsupported codec — fall back to a flat
        // bar set so the scrubber still works.
        if (!cancelled) {
          setPeaks(new Array(barCount).fill(0.4))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url, barCount])

  // Repaint canvas whenever peaks/current/hover changes. Two passes:
  // background bars (full set) + played overlay (mask via clip).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks || width === 0) return
    const dpr = window.devicePixelRatio || 1
    const cssH = 56
    const cssW = width
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cssW, cssH)

    const playedRatio =
      duration > 0 ? Math.min(current / duration, 1) : 0
    const playedX = playedRatio * cssW
    const hoverX = hoverRatio !== null ? hoverRatio * cssW : null

    const totalBarSlot = cssW / peaks.length
    const barW = Math.max(1.5, totalBarSlot - BAR_GAP)
    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i] ?? 0
      const h = Math.max(2, peak * (cssH - 6))
      const x = i * totalBarSlot + (totalBarSlot - barW) / 2
      const y = (cssH - h) / 2
      const center = x + barW / 2
      // Three-zone tint:
      //   - already played: bright primary
      //   - hovered overlay (between current + hover cursor): soft
      //     primary tint so the user sees what they're about to seek to
      //   - unplayed: muted foreground
      // ⚠ Canvas fillStyle CSS `var()` ÇÖZEMEZ → `var(--primary)` geçersiz,
      // önceki/default (siyah) fillStyle kalıyordu → played barlar dark modda
      // görünmüyordu. Somut renk kullan (marka indigo'su, koyu zeminde görünür).
      let fill = "rgba(255,255,255,0.28)"
      if (center <= playedX) fill = "rgba(129,140,248,0.95)"
      else if (hoverX !== null && center <= hoverX)
        fill = "rgba(129,140,248,0.5)"
      ctx.fillStyle = fill
      ctx.fillRect(x, y, barW, h)
    }

    // Hover marker — thin vertical guide so the seek-target bar is
    // unmissable even on a dense waveform.
    if (hoverX !== null) {
      ctx.fillStyle = "rgba(255,255,255,0.85)"
      ctx.fillRect(hoverX - 0.5, 0, 1, cssH)
    }
  }, [peaks, width, current, duration, hoverRatio])

  const seekFromX = (clientX: number) => {
    const el = containerRef.current
    if (!el || duration <= 0) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    onSeek((x / rect.width) * duration)
  }

  return (
    <div
      ref={containerRef}
      className="relative h-14 w-full cursor-pointer select-none"
      onMouseMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setHoverRatio(
          Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        )
      }}
      onMouseLeave={() => setHoverRatio(null)}
      onClick={(e) => seekFromX(e.clientX)}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {hoverRatio !== null && duration > 0 ? (
        <div
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background shadow"
          style={{ left: `${hoverRatio * 100}%` }}
        >
          {formatTime(hoverRatio * duration)}
        </div>
      ) : null}
      {!peaks ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          Loading waveform…
        </div>
      ) : null}
    </div>
  )
}

function AudioViewer({ item }: { item: FilePreviewItem }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { state, controls } = useMediaPlayer(audioRef, { resetKey: item.url })

  useMediaKeyboard(controls, state)

  // Cosmetic — derive a soft tint from the file name so the album-
  // art card doesn't look identical for every track. Same hash
  // approach as the chip palette in the template library.
  const tint = useMemo(() => {
    const palette = [
      "from-rose-500/30 to-purple-500/30",
      "from-blue-500/30 to-cyan-500/30",
      "from-emerald-500/30 to-teal-500/30",
      "from-amber-500/30 to-orange-500/30",
      "from-fuchsia-500/30 to-pink-500/30",
      "from-indigo-500/30 to-sky-500/30",
    ]
    let h = 0
    for (let i = 0; i < item.name.length; i++) {
      h = (h * 31 + item.name.charCodeAt(i)) | 0
    }
    return palette[Math.abs(h) % palette.length]!
  }, [item.name])

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-6">
        {/* Hidden — audio element is invisible by design, the UI
            below drives playback. */}
        <audio ref={audioRef} src={item.url} preload="metadata">
          <track kind="captions" />
        </audio>

        {/* "Album art" tile — gradient + music note. Pulses subtly
            in beat with playback so the surface feels alive. */}
        <div
          className={cn(
            "relative aspect-square w-full overflow-hidden rounded-3xl bg-gradient-to-br shadow-xl",
            tint,
          )}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "flex size-32 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-transform duration-700",
                state.playing && "scale-110",
              )}
            >
              <HugeiconsIcon
                icon={MusicNote01Icon}
                strokeWidth={1.5}
                className="size-16 text-foreground/70"
              />
            </div>
          </div>
          {state.loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="size-8 animate-spin text-white"
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {item.name}
          </p>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatTime(state.currentTime)} / {formatTime(state.duration)}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Waveform replaces the plain scrub bar — gives a
              SoundCloud-style overview of the track's energy
              profile, hover preview + tap-to-seek inherited from
              the canvas surface. */}
          <Waveform
            url={item.url}
            current={state.currentTime}
            duration={state.duration}
            onSeek={controls.seek}
          />
          <div className="flex items-center justify-center gap-3">
            <SkipButton direction="back" onClick={() => controls.skip(-10)} />
            <PlayPauseButton
              playing={state.playing}
              onClick={controls.toggle}
              size="lg"
            />
            <SkipButton
              direction="forward"
              onClick={() => controls.skip(10)}
            />
          </div>
          <div className="flex items-center justify-center gap-1">
            <VolumeControl
              volume={state.volume}
              muted={state.muted}
              onSetVolume={controls.setVolume}
              onToggleMute={controls.toggleMute}
            />
            {/* Playback rate — same menu as the video viewer; here
                we surface the active rate next to the gear so a
                non-1x speed is glanceable. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    title="Playback speed"
                    aria-label="Playback speed"
                    className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-foreground/80 transition-colors hover:bg-foreground/10"
                  >
                    <HugeiconsIcon
                      icon={Settings02Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                    {state.rate !== 1 ? (
                      <span className="text-[10px] font-semibold tabular-nums">
                        {state.rate}x
                      </span>
                    ) : null}
                  </button>
                }
              />
              <DropdownMenuContent align="end" side="top">
                <PlaybackRateMenuGroup
                  rate={state.rate}
                  onSetRate={controls.setRate}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}

const TEXT_TOOLBAR_BTN =
  "inline-flex items-center gap-1 rounded-md border bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"

/** TextViewer'ın lightbox toolbar'ına lift ettiği düzenleme durumu — Save
 *  butonu artık ayrı bir çubukta değil, toolbar'da download'un yanında. */
export interface TextEditState {
  dirty: boolean
  saving: boolean
  save: () => void
}

function TextViewer({
  item,
  onSaveText,
  onEditState,
}: {
  item: FilePreviewItem
  onSaveText?: (item: FilePreviewItem, content: string) => Promise<void>
  onEditState?: (s: TextEditState | null) => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  // handleSave stabil kalsın (toolbar'a lift edilen save her keystroke'ta
  // değişmesin) diye draft/content ref'lerden okunur.
  const draftRef = useRef(draft)
  draftRef.current = draft
  const contentRef = useRef(content)
  contentRef.current = content

  const html = isHtmlName(item.name, item.mimeType)
  const md = isMarkdownName(item.name, item.mimeType)
  const isDark =
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : true

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)
    setTruncated(false)
    setShowPreview(false)
    // Per-mount cache-buster → dosyayı olabildiğince taze çek (edge/CDN
    // cache'i CF cache-key query'yi dikkate alıyorsa bypass olur).
    const sep = item.url.includes("?") ? "&" : "?"
    const url = `${item.url}${sep}_t=${Date.now()}`
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        // Cap at ~512 KB → büyük log dosyası tarayıcıyı kilitlemesin
        const MAX = 512 * 1024
        const slice = blob.size > MAX ? blob.slice(0, MAX) : blob
        const text = await slice.text()
        if (!cancelled) {
          setContent(text)
          setDraft(text)
          setTruncated(blob.size > MAX)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to fetch")
      })
    return () => {
      cancelled = true
    }
  }, [item.url])

  // Truncated dosyada edit KAPALI (kaydetmek ilk 512KB'lık kesiti yazıp
  // gerisini silerdi). editable/dirty + hook'lar erken-return'den ÖNCE —
  // hook'lar koşulsuz çalışmalı (rules of hooks).
  const editable = !!onSaveText && !truncated
  const dirty = editable && content !== null && draft !== content

  const handleSave = useCallback(async () => {
    if (!onSaveText) return
    const d = draftRef.current
    if (d === contentRef.current) return
    setSaving(true)
    try {
      await onSaveText(item, d)
      // Kaydedilen içerik authoritative — refetch YAPMA (CF stale cache'i
      // kullanıcının kaydını "geri almış" gibi gösterebilirdi).
      setContent(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }, [onSaveText, item])

  // Save durumunu lightbox toolbar'ına lift et → Save butonu ayrı çubukta
  // değil, download butonunun yanında görünür (dirty olunca).
  useEffect(() => {
    onEditState?.(editable ? { dirty, saving, save: handleSave } : null)
  }, [editable, dirty, saving, handleSave, onEditState])
  useEffect(() => () => onEditState?.(null), [onEditState])

  if (error) return <ViewerError message={error} />
  if (content === null) return <ViewerSpinner />

  // Slim çubuk artık YALNIZ HTML preview toggle için (Save toolbar'a taşındı).
  const showBar = html
  const previewSrc = html ? draft : ""

  return (
    <div className="flex h-full w-full flex-col">
      {showBar && (
        <div className="flex shrink-0 items-center gap-1.5 border-b bg-background/95 px-3 py-1.5">
          <button
            type="button"
            className={TEXT_TOOLBAR_BTN}
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? "Code" : "Preview"}
          </button>
        </div>
      )}
      {truncated && (
        <div className="shrink-0 border-b bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-700 dark:text-amber-400">
          File truncated to first 512 KB — read-only
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {md ? (
          // .md → toolbar + canlı preview'lı markdown editör (OS not-defteri hissi).
          <MarkdownLazy
            value={editable ? draft : content}
            theme={isDark ? "dark" : "light"}
            readOnly={!editable}
            onChange={editable ? setDraft : undefined}
          />
        ) : html && showPreview ? (
          <iframe
            title="HTML preview"
            // JS + modal/popup/form çalışsın; allow-same-origin YOK → preview
            // opaque-origin'de kalır (parent session/cookie'lerine erişemez —
            // güvenli). Inline + bundled script'ler çalışır.
            sandbox="allow-scripts allow-modals allow-popups allow-forms allow-pointer-lock"
            srcDoc={previewSrc}
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <MonacoLazy
            value={editable ? draft : content}
            language={monacoLang(item.name)}
            theme={isDark ? "dark" : "light"}
            readOnly={!editable}
            onChange={editable ? setDraft : undefined}
          />
        )}
      </div>
    </div>
  )
}

function PdfViewer({ item }: { item: FilePreviewItem }) {
  return (
    <DocViewerLazy
      url={item.url}
      fileName={item.name}
      fileType="pdf"
    />
  )
}

function OfficeViewer({ item }: { item: FilePreviewItem }) {
  // Uzantıyı çıkarıp DocViewer'a geçiyoruz; mime type unreliable durumlar
  // için (mail server bazı attachment'larda octet-stream döndürebilir)
  // file extension daha sağlam.
  const ext = item.name.split(".").pop()?.toLowerCase()
  return <DocViewerLazy url={item.url} fileName={item.name} fileType={ext} />
}

// ─── Toolbar ─────────────────────────────────────────────────────────────

interface ToolbarProps {
  item: FilePreviewItem
  kind: ViewerKind
  index: number
  total: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  onDownload: () => void
  /** Convert variant ile indirme — Toolbar dropdown opsiyonu açar; format
   *  ve label caller'ın tanımladığı formatlar üzerinden geçirilir. */
  onDownloadAs?: (format: string) => void
  /** Bu kind için hangi convert format'ları sunulacak. Boş array → dropdown
   *  açılmaz, basit download butonu render edilir. */
  convertFormats?: ConvertFormatOption[]
  // Sadece image viewer'da göster
  imageControls: {
    zoomIn: () => void
    zoomOut: () => void
    rotate: () => void
    reset: () => void
  } | null
  /** Text editör save durumu (kind==="text") — dirty ise download butonunun
   *  yanında bir Save butonu render edilir. */
  saveState?: TextEditState | null
  /**
   * Layout mode:
   *   - false (default): image lightbox — `absolute inset-x-0 top-0` overlay,
   *     nav arrows yan tarafta absolute. Image content tüm alanı kullanır.
   *   - true: PDF/office/video gibi layout-aware viewer'lar — relative,
   *     parent flex column'da normal flow. Nav arrows render EDİLMEZ
   *     (thumbnail strip + keyboard ← → ile nav yapılır), aksi halde
   *     PDF controller'larını örter.
   */
  inline?: boolean
  /** Embed mode — drops the close X (no surface to fall back to)
   *  and the prev/next nav (single-item embeds). Forwarded down
   *  from `FilePreviewLightboxProps.embed`. */
  embed?: boolean
}

interface ConvertFormatOption {
  format: string
  label: string
}

function Toolbar({
  item,
  kind,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  onDownload,
  onDownloadAs,
  convertFormats,
  imageControls,
  saveState,
  inline = false,
  embed = false,
}: ToolbarProps) {
  // Video toolbar idle-fade — mirrors the bottom transport bar's
  // 5s idle timeout so the top bar drops out of the way when the
  // viewer is left alone, and the player goes fully chrome-less.
  // We listen at window-level (not just toolbar hover) because the
  // user spends most of their time in the video frame below us.
  const [toolbarIdle, setToolbarIdle] = useState(false)
  useEffect(() => {
    if (kind !== "video") return
    let timer: number | undefined
    const reset = () => {
      setToolbarIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setToolbarIdle(true), 5000)
    }
    reset()
    window.addEventListener("mousemove", reset)
    window.addEventListener("mouseleave", () => {
      window.clearTimeout(timer)
      setToolbarIdle(true)
    })
    return () => {
      window.removeEventListener("mousemove", reset)
      window.clearTimeout(timer)
    }
  }, [kind])
  // Embed mode strips the toolbar entirely — the iframe surface
  // belongs to the player, not Sentroy chrome. The viewer below
  // exposes its own download / settings (or hides them too via
  // `embed`), so the consumer site sees a clean iframe.
  if (embed) return null

  return (
    <>
      {/* Üst toolbar — image kind: absolute overlay (gesture pan/zoom alanını
          örtmesin), diğer kind'lar: relative flex item (PDF/etc layout'unu
          sıkıştırmasın). */}
      <div
        className={cn(
          "z-10 px-4 py-3 transition-opacity duration-200",
          inline
            ? "relative shrink-0 border-b border-white/10 bg-black/80"
            : "pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent",
          // Video viewer pairs its bottom transport bar with this
          // top toolbar — both hide on 5s idle so the player goes
          // chrome-less. Pointer-events also drop so the hidden
          // bar doesn't catch stray clicks.
          kind === "video" && toolbarIdle && "opacity-0 pointer-events-none",
        )}
        onClick={(e) => {
          if (inline) e.stopPropagation()
        }}
      >
        <div className="pointer-events-auto flex items-center justify-between gap-3 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <FileTypeGlyph name={item.name} size={20} className="shrink-0" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-medium">{item.name}</span>
              <span className="truncate text-[11px] text-white/60">
                {total > 1 ? `${index + 1} / ${total}` : null}
                {total > 1 && item.size ? " · " : ""}
                {formatBytes(item.size)}
                {(total > 1 || item.size) && item.mimeType ? " · " : ""}
                {item.mimeType}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Text editör Save — download butonunun yanında; yalnız içerik
                değiştiğinde (dirty) görünür. Ayrı çubuk YOK. */}
            {saveState?.dirty && (
              <button
                type="button"
                onClick={saveState.save}
                disabled={saveState.saving}
                className="mr-1 inline-flex items-center gap-1 rounded-md bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
              >
                {saveState.saving ? "Saving…" : "Save"}
              </button>
            )}
            {imageControls && (
              <>
                <ToolbarButton onClick={imageControls.zoomOut} ariaLabel="Zoom out (-)">
                  <HugeiconsIcon icon={ZoomOutAreaIcon} strokeWidth={2} className="size-4" />
                </ToolbarButton>
                <ToolbarButton onClick={imageControls.zoomIn} ariaLabel="Zoom in (+)">
                  <HugeiconsIcon icon={ZoomInAreaIcon} strokeWidth={2} className="size-4" />
                </ToolbarButton>
                <ToolbarButton onClick={imageControls.rotate} ariaLabel="Rotate (R)">
                  <HugeiconsIcon icon={RotateClockwiseIcon} strokeWidth={2} className="size-4" />
                </ToolbarButton>
                <ToolbarButton onClick={imageControls.reset} ariaLabel="Reset (0)">
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-4" />
                </ToolbarButton>
              </>
            )}
            {(() => {
              // Video downloads moved into the player's own bottom
              // transport bar (closer to the rest of the playback
              // controls). Suppress here entirely so the toolbar
              // doesn't duplicate the option.
              if (kind === "video") return null
              // Pre-rendered variants (image thumbnails / video
              // ladder rungs) come from the caller via item.variants.
              // Convert formats are caller-provided too. Original is
              // always available. Build one dropdown when ANY of the
              // three add a non-trivial choice; otherwise fall back
              // to the bare-icon download.
              const variants = item.variants ?? []
              const hasConvert =
                !!(convertFormats && convertFormats.length > 0 && onDownloadAs)
              const hasVariants = variants.length > 0
              if (!hasConvert && !hasVariants) {
                return (
                  <ToolbarButton onClick={onDownload} ariaLabel="Download">
                    <HugeiconsIcon
                      icon={Download01Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </ToolbarButton>
                )
              }
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Download"
                        className="flex items-center gap-0.5 rounded-md p-2 text-white/90 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <HugeiconsIcon
                          icon={Download01Icon}
                          strokeWidth={2}
                          className="size-4"
                        />
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          strokeWidth={2}
                          className="size-3"
                        />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Download</DropdownMenuLabel>
                      <DropdownMenuItem onClick={onDownload}>
                        Original
                        <span className="ms-auto text-xs text-muted-foreground">
                          {item.name.split(".").pop()?.toUpperCase() ||
                            item.mimeType?.split("/").pop()?.toUpperCase()}
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>

                    {hasVariants ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Variants
                          </DropdownMenuLabel>
                          {variants.map((v) => (
                            <DropdownMenuItem
                              key={`${v.kind}-${v.url}`}
                              onClick={() => {
                                // Force a download by appending
                                // ?download=1; works against both
                                // /f/:id/:quality and signed URLs
                                // since neither parses the rest of
                                // the query string.
                                const sep = v.url.includes("?") ? "&" : "?"
                                const url = `${v.url}${sep}download=1&filename=${encodeURIComponent(item.name)}`
                                if (typeof window !== "undefined") {
                                  window.open(url, "_self")
                                }
                              }}
                            >
                              {v.label}
                              {v.size ? (
                                <span className="ms-auto text-[10px] text-muted-foreground">
                                  {formatBytes(v.size)}
                                </span>
                              ) : null}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </>
                    ) : null}

                    {hasConvert ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Convert
                          </DropdownMenuLabel>
                          {convertFormats!.map((f) => (
                            <DropdownMenuItem
                              key={f.format}
                              onClick={() => onDownloadAs!(f.format)}
                            >
                              {f.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })()}
            {/* Close X — hidden in embed mode (the iframe IS the
                surface; there's nothing to fall back to and the X
                would just confuse third-party page visitors). */}
            {!embed ? (
              <ToolbarButton onClick={onClose} ariaLabel="Close (Esc)">
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </ToolbarButton>
            ) : null}
          </div>
        </div>
      </div>

      {/* Navigasyon okları — sadece absolute (image) modda. Inline modda
          PDF/office controller'larını örter; thumbnail strip + keyboard nav
          yeterli. Embed modunda da gizli — single-item embed yapıyoruz,
          nav anlamsız. */}
      {!inline && !embed && total > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous (←)"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-all hover:bg-black/60 hover:scale-110"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next (→)"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-all hover:bg-black/60 hover:scale-110"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-5" />
          </button>
        </>
      )}
    </>
  )
}

function ToolbarButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="rounded-md p-2 text-white/90 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  )
}

// ─── Ana lightbox ────────────────────────────────────────────────────────

export function FilePreviewLightbox({
  open,
  onOpenChange,
  items: itemsProp,
  initialIndex = 0,
  onDownload,
  onReorder,
  buildConvertUrl,
  onSaveText,
  embed = false,
}: FilePreviewLightboxProps) {
  // Local items state — reorder caller'a bildirilse bile lightbox session
  // içinde anında reflect olsun. Caller items'ı değiştirirse (yeni
  // attachment grubu vb) sync ediyoruz.
  const [items, setItems] = useState(itemsProp)
  useEffect(() => {
    setItems(itemsProp)
  }, [itemsProp])

  const [index, setIndex] = useState(initialIndex)

  // initialIndex değişimi (örn. caller farklı item'la açıyor)
  useEffect(() => {
    if (open) setIndex(initialIndex)
  }, [open, initialIndex])

  const currentItem = items[index]
  const kind = useMemo(
    () => (currentItem ? inferViewerKind(currentItem) : "unsupported"),
    [currentItem],
  )

  // Text editör save durumu — TextViewer'dan lift edilir, toolbar'da Save
  // butonu olarak (download yanında) gösterilir. Text-dışı viewer'da null.
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null)
  const handleEditState = useCallback(
    (s: TextEditState | null) => setTextEdit(s),
    [],
  )

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + items.length) % items.length)
  }, [items.length])

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % items.length)
  }, [items.length])

  // Klavye nav (open + ana)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false)
      } else if (e.key === "ArrowLeft" && items.length > 1) {
        goPrev()
      } else if (e.key === "ArrowRight" && items.length > 1) {
        goNext()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onOpenChange, items.length, goPrev, goNext])

  // Body scroll lock — gesture sırasında sayfa scroll kaymasın
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  /**
   * Gerçek download — blob fetch + `<a download>` ile save dialog tetikler.
   * `window.open(_blank)` yerine: tarayıcı PDF/image'ı yeni tab'da
   * açıyordu, kullanıcı dosyayı kaydedemiyordu. Şimdi her zaman dosya
   * indirilir. Caller `onDownload` veriyorsa override.
   */
  const triggerBlobDownload = useCallback(
    async (url: string, filename: string) => {
      try {
        const res = await fetch(url, { credentials: "include" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = objectUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        setTimeout(() => {
          document.body.removeChild(a)
          URL.revokeObjectURL(objectUrl)
        }, 100)
      } catch (err) {
        // Sessiz fallback — yeni tab'a aç ki kullanıcı en azından görsün
        console.warn("[lightbox] blob download failed:", err)
        window.open(url, "_blank", "noopener,noreferrer")
      }
    },
    [],
  )

  const handleDownload = useCallback(() => {
    if (!currentItem) return
    if (onDownload) {
      onDownload(currentItem)
    } else {
      void triggerBlobDownload(currentItem.url, currentItem.name)
    }
  }, [currentItem, onDownload, triggerBlobDownload])

  /**
   * Format convert ile indirme. `buildConvertUrl` caller'dan, hangi backend
   * convert endpoint'inin nasıl çağrılacağı bilinir (CDN /convert?format=...).
   * Filename uzantısını yeni format'a göre değiştirip blob download tetikler.
   */
  const handleDownloadAs = useCallback(
    (format: string) => {
      if (!currentItem || !buildConvertUrl) return
      const url = buildConvertUrl(currentItem, format)
      // Filename uzantı değişimi — `image.png` → `image.jpg`
      const ext = formatToExt(format)
      const baseName = currentItem.name.replace(/\.[^.]+$/, "")
      const newName = ext ? `${baseName}.${ext}` : currentItem.name
      void triggerBlobDownload(url, newName)
    },
    [currentItem, buildConvertUrl, triggerBlobDownload],
  )

  // Convert formats currentItem.kind'a göre dinamik
  const convertFormats = useMemo<ConvertFormatOption[]>(
    () => (buildConvertUrl ? convertFormatsForKind(kind) : []),
    [kind, buildConvertUrl],
  )

  // Reorder handler — dnd-kit drag end
  const handleReorder = useCallback(
    (oldIndex: number, newIndex: number) => {
      const next = arrayMove(items, oldIndex, newIndex)
      setItems(next)
      // Şu an aktif item'ın yeni index'ini koru (reorder sırasında focus
      // kaymasın). Eski index === aktif ise yeni index'e taşı; başka bir
      // item drag edildiyse aktifin yeni pozisyonunu hesapla.
      setIndex((curr) => {
        if (curr === oldIndex) return newIndex
        if (oldIndex < curr && newIndex >= curr) return curr - 1
        if (oldIndex > curr && newIndex <= curr) return curr + 1
        return curr
      })
      onReorder?.(next)
    },
    [items, onReorder],
  )

  if (!open || !currentItem) return null

  // ImageViewer kendi gesture state'ini tutuyor — toolbar'a controls prop'u
  // geçirmek için gesture hook'unu burada da çalıştırmak gerekir mi? Hayır;
  // toolbar butonları image viewer'la state paylaşmıyor → ImageViewer
  // içinde toolbar'ı render etmek best, ama o zaman doc/video viewer'lardan
  // ortaklığı kaybederiz. Çözüm: ImageViewerWithToolbar wrapper.

  // Image kind: tam-ekran absolute layout (gesture pan/zoom için her piksel
  //   gerek). ImageViewerStage kendi toolbar + altta thumbnail strip overlay.
  // Diğer kind'lar: flex column (top toolbar inline + middle viewer + alt
  //   thumbnail strip inline). Bu yapı PDF/office gibi kendi controller'ı
  //   olan viewer'ların üst/alt kontrol bar'larını lightbox'ın overlay'leri
  //   örtmemesini garanti eder.
  if (kind === "image") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false)
        }}
      >
        <ImageViewerStage
          item={currentItem}
          index={index}
          total={items.length}
          onPrev={goPrev}
          onNext={goNext}
          onClose={() => onOpenChange(false)}
          onDownload={handleDownload}
          onDownloadAs={buildConvertUrl ? handleDownloadAs : undefined}
          convertFormats={convertFormats}
          embed={embed}
        />
        {items.length > 1 && (
          <ThumbnailStrip
            items={items}
            activeIndex={index}
            onSelect={(i) => setIndex(i)}
            onReorder={handleReorder}
          />
        )}
      </div>
    )
  }

  // Non-image flex column layout
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <Toolbar
        item={currentItem}
        kind={kind}
        index={index}
        total={items.length}
        onPrev={goPrev}
        onNext={goNext}
        onClose={() => onOpenChange(false)}
        onDownload={handleDownload}
        onDownloadAs={buildConvertUrl ? handleDownloadAs : undefined}
        convertFormats={convertFormats}
        imageControls={null}
        saveState={kind === "text" ? textEdit : null}
        inline
        embed={embed}
      />
      <div
        className="relative flex-1 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {kind === "pdf" && <PdfViewer item={currentItem} />}
        {kind === "office" && <OfficeViewer item={currentItem} />}
        {kind === "video" && <VideoViewer item={currentItem} embed={embed} />}
        {kind === "audio" && <AudioViewer item={currentItem} />}
        {kind === "text" && (
          <TextViewer
            item={currentItem}
            onSaveText={onSaveText}
            onEditState={handleEditState}
          />
        )}
        {kind === "unsupported" && (
          <UnsupportedViewer item={currentItem} onDownload={handleDownload} />
        )}
      </div>
      {items.length > 1 && (
        <ThumbnailStrip
          items={items}
          activeIndex={index}
          onSelect={(i) => setIndex(i)}
          onReorder={handleReorder}
          inline
        />
      )}
    </div>
  )
}

// Image viewer'a image controls'u toolbar'a iletmek için wrapper; gesture
// hook ImageViewer içinde olduğundan, controls'u dışarı çıkarmak için
// ayrı bir state taşıyoruz. Pratik: hook iki kere çağrılırsa state
// senkronize olmaz; bu yüzden ImageViewerStage tek hook çağırıp hem
// toolbar hem image render eder.

interface ImageViewerStageProps {
  item: FilePreviewItem
  index: number
  total: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  onDownload: () => void
  onDownloadAs?: (format: string) => void
  convertFormats?: ConvertFormatOption[]
  embed?: boolean
}

function ImageViewerStage({
  item,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  onDownload,
  onDownloadAs,
  convertFormats,
  embed = false,
}: ImageViewerStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, controls] = useImageGesture({
    containerRef,
    sourceKey: item.url,
  })
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setError(false)
    setLoaded(false)
  }, [item.url])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        controls.zoomIn()
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        controls.zoomOut()
      } else if (e.key === "0") {
        e.preventDefault()
        controls.reset()
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault()
        controls.rotate()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [controls])

  const transform = `translate(-50%, -50%) translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale}) rotate(${state.rotate}deg)`

  return (
    <>
      <Toolbar
        item={item}
        kind="image"
        index={index}
        total={total}
        onPrev={onPrev}
        onNext={onNext}
        onClose={onClose}
        onDownload={onDownload}
        onDownloadAs={onDownloadAs}
        convertFormats={convertFormats}
        imageControls={{
          zoomIn: controls.zoomIn,
          zoomOut: controls.zoomOut,
          rotate: controls.rotate,
          reset: controls.reset,
        }}
        embed={embed}
      />
      <div
        ref={containerRef}
        className={cn(
          "relative h-full w-full touch-none select-none overflow-hidden",
          state.isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {!loaded && !error && <ViewerSpinner />}
        {error ? (
          <ViewerError message="Failed to load image" />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.url}
            alt={item.name}
            draggable={false}
            // Aynı fit-to-container davranışı — ImageViewer ile sync.
            onLoad={(e) => {
              setLoaded(true)
              const img = e.currentTarget
              const node = containerRef.current
              if (!node) return
              const cw = node.clientWidth
              const ch = node.clientHeight
              const nw = img.naturalWidth
              const nh = img.naturalHeight
              if (cw > 0 && ch > 0 && nw > 0 && nh > 0) {
                const fit = Math.min(cw / nw, ch / nh, 1)
                if (fit < 1) {
                  controls.setScale(fit)
                }
              }
            }}
            onError={() => setError(true)}
            className={cn(
              "absolute left-1/2 top-1/2 max-h-none max-w-none origin-center will-change-transform",
              !loaded && "opacity-0",
            )}
            style={{
              transform,
              transformOrigin: "center center",
              imageRendering: state.scale > 4 ? "pixelated" : "auto",
            }}
          />
        )}
      </div>
    </>
  )
}

// `ImageViewer` artık ImageViewerStage'e dahil; named-export gereken
// yerde reuse için bırakılan fonksiyon dummy bir reference; tree-shaker
// kullanılmazsa atar.
void ImageViewer

// ─── Thumbnail strip (sortable + click-to-jump) ─────────────────────────

interface ThumbnailStripProps {
  items: FilePreviewItem[]
  activeIndex: number
  onSelect: (index: number) => void
  onReorder: (oldIndex: number, newIndex: number) => void
  /** Layout mode — false (default) absolute bottom overlay (image lightbox);
   *  true relative flex item (PDF/office layout-aware). */
  inline?: boolean
}

function ThumbnailStrip({
  items,
  activeIndex,
  onSelect,
  onReorder,
  inline = false,
}: ThumbnailStripProps) {
  // Pointer + Touch sensors. distance: 8 → küçük tap'ler click sayılır,
  // 8px+ drag → DnD başlar (click-to-jump'la çakışma çözümü).
  // Touch için 200ms long-press, yoksa scroll'la karışır.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((it) => it.id === active.id)
    const newIndex = items.findIndex((it) => it.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(oldIndex, newIndex)
  }

  return (
    <div
      className={cn(
        "pointer-events-auto z-10 px-3 py-3",
        inline
          ? "relative shrink-0 border-t border-white/10 bg-black/80"
          : "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((it) => it.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((it, i) => (
              <SortableThumbnail
                key={it.id}
                item={it}
                isActive={i === activeIndex}
                onSelect={() => onSelect(i)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

interface SortableThumbnailProps {
  item: FilePreviewItem
  isActive: boolean
  onSelect: () => void
}

function SortableThumbnail({
  item,
  isActive,
  onSelect,
}: SortableThumbnailProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const kind = inferViewerKind(item)
  const isImage = kind === "image"

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      style={style}
      {...attributes}
      {...listeners}
      // dnd-kit pointer event'leri spreadle yakalıyor; click yine de geçer
      // çünkü distance constraint 8px (drag tetiklenmeden önceki pointerup
      // click sayılır).
      className={cn(
        "group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-black/40 transition-all",
        isActive
          ? "border-primary shadow-md shadow-primary/40"
          : "border-white/20 hover:border-white/50",
        isDragging && "z-20 cursor-grabbing",
      )}
      aria-label={item.name}
      title={item.name}
    >
      {isImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.url}
          alt=""
          draggable={false}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1 text-[8px] text-white/70">
          <HugeiconsIcon
            icon={
              kind === "video"
                ? Video01Icon
                : kind === "audio"
                  ? MusicNote01Icon
                  : File01Icon
            }
            strokeWidth={1.5}
            className="size-5"
          />
          <span className="line-clamp-1 break-all uppercase">
            {item.name.split(".").pop() ?? "file"}
          </span>
        </div>
      )}
    </button>
  )
}

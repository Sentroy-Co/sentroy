"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { format, formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CloudUploadIcon,
  Delete02Icon,
  GridViewIcon,
  ListViewIcon,
  Download01Icon,
  Cancel01Icon,
  Search01Icon,
  ArrowDataTransferHorizontalIcon,
  Copy01Icon,
  InformationCircleIcon,
  EyeIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Database01Icon,
  ImageAdd01Icon,
  Folder01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  PencilEdit01Icon,
  MoreHorizontalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { FileIcon, defaultStyles } from "react-file-icon"
import { EmbedBuilderDialog } from "@/components/buckets/embed-builder-dialog"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  PageTransition,
  EmptyState,
} from "@workspace/console/components/shared"
import { confirm } from "@workspace/console/stores/confirm"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  FileUploaderPopover,
  type FileUploaderHandle,
} from "@workspace/ui/components/file-uploader"
import dynamic from "next/dynamic"

// Crop dialog lazy-loaded (react-easy-crop ana bundle'a sızmasın)
const CropDialog = dynamic(
  () =>
    import("@sentroy-co/client-sdk/react/crop").then((m) => m.CropDialog),
  { ssr: false },
)
import {
  FilePreviewLightbox,
  type FilePreviewItem,
} from "@workspace/ui/components/file-preview-lightbox"
import { cn } from "@workspace/ui/lib/utils"
import type { Bucket, Media } from "@workspace/db/types"
import { useSession } from "@workspace/auth/client/auth-client"
import { hasClientPermission } from "@workspace/auth/server/route-permissions"
import { useCompanyStore } from "@workspace/console/stores/company"
import {
  uploadFileWithProgress,
  formatUploadBytes,
} from "@/lib/upload-client"
import { useMaxUploadBytes } from "@/components/site-settings-provider"
import {
  fromMediaFolder,
  joinFolderPath,
  normalizeFolderPath,
  toMediaFolder,
} from "@/lib/folders"

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number, fractionDigits = 1): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(fractionDigits)} ${sizes[i]}`
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".")
  if (idx === -1) return ""
  return name.slice(idx + 1).toLowerCase()
}

/**
 * Item için inline thumbnail mevcut mu — image her zaman, PDF/video upload
 * sırasında server-side `imageMeta.thumbnails` doldurulduysa. Aksi halde
 * react-file-icon fallback'i çiziliyor.
 */
function hasThumbnail(m: Media): boolean {
  if (m.type === "image") return true
  return Boolean(m.imageMeta?.thumbnails && m.imageMeta.thumbnails.length > 0)
}

/**
 * URL helper'ları: public media için kısa `/f/[id]` route'u, private için
 * uzun `/api/companies/.../download` (auth gate'inden geçer). Kısa URL
 * paylaşılabilir ve CDN cache-friendly; private dosyalarda kısa form
 * 404 döner — kullanıcı "Copy URL" yaptığında çalışacak doğru link.
 */
function previewUrl(
  companySlug: string,
  bucketSlug: string,
  m: Media,
  quality?: number,
): string {
  // Public + private ikisi de `?quality=` QUERY formu kullanır: storage'ın
  // `/f/[id]` short-URL route'u (app/f/[id]/route.ts) ve private download
  // route'u quality'yi QUERY'den okuyup CDN'e `/f/:id/:width` PATH segmenti
  // olarak iletir. `/f/:id/:width` DOĞRUDAN client URL'i OLARAK kullanılamaz:
  // storage route'u tek-segment (`[id]`) → iki segment 404 verir.
  const q = quality ? `?quality=${quality}` : ""
  if (m.isPublic) return `/f/${m.id}${q}`
  return `/api/companies/${companySlug}/buckets/${bucketSlug}/media/${m.id}/download${q}`
}

function downloadUrl(
  companySlug: string,
  bucketSlug: string,
  m: Media,
): string {
  const params = new URLSearchParams({ download: "1", filename: m.originalName })
  if (m.isPublic) return `/f/${m.id}?${params.toString()}`
  return `/api/companies/${companySlug}/buckets/${bucketSlug}/media/${m.id}/download?${params.toString()}`
}

function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path
  return `${window.location.origin}${path}`
}

const FOLDER_DROP_PREFIX = "folder:"

function folderDropId(path: string): string {
  return `${FOLDER_DROP_PREFIX}${path}`
}

function folderPathFromDropId(id: string): string | null {
  return id.startsWith(FOLDER_DROP_PREFIX)
    ? id.slice(FOLDER_DROP_PREFIX.length)
    : null
}

function folderName(path: string): string {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function parentFolder(path: string): string {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean)
  return parts.slice(0, -1).join("/")
}

function folderSegments(path: string): Array<{ label: string; path: string }> {
  const parts = normalizeFolderPath(path).split("/").filter(Boolean)
  return parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join("/"),
  }))
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // Legacy fallback — `execCommand` deprecated ama clipboard API olmayan
    // dev ortamlarında (insecure context) hala işe yarıyor.
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.position = "absolute"
    ta.style.left = "-9999px"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// ─── Types ───────────────────────────────────────────────────────────────

interface MediaListResponse {
  items: Media[]
  total: number
}

interface BucketFolderSummary {
  path: string
  fileCount: number
  storageUsed: number
  explicit: boolean
}

interface FolderListResponse {
  folders: BucketFolderSummary[]
}

interface QuotaResponse {
  used: number
  limit: number
  mailUsed: number
  planName?: string
}

type SortKey = "displayOrder" | "name" | "size" | "createdAt" | "type"
type SortDir = "asc" | "desc"

const SORT_KEYS: SortKey[] = ["displayOrder", "name", "size", "createdAt", "type"]

/**
 * react-file-icon wrapper'ı — `originalName`'in extension'ından stillenmiş bir
 * SVG döndürür (PDF kırmızı, DOCX mavi, MP3 mor, ZIP gri vb. — react-file-icon'un
 * `defaultStyles` haritası nereye düşerse). `width` parametresi inline stil olarak
 * verilir çünkü react-file-icon SVG'si parent container'ın width'ini doldurur.
 */
function MediaTypeIcon({
  media,
  width,
  className,
}: {
  media: Media
  width: number
  className?: string
}) {
  const ext = getExtension(media.originalName) || "file"
  const style = (defaultStyles as Record<string, unknown>)[ext] ?? {}
  return (
    <div
      className={className}
      style={{ width, height: "auto", lineHeight: 0 }}
    >
      <FileIcon
        extension={ext}
        {...style}
        labelUppercase
      />
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────

export function BucketDetailContent({ bucketSlug }: { bucketSlug: string }) {
  const t = useTranslations("buckets")
  const params = useParams()
  const companySlug = params["company-slug"] as string
  const lang = params.lang as string
  // Admin tarafından configure edilen tek-dosya upload limit. Layout-level
  // server-side fetch + Provider üzerinden gelir (bkz site-settings-provider).
  const maxUploadBytes = useMaxUploadBytes()

  const searchParams = useSearchParams()

  const [bucket, setBucket] = useState<Bucket | null>(null)
  const [media, setMedia] = useState<Media[]>([])
  const [folders, setFolders] = useState<BucketFolderSummary[]>([])
  const [currentFolder, setCurrentFolder] = useState("")
  // OS storage widget deep-link — ?file=<id> ile açılan dosyayı vurgulamak için.
  const [pendingHighlightId, setPendingHighlightId] = useState<string | null>(
    null,
  )
  const [quota, setQuota] = useState<QuotaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"grid" | "list" | "table">("grid")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("displayOrder")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  // Pagination — server-side. Folder/sort/search değişiminde 0'a dönülür.
  const [page, setPage] = useState(0)
  const [pageSize] = useState(60)
  const [total, setTotal] = useState(0)
  const [mediaLoading, setMediaLoading] = useState(false)

  // Video optimization toggle — when on, video uploads run through
  // the CDN's compress + multi-quality (144/480/720/1080) pipeline.
  // Default off because the ladder generation can take tens of
  // seconds per file; users opt in when they want bandwidth-friendly
  // playback URLs back. Persisted to localStorage so the preference
  // sticks across reloads but stays per-browser (no server round
  // trip).
  const VIDEO_OPT_KEY = "sentroy.storage.videoOptimize"
  const [videoOptimize, setVideoOptimize] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    setVideoOptimize(window.localStorage.getItem(VIDEO_OPT_KEY) === "true")
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(VIDEO_OPT_KEY, videoOptimize ? "true" : "false")
  }, [videoOptimize])

  // Search debounce — 300ms; her keypress'te refetch yerine kullanıcı
  // duraklayınca server'a git.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  // Filter / sort değişiminde sayfa 0'a dön — yoksa boş sayfada kalabilir.
  useEffect(() => {
    setPage(0)
  }, [currentFolder, debouncedSearch, sortKey, sortDir])

  // OS storage widget deep-link — YALNIZ ilk mount'ta URL'den oku: ?folder=<path>
  // açılacak klasör, ?file=<id> vurgulanacak dosya. Kullanıcı sonradan gezinince
  // URL'i zorlamayız (deepLinkApplied guard).
  const deepLinkApplied = useRef(false)
  useEffect(() => {
    if (deepLinkApplied.current) return
    deepLinkApplied.current = true
    const folderParam = searchParams.get("folder")
    if (folderParam) setCurrentFolder(normalizeFolderPath(folderParam))
    const fileParam = searchParams.get("file")
    if (fileParam) setPendingHighlightId(fileParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [infoMedia, setInfoMedia] = useState<Media | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [visibilityBusy, setVisibilityBusy] = useState(false)
  // Upload preprocess (image crop) için resolver pattern: preprocess
  // çağrılınca state'e dosya + Promise resolver ata; CropDialog onClose'ta
  // resolver'ı çağır + state temizle.
  const [pendingCrop, setPendingCrop] = useState<{
    file: File
    resolve: (out: File | null) => void
  } | null>(null)
  const handleCropPreprocess = useCallback(
    async (file: File): Promise<File | null> => {
      // Sadece image MIME → crop dialog. Diğerleri (PDF, video, vs)
      // direct upload akışında.
      if (!file.type.startsWith("image/")) return file
      // SVG raster crop'ta kötü davranıyor; orijinal yükle.
      if (file.type === "image/svg+xml") return file
      return new Promise<File | null>((resolve) => {
        setPendingCrop({ file, resolve })
      })
    },
    [],
  )
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [folderBusy, setFolderBusy] = useState(false)
  const [renameFolderTarget, setRenameFolderTarget] = useState<string | null>(
    null,
  )
  const [renameFolderValue, setRenameFolderValue] = useState("")
  const [renameFolderBusy, setRenameFolderBusy] = useState(false)
  // Upload popover'ı kontrollü — sayfa-geneli sürükle-bırak drop'ta açılıp
  // dosyaları aynı progress kuyruğuna besler.
  const uploaderApiRef = useRef<FileUploaderHandle>(null)
  const [uploaderOpen, setUploaderOpen] = useState(false)
  // Sürükle-bırak drop'ta yakalanan dosyalar → popover'a pendingFiles ile
  // geçer (popover açılıp uploader mount olunca enqueue). apiRef ilk drop'ta
  // (popover kapalı = uploader unmount) null olduğundan iki bırakış gerekiyordu.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [fileDragActive, setFileDragActive] = useState(false)
  // dragenter/leave iç öğelerde de tetiklendiği için depth sayacı — 0'a
  // inince overlay kapanır (aksi halde child üstüne geçince flicker olur).
  const dragDepth = useRef(0)
  const membership = useCompanyStore((s) => s.membership)
  const { data: session } = useSession()
  const systemRole = (session?.user as { role?: string } | undefined)?.role
  const canEditBucket = hasClientPermission(
    membership,
    "buckets.edit",
    systemRole,
  )
  const canUploadMedia = hasClientPermission(
    membership,
    "media.upload",
    systemRole,
  )
  const canDeleteMedia = hasClientPermission(
    membership,
    "media.delete",
    systemRole,
  )
  const canReorderMedia = hasClientPermission(
    membership,
    "media.reorder",
    systemRole,
  )

  // Sayfa-geneli sürükle-bırak yükleme — OS'tan sürüklenen dosyalar upload
  // butonuna basmadan yakalanır. dnd-kit reorder PointerSensor kullandığı için
  // native drag event'lerini tetiklemez; ayrıca yalnız `types` "Files" içeren
  // (= OS dosya) sürüklemelerde aktifleşir → item reorder ile çakışmaz.
  useEffect(() => {
    if (!canUploadMedia) return
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files")
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setFileDragActive(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault() // drop'a izin vermek için şart
    }
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setFileDragActive(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setFileDragActive(false)
      const files = e.dataTransfer?.files
      if (files?.length) {
        // pendingFiles ile geç + popover'ı aç → tek bırakışta yüklenir + progress.
        setDroppedFiles(Array.from(files))
        setUploaderOpen(true)
      }
    }
    window.addEventListener("dragenter", onEnter)
    window.addEventListener("dragover", onOver)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onEnter)
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [canUploadMedia])

  const bucketBase = `/api/companies/${companySlug}/buckets/${bucketSlug}`
  const mediaBase = `/api/companies/${companySlug}/buckets/${bucketSlug}/media`
  const foldersBase = `/api/companies/${companySlug}/buckets/${bucketSlug}/folders`

  /**
   * Media query — server-side filter/sort/paginate. folder boş string ise
   * root klasörü temsil eder; toMediaFolder ile DB konvansiyonuna çevrilir.
   * `q` debounced search; backend originalName/alt/caption/tags üstünde
   * regex-i match yapar.
   */
  const fetchMedia = useCallback(async () => {
    setMediaLoading(true)
    try {
      const sp = new URLSearchParams()
      sp.set("folder", toMediaFolder(currentFolder))
      if (debouncedSearch.trim()) sp.set("q", debouncedSearch.trim())
      sp.set("sort", sortKey)
      sp.set("dir", sortDir)
      sp.set("limit", String(pageSize))
      sp.set("skip", String(page * pageSize))
      const res = await fetch(`${mediaBase}?${sp.toString()}`)
      const json = (await res.json().catch(() => ({}))) as {
        data?: MediaListResponse
      }
      if (json.data) {
        setMedia(json.data.items)
        setTotal(json.data.total ?? 0)
      }
    } finally {
      setMediaLoading(false)
    }
  }, [
    mediaBase,
    currentFolder,
    debouncedSearch,
    sortKey,
    sortDir,
    page,
    pageSize,
  ])

  /**
   * Bucket meta + folder list + quota — page'in ana load'u. Media listesi
   * ayrı fetchMedia'da; pagination/sort değişince sadece media refetch.
   * Bu sayede klasör değiştirince bucket header flicker yapmaz.
   */
  const load = useCallback(async () => {
    const [bucketRes, foldersRes, quotaRes] = await Promise.all([
      fetch(bucketBase).then((r) => r.json()),
      fetch(foldersBase).then((r) => r.json()),
      fetch(`/api/companies/${companySlug}/storage-quota`).then((r) => r.json()),
    ])
    if (bucketRes.data) setBucket(bucketRes.data)
    if (foldersRes.data) {
      setFolders((foldersRes.data as FolderListResponse).folders)
    }
    if (quotaRes.data) setQuota(quotaRes.data as QuotaResponse)
    // Media'yı da bu çağrıyla taze çek (mevcut sayfa).
    await fetchMedia()
  }, [bucketBase, companySlug, foldersBase, fetchMedia])

  useEffect(() => {
    ;(async () => {
      try {
        await load()
      } finally {
        setLoading(false)
      }
    })()
    // load callback'i fetchMedia'ya bağımlı; sort/page/folder değişimi
    // kendi useEffect'inde refetch tetikler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketBase, foldersBase, companySlug])

  // Sort / page / folder / search değişiminde media-only refetch.
  useEffect(() => {
    if (loading) return
    void fetchMedia()
  }, [fetchMedia, loading])

  // Background-processing poll — refetch every 4s while at least one
  // media doc is still transcoding. Stops as soon as the list lands
  // with no in-flight rows so we're not paying for periodic GETs in
  // the steady state. The async transcode pipeline streams variant
  // rows back into the doc one by one, so each tick the user sees
  // either a higher `variantsCompleted` or the badge disappear.
  const hasProcessing = useMemo(
    () =>
      media.some(
        (m) =>
          m.processing &&
          (m.processing.status === "queued" ||
            m.processing.status === "processing"),
      ),
    [media],
  )
  useEffect(() => {
    if (!hasProcessing) return
    const id = window.setInterval(() => {
      void fetchMedia()
    }, 4000)
    return () => window.clearInterval(id)
  }, [hasProcessing, fetchMedia])

  /**
   * Display media — server zaten folder+search+sort+pagination uygulayıp
   * dönüyor. Client sadece tam liste'yi gösterir; ek client-side sort/
   * filter yok (sayfada eksik kayıtlar üzerinde sıralama yanıltıcı olur).
   */
  const displayMedia = media

  // Deep-link dosya vurgusu — hedef dosya mevcut sayfaya düştüğünde tile'ı
  // bul, ortala ve kısa süre ring ile vurgula. dnd-kit'in `CSS` export'uyla
  // ad çakışması olmasın diye DOM taraması (querySelector escape yerine).
  useEffect(() => {
    if (!pendingHighlightId) return
    if (!displayMedia.some((m) => m.id === pendingHighlightId)) return
    const el = Array.from(
      document.querySelectorAll<HTMLElement>("[data-media-id]"),
    ).find((n) => n.dataset.mediaId === pendingHighlightId)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    const ring = ["ring-2", "ring-primary", "ring-offset-2", "ring-offset-background"]
    el.classList.add(...ring)
    const timer = window.setTimeout(() => {
      el.classList.remove(...ring)
      setPendingHighlightId(null)
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [pendingHighlightId, displayMedia])

  const displayFolders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return folders
      .filter((folder) => parentFolder(folder.path) === currentFolder)
      .filter((folder) => !q || folderName(folder.path).toLowerCase().includes(q))
  }, [currentFolder, folders, search])

  // DnD reorder yalnızca `displayOrder` aktifken anlamlı; diğer sort'larda
  // disable; aksi halde kullanıcı drag yaptığında sıra hemen sortKey ile
  // override olur ve kafa karıştırıcı görünür.
  const reorderEnabled = canReorderMedia && sortKey === "displayOrder" && !search
  const dragEnabled =
    canReorderMedia && (reorderEnabled || displayFolders.length > 0)

  const handleUpload = useCallback(
    async (
      file: File,
      onProgress: (p: number) => void,
      signal: AbortSignal,
    ) => {
      if (!canUploadMedia) throw new Error("Insufficient permissions")
      if (!bucket) throw new Error("Bucket not loaded")
      // Video optimization opt-in — applies only when the file is a
      // video. Server ignores the flags for other types, so passing
      // them on every upload is safe; we still gate UI display on
      // `videoOptimize` to keep the user-facing wording honest.
      const isVideo = file.type.startsWith("video/")
      return uploadFileWithProgress(mediaBase, file, {
        folder: currentFolder || undefined,
        isPublic: bucket.isPublic,
        compressVideo: isVideo && videoOptimize,
        transcodeVideo: isVideo && videoOptimize,
        onProgress,
        signal,
      })
    },
    [bucket, canUploadMedia, currentFolder, mediaBase, videoOptimize],
  )

  function openCreateFolderDialog() {
    setNewFolderName("")
    setCreateFolderOpen(true)
  }

  function handleOpenFolder(path: string) {
    clearSelection()
    setSearch("")
    setCurrentFolder(normalizeFolderPath(path))
  }

  function openRenameFolderDialog(path: string) {
    setRenameFolderTarget(path)
    setRenameFolderValue(folderName(path))
  }

  /**
   * Folder rename: kullanıcı sadece son segment'i yeniden adlandırır
   * (full path girmez); UI parent path'i koruyup yeni leaf ile birleştirir.
   * Backend descendant'ları otomatik günceller.
   */
  async function handleRenameFolder() {
    if (!renameFolderTarget || !canUploadMedia) return
    const fromPath = renameFolderTarget
    const parent = parentFolder(fromPath)
    const newLeaf = normalizeFolderPath(renameFolderValue)
    if (!newLeaf) {
      toast.error(t("detail.invalidFolderName"))
      return
    }
    const toPath = parent ? joinFolderPath(parent, newLeaf) : newLeaf
    if (!toPath || toPath === fromPath) {
      setRenameFolderTarget(null)
      return
    }

    setRenameFolderBusy(true)
    try {
      const res = await fetch(foldersBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error(t("detail.renameFolderConflict"))
        }
        throw new Error(json.error || t("detail.renameFolderFailed"))
      }
      toast.success(t("detail.renameFolderSuccess"))
      // Eğer açık olan klasör (veya descendant'ı) yeniden adlandırıldıysa
      // currentFolder'ı yeni path'le değiştir.
      if (
        currentFolder === fromPath ||
        currentFolder.startsWith(`${fromPath}/`)
      ) {
        const suffix =
          currentFolder === fromPath ? "" : currentFolder.slice(fromPath.length)
        setCurrentFolder(toPath + suffix)
      }
      setRenameFolderTarget(null)
      setRenameFolderValue("")
      await load()
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("detail.renameFolderFailed"),
      )
    } finally {
      setRenameFolderBusy(false)
    }
  }

  async function handleCreateFolder() {
    if (!canUploadMedia) return
    const name = normalizeFolderPath(newFolderName)
    if (!name) {
      toast.error(t("detail.invalidFolderName"))
      return
    }
    const path = joinFolderPath(currentFolder, name)
    if (!path || path === currentFolder) {
      toast.error(t("detail.invalidFolderName"))
      return
    }

    setFolderBusy(true)
    try {
      const res = await fetch(foldersBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t("detail.createFolderFailed"))
      toast.success(t("detail.createFolderSuccess"))
      setCreateFolderOpen(false)
      setNewFolderName("")
      await load()
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("detail.createFolderFailed"),
      )
    } finally {
      setFolderBusy(false)
    }
  }

  async function handleBucketVisibilityChange(isPublic: boolean) {
    if (!bucket || !canEditBucket || visibilityBusy) return
    if (bucket.isPublic === isPublic) return

    const previousBucket = bucket
    const previousMedia = media
    setVisibilityBusy(true)
    setBucket({ ...bucket, isPublic })
    setMedia((items) => items.map((item) => ({ ...item, isPublic })))

    try {
      const res = await fetch(bucketBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t("detail.visibilityFailed"))
      if (json.data) setBucket(json.data as Bucket)
      toast.success(
        isPublic
          ? t("detail.visibilityPublicSuccess")
          : t("detail.visibilityPrivateSuccess"),
      )
    } catch (err: unknown) {
      setBucket(previousBucket)
      setMedia(previousMedia)
      toast.error(
        err instanceof Error ? err.message : t("detail.visibilityFailed"),
      )
    } finally {
      setVisibilityBusy(false)
    }
  }

  async function handleMoveToFolder(ids: string[], targetFolder: string) {
    if (!canReorderMedia || ids.length === 0) return
    const normalizedTarget = normalizeFolderPath(targetFolder)
    const nextMediaFolder = toMediaFolder(normalizedTarget)
    const movedIds = new Set(ids)
    const previousMedia = media

    setMedia((items) =>
      items.map((item) =>
        movedIds.has(item.id) ? { ...item, folder: nextMediaFolder } : item,
      ),
    )
    clearSelection()

    try {
      const res = await fetch(`${mediaBase}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, folder: normalizedTarget }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t("detail.moveFailed"))
      toast.success(
        t("detail.moveSuccess", {
          count: ids.length,
          folder: normalizedTarget ? folderName(normalizedTarget) : t("detail.root"),
        }),
      )
      await load()
    } catch (err: unknown) {
      setMedia(previousMedia)
      toast.error(err instanceof Error ? err.message : t("detail.moveFailed"))
      await load()
    }
  }

  function handlePreview(m: Media) {
    const idx = displayMedia.findIndex((item) => item.id === m.id)
    setLightboxIndex(Math.max(0, idx))
    setLightboxOpen(true)
  }

  function handleInfo(m: Media) {
    setInfoMedia(m)
  }

  async function handleCopyUrl(m: Media) {
    const url = absoluteUrl(previewUrl(companySlug, bucketSlug, m))
    const ok = await copyToClipboard(url)
    if (ok) toast.success(t("detail.copySuccess"))
    else toast.error(t("detail.copyFailed"))
  }

  function handleDownload(m: Media) {
    const a = document.createElement("a")
    a.href = downloadUrl(companySlug, bucketSlug, m)
    a.click()
  }

  function handleTileClick(m: Media, e: React.MouseEvent) {
    if (e.shiftKey && lastClickedId) {
      const startIdx = displayMedia.findIndex((x) => x.id === lastClickedId)
      const endIdx = displayMedia.findIndex((x) => x.id === m.id)
      if (startIdx >= 0 && endIdx >= 0) {
        const [from, to] =
          startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
        const next = new Set(selectedIds)
        for (let i = from; i <= to; i++) {
          const item = displayMedia[i]
          if (item) next.add(item.id)
        }
        setSelectedIds(next)
        return
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selectedIds)
      if (next.has(m.id)) next.delete(m.id)
      else next.add(m.id)
      setSelectedIds(next)
      setLastClickedId(m.id)
      return
    }
    if (selectedIds.size === 0) {
      handlePreview(m)
      return
    }
    setSelectedIds(new Set([m.id]))
    setLastClickedId(m.id)
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setLastClickedId(null)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    if (!canReorderMedia) return
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const targetFolder = folderPathFromDropId(String(over.id))
    if (targetFolder !== null) {
      const ids = selectedIds.has(activeId) ? Array.from(selectedIds) : [activeId]
      await handleMoveToFolder(ids, targetFolder)
      return
    }

    if (!reorderEnabled) return
    const oldIndex = displayMedia.findIndex((m) => m.id === active.id)
    const newIndex = displayMedia.findIndex((m) => m.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const nextDisplay = arrayMove(displayMedia, oldIndex, newIndex)
    const displayIds = new Set(displayMedia.map((m) => m.id))
    let cursor = 0
    const next = media.map((item) => {
      if (!displayIds.has(item.id)) return item
      return nextDisplay[cursor++] ?? item
    })
    setMedia(next)
    try {
      const res = await fetch(`${mediaBase}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((m) => m.id) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Reorder failed")
      load()
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || !canDeleteMedia) return
    const ok = await confirm({
      title: t("detail.bulkDeleteConfirmTitle", { count: selectedIds.size }),
      description: t("detail.bulkDeleteConfirmDesc"),
      confirmText: t("detail.bulkDeleteConfirmCta"),
      destructive: true,
    })
    if (!ok) return
    setBulkBusy(true)
    try {
      // Tek round-trip: backend cdn-server'a paralel pool ile delete eder.
      const ids = Array.from(selectedIds)
      const res = await fetch(mediaBase, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: {
          deleted?: number
          failed?: string[]
          totalRequested?: number
        }
        error?: string
      }
      if (!res.ok) throw new Error(json.error || "Bulk delete failed")
      const deleted = json.data?.deleted ?? 0
      const failed = json.data?.failed?.length ?? 0
      if (failed === 0) {
        toast.success(t("detail.bulkDeleteSuccess", { count: deleted }))
      } else if (deleted > 0) {
        toast.warning(
          t("detail.bulkDeletePartial", { ok: deleted, failed }),
        )
      } else {
        toast.error(t("detail.bulkDeleteFailed"))
      }
      clearSelection()
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed")
      load()
    } finally {
      setBulkBusy(false)
    }
  }

  /**
   * Folder + içindeki tüm dosyaları siler. Açık olan klasör silinirse
   * parent'a veya root'a düşer.
   */
  async function handleDeleteFolder(path: string) {
    if (!canDeleteMedia) return
    const name = folderName(path) || path
    const ok = await confirm({
      title: t("detail.deleteFolderConfirmTitle", { name }),
      description: t("detail.deleteFolderConfirmDesc"),
      confirmText: t("detail.deleteFolderConfirmCta"),
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(
        `${foldersBase}?path=${encodeURIComponent(path)}`,
        { method: "DELETE" },
      )
      const json = (await res.json().catch(() => ({}))) as {
        data?: {
          path?: string
          removedFolders?: number
          deletedMedia?: number
          failedMedia?: string[]
          totalMedia?: number
        }
        error?: string
      }
      if (!res.ok) throw new Error(json.error || t("detail.deleteFolderFailed"))
      const failed = json.data?.failedMedia?.length ?? 0
      if (failed === 0) {
        toast.success(t("detail.deleteFolderSuccess", { name }))
      } else {
        toast.warning(
          t("detail.deleteFolderPartial", {
            ok: json.data?.deletedMedia ?? 0,
            failed,
          }),
        )
      }
      // Açık klasör silinirse parent'a düş.
      if (currentFolder === path || currentFolder.startsWith(`${path}/`)) {
        setCurrentFolder(parentFolder(path))
      }
      await load()
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("detail.deleteFolderFailed"),
      )
    }
  }

  function handleBulkDownloadZip() {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds).join(",")
    const a = document.createElement("a")
    a.href = `${mediaBase}/download-zip?ids=${ids}`
    a.click()
  }

  async function handleBulkCopyUrls() {
    if (selectedIds.size === 0) return
    const urls = Array.from(selectedIds)
      .map((id) => media.find((m) => m.id === id))
      .filter((m): m is Media => Boolean(m))
      .map((m) => absoluteUrl(previewUrl(companySlug, bucketSlug, m)))
      .join("\n")
    const ok = await copyToClipboard(urls)
    if (ok) toast.success(t("detail.copyMultiSuccess", { count: selectedIds.size }))
    else toast.error(t("detail.copyFailed"))
  }

  async function handleDelete(m: Media) {
    if (!canDeleteMedia) return
    const ok = await confirm({
      title: t("detail.deleteConfirmTitle"),
      description: t("detail.deleteConfirmDesc", { name: m.originalName }),
      confirmText: t("detail.deleteConfirmCta"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${mediaBase}/${m.id}`, { method: "DELETE" })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || t("detail.deleteFailed"))
      return
    }
    toast.success(t("detail.deleteSuccess"))
    await load()
  }

  if (loading || !bucket) {
    return (
      <PageTransition>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </PageTransition>
    )
  }

  const quotaTotalUsed = quota ? quota.used + quota.mailUsed : 0
  const quotaPercent =
    quota && quota.limit > 0
      ? Math.min(100, (quotaTotalUsed / quota.limit) * 100)
      : 0
  const visibilityBadgeClass = bucket.isPublic
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  const currentViewEmpty =
    displayMedia.length === 0 && displayFolders.length === 0

  // Item context callback'leri tek nesnede topla — child component'lerin
  // prop yüzü ufak kalır, prop drilling temiz görünür.
  const itemActions: MediaItemActions = {
    onPreview: handlePreview,
    onInfo: handleInfo,
    onCopyUrl: handleCopyUrl,
    onDownload: handleDownload,
    onDelete: handleDelete,
    canDelete: canDeleteMedia,
    t,
  }

  return (
    <PageTransition>
      {/* Sayfa-geneli sürükle-bırak overlay — yalnız görsel (drop window
          listener'ında yakalanıyor); pointer-events-none ki drop olayını
          engellemesin. */}
      {fileDragActive && canUploadMedia && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-background/95 px-10 py-8 text-center shadow-xl">
            <HugeiconsIcon
              icon={CloudUploadIcon}
              className="size-9 text-primary"
              strokeWidth={2}
            />
            <div className="text-sm font-medium">{t("detail.dropToUpload")}</div>
          </div>
        </div>
      )}
      <div className="space-y-5">
        {/* ── Header: title + meta + quota pill + view + upload ─────── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <Link
                    href={`/${lang}/d/${companySlug}/buckets`}
                    className="transition-colors hover:text-foreground"
                  >
                    {t("title")}
                  </Link>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbDropItem
                  active={!currentFolder}
                  label={bucket.name}
                  path=""
                  canDrop={canReorderMedia && Boolean(currentFolder)}
                  onClick={() => handleOpenFolder("")}
                  maxWidthClass={currentFolder ? "max-w-44" : "max-w-56"}
                />
                {folderSegments(currentFolder).map((segment, index, all) => (
                  <FragmentBreadcrumb
                    key={segment.path}
                    active={index === all.length - 1}
                    label={segment.label}
                    path={segment.path}
                    canDrop={canReorderMedia && index !== all.length - 1}
                    onClick={() => handleOpenFolder(segment.path)}
                  />
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {bucket.name}
              </h1>
              <Badge variant="outline" className={cn("gap-1", visibilityBadgeClass)}>
                {bucket.isPublic
                  ? t("visibility.public")
                  : t("visibility.private")}
              </Badge>
              {canEditBucket && (
                <Switch
                  checked={bucket.isPublic}
                  onCheckedChange={handleBucketVisibilityChange}
                  disabled={visibilityBusy}
                  aria-label={t("detail.visibilityToggle")}
                />
              )}
              {/* Aktif klasör action menüsü — bucket içinde bir folder
                  açıkken; "Yeniden adlandır" + "Sil" + breadcrumb'da
                  saklı kalmasın diye keşfedilebilir butonla. */}
              {currentFolder && (canUploadMedia || canDeleteMedia) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        title={t("detail.folderActionsTitle", {
                          name: folderName(currentFolder),
                        })}
                      >
                        <HugeiconsIcon
                          icon={Folder01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        <span className="max-w-32 truncate">
                          {folderName(currentFolder)}
                        </span>
                        <HugeiconsIcon
                          icon={MoreHorizontalIcon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="start" className="min-w-44">
                    {canUploadMedia && (
                      <DropdownMenuItem
                        onClick={() => openRenameFolderDialog(currentFolder)}
                      >
                        <HugeiconsIcon
                          icon={PencilEdit01Icon}
                          strokeWidth={2}
                        />
                        {t("detail.renameFolderCta")}
                      </DropdownMenuItem>
                    )}
                    {canDeleteMedia && (
                      <DropdownMenuItem
                        onClick={() => handleDeleteFolder(currentFolder)}
                        className="text-destructive"
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        {t("detail.deleteFolderCta")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {bucket.fileCount} {t("detail.fileCount")}
              </span>
              <span className="opacity-50">·</span>
              <span className="tabular-nums">{formatBytes(bucket.storageUsed)}</span>
              {quota && quota.limit > 0 && (
                <>
                  <span className="opacity-50">·</span>
                  <QuotaPill
                    used={quotaTotalUsed}
                    limit={quota.limit}
                    percent={quotaPercent}
                  />
                </>
              )}
            </div>
            {bucket.description && (
              <p className="text-sm text-muted-foreground">
                {bucket.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ViewSwitcher value={view} onChange={setView} />
            {canUploadMedia && (
              <Button
                variant="secondary"
                onClick={openCreateFolderDialog}
                className="gap-1.5"
              >
                <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
                {t("detail.newFolderCta")}
              </Button>
            )}
            {canUploadMedia && (
              <FileUploaderPopover
                apiRef={uploaderApiRef}
                open={uploaderOpen}
                onOpenChange={setUploaderOpen}
                pendingFiles={droppedFiles}
                onPendingConsumed={() => setDroppedFiles([])}
                upload={handleUpload}
                onSuccess={() => load()}
                maxSize={maxUploadBytes}
                preprocess={handleCropPreprocess}
                headerSlot={
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
                    <Switch
                      checked={videoOptimize}
                      onCheckedChange={setVideoOptimize}
                      className="mt-0.5"
                    />
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="text-xs font-medium">
                        {t("detail.videoOptimize")}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground">
                        {t("detail.videoOptimizeHint")}
                      </span>
                    </div>
                  </label>
                }
                onReject={(files) => {
                  if (files.length === 1) {
                    toast.error(files[0]!.message)
                  } else {
                    toast.error(
                      t("detail.uploadTooLargeMulti", {
                        count: files.length,
                        max: formatUploadBytes(maxUploadBytes),
                      }),
                    )
                  }
                }}
              >
                <Button>
                  <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={2} />
                  {t("detail.uploadCta")}
                </Button>
              </FileUploaderPopover>
            )}
          </div>
        </div>

        {/* ── Toolbar: search + sort ──────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/50 p-1.5">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("detail.searchPlaceholder")}
              className="border-0 bg-transparent ps-9 shadow-none focus-visible:ring-0"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute end-1 top-1/2 -translate-y-1/2"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            )}
          </div>
          <div className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={ArrowDataTransferHorizontalIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            <span>{t("detail.sortBy")}</span>
          </div>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-44 border-0 bg-transparent shadow-none">
              <span className="flex flex-1 items-center truncate text-start">
                {t(`detail.sort.${sortKey}`)}
              </span>
            </SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`detail.sort.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label="Toggle sort direction"
            title={sortDir === "asc" ? t("detail.sortAsc") : t("detail.sortDesc")}
          >
            <HugeiconsIcon
              icon={sortDir === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
              strokeWidth={2}
            />
          </Button>
        </div>

        {/* ── Items ──────────────────────────────────────────────── */}
        <BucketSurfaceContextMenu
          canCreateFolder={canUploadMedia}
          onCreateFolder={openCreateFolderDialog}
          t={t}
        >
          {currentViewEmpty ? (
            <EmptyState
              icon={
                <HugeiconsIcon
                  icon={search ? Search01Icon : CloudUploadIcon}
                  strokeWidth={1.5}
                />
              }
              title={search ? t("detail.searchEmpty") : t("detail.emptyFiles")}
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayMedia.map((m) => m.id)}
                strategy={rectSortingStrategy}
                disabled={!dragEnabled}
              >
                {view === "grid" && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {displayFolders.map((folder) => (
                      <FolderDropCard
                        key={folder.path}
                        folder={folder}
                        variant="grid"
                        canDrop={canReorderMedia}
                        canRename={canUploadMedia}
                        canDelete={canDeleteMedia}
                        onOpen={() => handleOpenFolder(folder.path)}
                        onRename={openRenameFolderDialog}
                        onDelete={handleDeleteFolder}
                        t={t}
                      />
                    ))}
                    {displayMedia.map((m) => (
                      <SortableMediaTile
                        key={m.id}
                        media={m}
                        companySlug={companySlug}
                        bucketSlug={bucketSlug}
                        selected={selectedIds.has(m.id)}
                        dragEnabled={dragEnabled}
                        onClick={(e) => handleTileClick(m, e)}
                        actions={itemActions}
                      />
                    ))}
                  </div>
                )}

                {view === "list" && (
                  <div className="flex flex-col gap-1 rounded-xl border bg-card p-1.5">
                    {displayFolders.map((folder) => (
                      <FolderDropCard
                        key={folder.path}
                        folder={folder}
                        variant="list"
                        canDrop={canReorderMedia}
                        canRename={canUploadMedia}
                        canDelete={canDeleteMedia}
                        onOpen={() => handleOpenFolder(folder.path)}
                        onRename={openRenameFolderDialog}
                        onDelete={handleDeleteFolder}
                        t={t}
                      />
                    ))}
                    {displayMedia.map((m) => (
                      <SortableMediaRow
                        key={m.id}
                        media={m}
                        companySlug={companySlug}
                        bucketSlug={bucketSlug}
                        selected={selectedIds.has(m.id)}
                        dragEnabled={dragEnabled}
                        onClick={(e) => handleTileClick(m, e)}
                        actions={itemActions}
                      />
                    ))}
                  </div>
                )}

                {view === "table" && (
                  <div className="rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("columns.name")}</TableHead>
                          <TableHead className="text-end">
                            {t("columns.size")}
                          </TableHead>
                          <TableHead>{t("columns.created")}</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayMedia.map((m) => (
                          <SortableMediaTableRow
                            key={m.id}
                            media={m}
                            selected={selectedIds.has(m.id)}
                            dragEnabled={dragEnabled}
                            onClick={(e) => handleTileClick(m, e)}
                            actions={itemActions}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SortableContext>
            </DndContext>
          )}
        </BucketSurfaceContextMenu>

        {/* Pagination footer — server-side. Toplam total kullanıcının
            mevcut filter+folder kapsamındaki dosyaları yansıtır. */}
        {total > pageSize && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {t("detail.paginationRange", {
                from: page * pageSize + 1,
                to: Math.min((page + 1) * pageSize, total),
                total,
              })}
            </span>
            <div className="ms-auto flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || mediaLoading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="h-7 px-2 text-xs"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                {t("detail.paginationPrev")}
              </Button>
              <span className="px-2 tabular-nums">
                {t("detail.paginationPageOf", {
                  page: page + 1,
                  total: Math.max(1, Math.ceil(total / pageSize)),
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  (page + 1) * pageSize >= total || mediaLoading
                }
                onClick={() => setPage((p) => p + 1)}
                className="h-7 px-2 text-xs"
              >
                {t("detail.paginationNext")}
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bulk actions toolbar — sticky bottom ─────────────────── */}
      {selectedIds.size > 0 && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur-md">
            <span className="px-3 text-xs font-medium tabular-nums text-muted-foreground">
              {selectedIds.size} {t("detail.selected")}
            </span>
            <div className="h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBulkCopyUrls}
              disabled={bulkBusy}
              className="gap-1.5"
            >
              <HugeiconsIcon
                icon={Copy01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("detail.copyUrls")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBulkDownloadZip}
              disabled={bulkBusy}
              className="gap-1.5"
            >
              <HugeiconsIcon
                icon={Download01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("detail.downloadZip")}
            </Button>
            {canDeleteMedia && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkDelete}
                disabled={bulkBusy}
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <HugeiconsIcon
                  icon={Delete02Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                {t("detail.bulkDelete")}
              </Button>
            )}
            <div className="h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearSelection}
              aria-label="Clear selection"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Preview lightbox ───────────────────────────────────── */}
      <FilePreviewLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        items={displayMedia.map<FilePreviewItem>((m) => {
          // Push image thumbnails + video transcode rungs into the
          // unified `variants` pool the lightbox draws from for both
          // its quality picker and the toolbar download dropdown.
          // Image variants use width as the quality segment, video
          // uses height — that contract matches the CDN's
          // `/f/:mediaId/:quality` resolver in routes/file.ts.
          const variants: NonNullable<FilePreviewItem["variants"]> = []
          for (const t of m.imageMeta?.thumbnails ?? []) {
            variants.push({
              kind: "image",
              url: previewUrl(companySlug, bucketSlug, m, t.width),
              label: `${t.width}w`,
              size: t.size,
            })
          }
          for (const v of m.videoMeta?.variants ?? []) {
            variants.push({
              kind: "video",
              url: previewUrl(companySlug, bucketSlug, m, v.height),
              label: `${v.height}p`,
              size: v.size,
            })
          }
          return {
            id: m.id,
            url: previewUrl(companySlug, bucketSlug, m),
            name: m.originalName,
            mimeType: m.mimeType,
            size: m.size,
            variants: variants.length > 0 ? variants : undefined,
          }
        })}
        initialIndex={lightboxIndex}
        onDownload={(item) => {
          const m = displayMedia.find((x) => x.id === item.id)
          if (!m) return
          const a = document.createElement("a")
          a.href = downloadUrl(companySlug, bucketSlug, m)
          a.rel = "noopener"
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }}
        buildConvertUrl={(item, format) => {
          const params = new URLSearchParams({
            format,
            download: "1",
            filename: item.name.replace(/\.[^.]+$/, ""),
          })
          return `${mediaBase}/${item.id}/download?${params.toString()}`
        }}
        onSaveText={
          canUploadMedia
            ? async (item, content) => {
                const res = await fetch(`${mediaBase}/${item.id}/content`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content }),
                })
                if (!res.ok) {
                  const j = (await res.json().catch(() => ({}))) as {
                    error?: string
                  }
                  throw new Error(j.error || `Save failed (${res.status})`)
                }
                toast.success(t("detail.fileSaved"))
                void load() // boyut değişti → listeyi tazele
              }
            : undefined
        }
      />

      <CreateFolderDialog
        open={createFolderOpen}
        value={newFolderName}
        parentPath={currentFolder}
        busy={folderBusy}
        onOpenChange={setCreateFolderOpen}
        onValueChange={setNewFolderName}
        onSubmit={handleCreateFolder}
        t={t}
      />

      <RenameFolderDialog
        open={renameFolderTarget !== null}
        currentPath={renameFolderTarget}
        value={renameFolderValue}
        busy={renameFolderBusy}
        onOpenChange={(o) => {
          if (!o) setRenameFolderTarget(null)
        }}
        onValueChange={setRenameFolderValue}
        onSubmit={handleRenameFolder}
        t={t}
      />

      {/* ── Get Info Sheet ─────────────────────────────────────── */}
      <MediaInfoSheet
        media={infoMedia}
        bucket={bucket}
        companySlug={companySlug}
        bucketSlug={bucketSlug}
        onClose={() => setInfoMedia(null)}
        onCopyUrl={handleCopyUrl}
        onDownload={handleDownload}
        onPreview={(m) => {
          // Sheet'i kapat — aksi halde lightbox açık sheet'in ALTINDA kalıyor.
          setInfoMedia(null)
          handlePreview(m)
        }}
        t={t}
      />

      {/* Image crop dialog — `FileUploader` preprocess akışında promise
          resolver pattern. Image dosyalar için yükleme öncesi açılır;
          PDF/video/diğer için preprocess hook direkt orijinal döner. */}
      {pendingCrop && (
        <CropDialog
          open
          file={pendingCrop.file}
          onClose={(out) => {
            pendingCrop.resolve(out)
            setPendingCrop(null)
          }}
        />
      )}
    </PageTransition>
  )
}

function FragmentBreadcrumb({
  active,
  label,
  path,
  canDrop,
  onClick,
}: {
  active: boolean
  label: string
  path: string
  canDrop: boolean
  onClick: () => void
}) {
  return (
    <>
      <BreadcrumbSeparator />
      <BreadcrumbDropItem
        active={active}
        label={label}
        path={path}
        canDrop={canDrop}
        onClick={onClick}
        maxWidthClass="max-w-40"
      />
    </>
  )
}

/**
 * Breadcrumb segment'i hem navigasyon butonu hem de dnd-kit droppable
 * hedefi. Aktif (current) segment droppable değil — kullanıcı zaten
 * orada. Pasif segment'ler `folderDropId(path)` ile aynı drop schema'yı
 * paylaşır, böylece `handleDragEnd` ortak yola düşer.
 */
function BreadcrumbDropItem({
  active,
  label,
  path,
  canDrop,
  onClick,
  maxWidthClass,
}: {
  active: boolean
  label: string
  path: string
  canDrop: boolean
  onClick: () => void
  maxWidthClass: string
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: folderDropId(path),
    disabled: !canDrop,
  })

  return (
    <li
      ref={setNodeRef}
      data-slot="breadcrumb-item"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md transition-colors",
        canDrop && "px-1.5 py-0.5",
        isOver && "bg-primary/15 text-primary ring-1 ring-primary/40",
      )}
    >
      {active ? (
        <BreadcrumbPage className={cn("truncate", maxWidthClass)}>
          {label}
        </BreadcrumbPage>
      ) : (
        <button
          type="button"
          className={cn("truncate transition-colors hover:text-foreground", maxWidthClass)}
          onClick={onClick}
        >
          {label}
        </button>
      )}
    </li>
  )
}

function BucketSurfaceContextMenu({
  canCreateFolder,
  onCreateFolder,
  children,
  t,
}: {
  canCreateFolder: boolean
  onCreateFolder: () => void
  children: React.ReactNode
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={(triggerProps) => (
          <div
            {...triggerProps}
            className={cn("min-h-40", triggerProps.className)}
          >
            {children}
          </div>
        )}
      />
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem disabled={!canCreateFolder} onClick={onCreateFolder}>
          <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
          {t("detail.newFolderCta")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function FolderDropCard({
  folder,
  variant,
  canDrop,
  canRename,
  canDelete,
  onOpen,
  onRename,
  onDelete,
  t,
}: {
  folder: BucketFolderSummary
  variant: "grid" | "list"
  canDrop: boolean
  /** Sağ-tık menüsünde "Yeniden adlandır" görünür mü. */
  canRename: boolean
  /** Sağ-tık menüsünde "Sil" görünür mü. */
  canDelete: boolean
  onOpen: () => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: folderDropId(folder.path),
    disabled: !canDrop,
  })
  const name = folderName(folder.path)

  const inner =
    variant === "list" ? (
      <button
        ref={setNodeRef}
        type="button"
        onClick={onOpen}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-start transition-colors",
          isOver
            ? "border-primary/50 bg-primary/10"
            : "hover:bg-muted/50",
        )}
        aria-label={t("detail.openFolder", { name })}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300",
            isOver && "bg-primary/15 text-primary",
          )}
        >
          <HugeiconsIcon
            icon={isOver ? FolderOpenIcon : Folder01Icon}
            strokeWidth={1.8}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {folder.fileCount} {t("detail.fileCount")} ·{" "}
            {formatBytes(folder.storageUsed)}
          </span>
        </span>
      </button>
    ) : (
      <button
        ref={setNodeRef}
        type="button"
        onClick={onOpen}
        className="group block w-full pt-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("detail.openFolder", { name })}
      >
        <div
          className={cn(
            "ms-4 h-4 w-20 rounded-t-md border border-b-0 border-amber-500/35 bg-amber-500/20 transition-colors",
            isOver && "border-primary/50 bg-primary/20",
          )}
        />
        <div
          className={cn(
            "flex min-h-36 flex-col rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 transition-colors hover:border-amber-500/60 hover:bg-amber-500/15",
            isOver && "border-primary/60 bg-primary/10 ring-2 ring-primary/20",
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300",
                isOver && "bg-primary/15 text-primary",
              )}
            >
              <HugeiconsIcon
                icon={isOver ? FolderOpenIcon : Folder01Icon}
                strokeWidth={1.8}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" title={name}>
                {name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {folder.path}
              </div>
            </div>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-4 text-xs">
            <BucketFolderStat
              label={t("columns.files")}
              value={String(folder.fileCount)}
            />
            <BucketFolderStat
              label={t("columns.size")}
              value={formatBytes(folder.storageUsed)}
            />
          </div>
        </div>
      </button>
    )

  if (!canRename && !canDelete) return inner
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div>{inner}</div>} />
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem onClick={onOpen}>
          <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
          {t("detail.openFolder", { name })}
        </ContextMenuItem>
        {canRename && (
          <ContextMenuItem onClick={() => onRename(folder.path)}>
            <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
            {t("detail.renameFolderCta")}
          </ContextMenuItem>
        )}
        {canDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDelete(folder.path)}
              className="text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              {t("detail.deleteFolderCta")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function BucketFolderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background/55 px-2 py-1.5">
      <div className="truncate text-[10px] uppercase text-muted-foreground">
        {label}
      </div>
      <div className="truncate font-medium tabular-nums">{value}</div>
    </div>
  )
}

function CreateFolderDialog({
  open,
  value,
  parentPath,
  busy,
  onOpenChange,
  onValueChange,
  onSubmit,
  t,
}: {
  open: boolean
  value: string
  parentPath: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onValueChange: (value: string) => void
  onSubmit: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("detail.newFolderTitle")}</DialogTitle>
            <DialogDescription>
              {t("detail.newFolderDesc", {
                parent: parentPath || t("detail.root"),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="bucket-folder-name">
              {t("detail.folderNameLabel")}
            </Label>
            <Input
              id="bucket-folder-name"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder={t("detail.folderNamePlaceholder")}
              disabled={busy}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("create.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("detail.createFolderSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RenameFolderDialog({
  open,
  currentPath,
  value,
  busy,
  onOpenChange,
  onValueChange,
  onSubmit,
  t,
}: {
  open: boolean
  currentPath: string | null
  value: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onValueChange: (value: string) => void
  onSubmit: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("detail.renameFolderTitle")}</DialogTitle>
            <DialogDescription>
              {currentPath
                ? t("detail.renameFolderDesc", { path: currentPath })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="bucket-folder-rename">
              {t("detail.folderNameLabel")}
            </Label>
            <Input
              id="bucket-folder-rename"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder={t("detail.folderNamePlaceholder")}
              disabled={busy}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("create.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("detail.renameFolderSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub: View switcher ──────────────────────────────────────────────────

function ViewSwitcher({
  value,
  onChange,
}: {
  value: "grid" | "list" | "table"
  onChange: (v: "grid" | "list" | "table") => void
}) {
  return (
    <div className="flex items-center rounded-full border bg-background p-0.5">
      <Button
        variant={value === "grid" ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => onChange("grid")}
        aria-label="Grid view"
        aria-pressed={value === "grid"}
      >
        <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
      </Button>
      <Button
        variant={value === "list" ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => onChange("list")}
        aria-label="List view"
        aria-pressed={value === "list"}
      >
        <HugeiconsIcon icon={ListViewIcon} strokeWidth={2} />
      </Button>
    </div>
  )
}

// ─── Sub: Quota pill ─────────────────────────────────────────────────────

function QuotaPill({
  used,
  limit,
  percent,
}: {
  used: number
  limit: number
  percent: number
}) {
  const colorClass =
    percent >= 90
      ? "bg-red-500"
      : percent >= 70
        ? "bg-amber-500"
        : "bg-primary"
  return (
    <span className="flex items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-xs">
      <HugeiconsIcon
        icon={Database01Icon}
        strokeWidth={2}
        className="size-3.5 text-muted-foreground"
      />
      <span className="relative inline-flex h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="tabular-nums">
        {formatBytes(used, 0)}/{formatBytes(limit, 0)}
      </span>
    </span>
  )
}

// ─── Item action shape ──────────────────────────────────────────────────

interface MediaItemActions {
  onPreview: (m: Media) => void
  onInfo: (m: Media) => void
  onCopyUrl: (m: Media) => void
  onDownload: (m: Media) => void
  onDelete: (m: Media) => void
  canDelete: boolean
  t: ReturnType<typeof useTranslations>
}

// ─── Sub: Item context menu ─────────────────────────────────────────────

function MediaContextMenu({
  media,
  actions,
  children,
}: {
  media: Media
  actions: MediaItemActions
  children: React.ReactNode
}) {
  const { onPreview, onInfo, onCopyUrl, onDownload, onDelete, canDelete, t } =
    actions
  return (
    <ContextMenu>
      <ContextMenuTrigger className="block">{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem onClick={() => onPreview(media)}>
          <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />
          {t("detail.menu.preview")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onInfo(media)}>
          <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
          {t("detail.menu.info")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onCopyUrl(media)}>
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          {t("detail.menu.copyUrl")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDownload(media)}>
          <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
          {t("detail.menu.download")}
        </ContextMenuItem>
        {canDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDelete(media)}
              className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              {t("detail.menu.delete")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ─── Sub: SortableMediaTile ─────────────────────────────────────────────

function SortableMediaTile({
  media,
  companySlug,
  bucketSlug,
  selected,
  dragEnabled,
  onClick,
  actions,
}: {
  media: Media
  companySlug: string
  bucketSlug: string
  selected: boolean
  dragEnabled: boolean
  onClick: (e: React.MouseEvent) => void
  actions: MediaItemActions
}) {
  const sortable = useSortable({ id: media.id, disabled: !dragEnabled })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const showThumb = hasThumbnail(media)
  // CDN occasionally lists `imageMeta.thumbnails` ahead of S3
  // landing the file (race during a re-upload, or a transient
  // 404 from a partial bucket purge). Without an `onError` fallback
  // the user sees the browser's broken-image glyph forever; flip
  // to the type icon as soon as the image element reports a load
  // failure.
  const [imgFailed, setImgFailed] = useState(false)
  const useThumb = showThumb && !imgFailed
  return (
    <MediaContextMenu media={media} actions={actions}>
      <div
        ref={setNodeRef}
        style={style}
        data-media-id={media.id}
        {...(dragEnabled ? attributes : {})}
        {...(dragEnabled ? listeners : {})}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick(e as unknown as React.MouseEvent)
          }
        }}
        role="button"
        tabIndex={0}
        className={cn(
          "group relative overflow-hidden rounded-xl border bg-card cursor-pointer transition-all",
          selected
            ? "border-primary/60 ring-2 ring-primary/40 shadow-md"
            : "hover:border-foreground/20 hover:shadow-md",
          isDragging && "z-20 cursor-grabbing",
        )}
      >
        <div className="aspect-square w-full overflow-hidden bg-muted">
          {useThumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl(companySlug, bucketSlug, media, 250)}
              alt={media.alt || media.originalName}
              className={cn(
                "h-full w-full object-cover transition-transform",
                !selected && "group-hover:scale-105",
              )}
              loading="lazy"
              decoding="async"
              width={250}
              height={250}
              draggable={false}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-6">
              <MediaTypeIcon media={media} width={64} />
            </div>
          )}
        </div>
        <div className="space-y-0.5 p-2">
          <div className="truncate text-xs font-medium" title={media.originalName}>
            {media.originalName}
          </div>
          <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>{formatBytes(media.size)}</span>
            <span>{media.type}</span>
          </div>
        </div>
        {selected && (
          <div
            aria-hidden
            className="pointer-events-none absolute start-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow"
          >
            ✓
          </div>
        )}
        <ProcessingBadge media={media} />
      </div>
    </MediaContextMenu>
  )
}

/**
 * Tiny "video transcoding" pill — overlaid on top-right of any media
 * tile whose `processing.status` is in flight. Reads the planned vs
 * completed variant counts from the doc so the user sees the bar
 * climb in real time as the polling loop refetches the media list.
 * Renders nothing for completed / failed / undefined states (failed
 * shows a separate dim red marker so the user knows something went
 * sideways without blocking interaction).
 */
function ProcessingBadge({ media }: { media: Media }) {
  const p = media.processing
  if (!p) return null
  if (p.status === "completed") return null
  if (p.status === "failed") {
    return (
      <div
        className="pointer-events-none absolute end-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-destructive/85 px-2 py-0.5 text-[10px] font-medium text-destructive-foreground shadow"
        title={p.error}
      >
        Failed
      </div>
    )
  }
  const total = p.variantsTotal ?? 0
  const done = p.variantsCompleted ?? 0
  return (
    <div
      className="pointer-events-none absolute end-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-foreground/85 px-2 py-0.5 text-[10px] font-medium text-background shadow backdrop-blur"
      aria-live="polite"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-amber-300" />
      Processing
      {total > 0 ? (
        <span className="tabular-nums opacity-70">
          {done}/{total}
        </span>
      ) : null}
    </div>
  )
}

/**
 * "Embed" entry point — opens the builder dialog where the user
 * picks dimensions + autoplay/loop/muted/controls/start, watches a
 * live preview, and copies the resulting `<iframe>` snippet. Stays
 * in sync with the embed page's URL-param parser
 * (apps/storage/app/embed/[id]/page.tsx).
 */
function EmbedSnippetSection({ media }: { media: Media }) {
  const t = useTranslations("storage")
  const [open, setOpen] = useState(false)
  const storageOrigin = process.env.NEXT_PUBLIC_STORAGE_APP_URL || undefined
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t("detail.info.embed")}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="h-8 justify-start gap-2 text-xs"
        >
          <HugeiconsIcon
            icon={Copy01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
          {t("detail.embed.open")}
        </Button>
        <p className="text-[10.5px] text-muted-foreground">
          {t("detail.embed.hint")}
        </p>
      </div>
      <EmbedBuilderDialog
        open={open}
        onOpenChange={setOpen}
        mediaId={media.id}
        kind={media.type === "audio" ? "audio" : "video"}
        storageOrigin={storageOrigin}
      />
    </>
  )
}

// ─── Sub: SortableMediaRow ──────────────────────────────────────────────

function SortableMediaRow({
  media,
  companySlug,
  bucketSlug,
  selected,
  dragEnabled,
  onClick,
  actions,
}: {
  media: Media
  companySlug: string
  bucketSlug: string
  selected: boolean
  dragEnabled: boolean
  onClick: (e: React.MouseEvent) => void
  actions: MediaItemActions
}) {
  const sortable = useSortable({ id: media.id, disabled: !dragEnabled })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const showThumb = hasThumbnail(media)
  const [imgFailed, setImgFailed] = useState(false)
  const useThumb = showThumb && !imgFailed
  return (
    <MediaContextMenu media={media} actions={actions}>
      <div
        ref={setNodeRef}
        style={style}
        data-media-id={media.id}
        {...(dragEnabled ? attributes : {})}
        {...(dragEnabled ? listeners : {})}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick(e as unknown as React.MouseEvent)
          }
        }}
        role="button"
        tabIndex={0}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 cursor-pointer transition-colors",
          selected
            ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
            : "hover:bg-muted/50",
          isDragging && "z-20 cursor-grabbing",
        )}
      >
        <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
          {useThumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl(companySlug, bucketSlug, media, 250)}
              alt={media.alt || media.originalName}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              width={40}
              height={40}
              draggable={false}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-1.5">
              <MediaTypeIcon media={media} width={26} />
            </div>
          )}
          {selected && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/20"
            >
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow">
                ✓
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">
              {media.originalName}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {media.mimeType} · {media.type}
            </span>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatBytes(media.size)}
          </span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {formatDistanceToNow(new Date(media.createdAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>
    </MediaContextMenu>
  )
}

// ─── Sub: SortableMediaTableRow ─────────────────────────────────────────

function SortableMediaTableRow({
  media,
  selected,
  dragEnabled,
  onClick,
  actions,
}: {
  media: Media
  selected: boolean
  dragEnabled: boolean
  onClick: (e: React.MouseEvent) => void
  actions: MediaItemActions
}) {
  const sortable = useSortable({ id: media.id, disabled: !dragEnabled })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={(triggerProps) => (
          <TableRow
            {...triggerProps}
            ref={setNodeRef}
            style={style}
            {...(dragEnabled ? attributes : {})}
            {...(dragEnabled ? listeners : {})}
            onClick={onClick}
            data-state={selected ? "selected" : undefined}
            className={cn(
              "cursor-pointer transition-colors",
              selected
                ? "bg-primary/5 hover:bg-primary/10"
                : "hover:bg-muted/50",
              isDragging && "cursor-grabbing",
            )}
          >
            <TableCell>
              <div className="flex items-center gap-2.5">
                {selected && (
                  <span
                    aria-hidden
                    className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground"
                  >
                    ✓
                  </span>
                )}
                <MediaTypeIcon media={media} width={18} className="shrink-0" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{media.originalName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {media.mimeType}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-end tabular-nums">
              {formatBytes(media.size)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDistanceToNow(new Date(media.createdAt), { addSuffix: true })}
            </TableCell>
            <TableCell />
          </TableRow>
        )}
      />
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem onClick={() => actions.onPreview(media)}>
          <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />
          {actions.t("detail.menu.preview")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.onInfo(media)}>
          <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
          {actions.t("detail.menu.info")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => actions.onCopyUrl(media)}>
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          {actions.t("detail.menu.copyUrl")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.onDownload(media)}>
          <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
          {actions.t("detail.menu.download")}
        </ContextMenuItem>
        {actions.canDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => actions.onDelete(media)}
              className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              {actions.t("detail.menu.delete")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ─── Sub: Get Info Sheet ───────────────────────────────────────────────

function MediaInfoSheet({
  media,
  bucket,
  companySlug,
  bucketSlug,
  onClose,
  onCopyUrl,
  onDownload,
  onPreview,
  t,
}: {
  media: Media | null
  bucket: Bucket
  companySlug: string
  bucketSlug: string
  onClose: () => void
  onCopyUrl: (m: Media) => void
  onDownload: (m: Media) => void
  onPreview: (m: Media) => void
  t: ReturnType<typeof useTranslations>
}) {
  if (!media) {
    return (
      <Sheet open={false} onOpenChange={(open) => !open && onClose()}>
        <SheetContent />
      </Sheet>
    )
  }

  const showThumb = hasThumbnail(media)
  const [imgFailed, setImgFailed] = useState(false)
  const useThumb = showThumb && !imgFailed
  const url = absoluteUrl(previewUrl(companySlug, bucketSlug, media))
  const dimensions = media.imageMeta
    ? `${media.imageMeta.width} × ${media.imageMeta.height}`
    : null

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate pe-10">{media.originalName}</SheetTitle>
          <SheetDescription>{t("detail.info.subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto p-6">
          <div className="overflow-hidden rounded-xl border bg-muted">
            <div className="aspect-video w-full">
              {useThumb ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl(companySlug, bucketSlug, media, 1000)}
                  alt={media.alt || media.originalName}
                  className="h-full w-full object-contain"
                  draggable={false}
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-10">
                  <MediaTypeIcon media={media} width={120} />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onPreview(media)} className="gap-1.5">
              <HugeiconsIcon icon={EyeIcon} strokeWidth={2} className="size-4" />
              {t("detail.menu.preview")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onDownload(media)} className="gap-1.5">
              <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-4" />
              {t("detail.menu.download")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onCopyUrl(media)} className="gap-1.5">
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-4" />
              {t("detail.menu.copyUrl")}
            </Button>
          </div>

          <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <Field label={t("detail.info.type")} value={media.type} mono />
            <Field label={t("detail.info.mime")} value={media.mimeType} mono />
            <Field label={t("detail.info.size")} value={formatBytes(media.size)} mono />
            {dimensions && (
              <Field label={t("detail.info.dimensions")} value={dimensions} mono />
            )}
            <Field label={t("detail.info.folder")} value={media.folder || "—"} mono />
            <Field
              label={t("detail.info.visibility")}
              value={media.isPublic ? t("visibility.public") : t("visibility.private")}
            />
            <Field
              label={t("detail.info.bucket")}
              value={bucket.name}
              span={3}
            />
            {media.alt && (
              <Field label={t("detail.info.alt")} value={media.alt} span={3} />
            )}
            {media.caption && (
              <Field label={t("detail.info.caption")} value={media.caption} span={3} />
            )}
            {media.tags.length > 0 && (
              <div className="col-span-3 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("detail.info.tags")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {media.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-mono text-[11px]">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <Field
              label={t("detail.info.createdAt")}
              value={format(new Date(media.createdAt), "PPpp")}
              span={3}
            />
            <Field
              label={t("detail.info.updatedAt")}
              value={format(new Date(media.updatedAt), "PPpp")}
              span={3}
            />
            <Field label={t("detail.info.id")} value={media.id} span={3} mono />
            <Field label={t("detail.info.fileName")} value={media.fileName} span={3} mono />
          </dl>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("detail.info.url")}
            </span>
            <div className="flex items-center gap-2">
              <Input value={url} readOnly className="font-mono text-xs" />
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => onCopyUrl(media)}
                aria-label="Copy URL"
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              </Button>
            </div>
          </div>

          {/* Public embed snippet — only meaningful for audio/video
              that's already public; image embedding is a `<img src>`
              away and PDF/office have their own preview surfaces. */}
          {media.isPublic &&
            (media.type === "video" || media.type === "audio") && (
              <EmbedSnippetSection media={media} />
            )}

          {/* Thumbnail variants — hangi width'lerin S3'te kalıcı olduğunu
              gösteriyoruz; PDF/video için de görünür. */}
          {media.imageMeta && media.imageMeta.thumbnails.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("detail.info.variants")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {media.imageMeta.thumbnails.map((th) => (
                  <Badge
                    key={th.width}
                    variant="outline"
                    className="font-mono text-[11px]"
                  >
                    <HugeiconsIcon
                      icon={ImageAdd01Icon}
                      strokeWidth={2}
                      className="size-3"
                    />
                    {th.width}w · {formatBytes(th.size, 0)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({
  label,
  value,
  span = 1,
  mono = false,
}: {
  label: string
  value: string
  span?: 1 | 2 | 3
  mono?: boolean
}) {
  const colSpan = span === 3 ? "col-span-3" : span === 2 ? "col-span-2" : "col-span-1"
  return (
    <div className={cn("flex flex-col gap-0.5", colSpan)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "break-all text-sm",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  )
}

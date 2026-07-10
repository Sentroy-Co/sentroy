"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FolderLibraryIcon,
  Folder01Icon,
  ArrowRight02Icon,
  Image01Icon,
  Video01Icon,
  MusicNote01Icon,
  File01Icon,
} from "@hugeicons/core-free-icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  WidgetChooseState,
  WidgetErrorState,
  WidgetHeader,
  WidgetSpinner,
} from "./widget-ui"

const POLL_MS = 120_000
const STORAGE_COLOR = "#a855f7"
/** Kök klasörü Select value olarak temsil eden sentinel (base-ui boş string
 *  value'yu sevmez) — config'e "" olarak yazılır. */
const ROOT_VALUE = "__root__"
/** İçerik listesinde gösterilecek maksimum satır (klasör + dosya birlikte). */
const MAX_ROWS = 7
/** DB media folder konvansiyonu: kök = "uploads" (bkz. apps/storage/lib/folders
 *  toMediaFolder). Folder path'leri zaten normalize (folders endpoint'inden). */
const ROOT_MEDIA_FOLDER = "uploads"

/**
 * Storage "Quick access" widget'ı — config'de seçilen bucket + klasörün
 * İÇERİĞİNİ (alt-klasörler + dosyalar) listeler ve tıklamada storage app'ini
 * O YOLDA (deep-link, plain-iframe pencere) açar. Veri kaynakları (core rewrite):
 *   GET /api/storage/companies/[slug]/buckets → { data: Bucket[] } (config listesi)
 *   GET /api/storage/companies/[slug]/buckets/[bucketSlug]/folders
 *     → { data: { folders: [{ path, fileCount, storageUsed, explicit }] } }
 *   GET /api/storage/companies/[slug]/buckets/[bucketSlug]/media?folder=<db-folder>
 *     → { data: { items: Media[], total } }  (Media: {id, originalName, type, …})
 * Tıklama: alt-klasör → o klasör; dosya → bulunduğu klasör (+dosya vurgusu).
 */

interface FolderRow {
  path: string
  fileCount: number
}

interface MediaRow {
  id: string
  originalName: string
  type: string
}

/** UI klasör path'inin bir üst seviyesi ("a/b" → "a", "a" → ""). */
function parentOf(path: string): string {
  const parts = path.split("/").filter(Boolean)
  return parts.slice(0, -1).join("/")
}

/** UI path'in son segmenti (görünen ad). */
function leafName(path: string): string {
  const parts = path.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** UI klasör path'ini DB media folder değerine çevir (kök → "uploads"). */
function toMediaFolderParam(folder: string): string {
  return folder || ROOT_MEDIA_FOLDER
}

function fileIcon(type: string): typeof File01Icon {
  if (type === "image") return Image01Icon
  if (type === "video") return Video01Icon
  if (type === "audio") return MusicNote01Icon
  return File01Icon
}

export function StorageWidgetContent({
  slug,
  config,
  refreshKey = 0,
  onOpenStoragePath,
  onConfigure,
}: {
  slug: string
  config?: Record<string, unknown>
  /** Sağ-tık "Refresh widgets" sayacı — değişince yeniden fetch. */
  refreshKey?: number
  /** Storage'ı bucket/klasör (+opsiyonel dosya) yolunda aç. */
  onOpenStoragePath: (bucket: string, folder: string, fileId?: string) => void
  onConfigure: () => void
}) {
  const t = useTranslations("os")
  const bucket = typeof config?.bucket === "string" ? config.bucket : ""
  const folder = typeof config?.folder === "string" ? config.folder : ""
  const [folders, setFolders] = useState<FolderRow[] | null>(null)
  const [files, setFiles] = useState<MediaRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!bucket) return
    let cancelled = false
    setFolders(null)
    setFiles(null)
    setFailed(false)
    const load = async () => {
      try {
        const base = `/api/storage/companies/${slug}/buckets/${encodeURIComponent(bucket)}`
        const [foldersRes, mediaRes] = await Promise.all([
          fetch(`${base}/folders`),
          fetch(
            `${base}/media?folder=${encodeURIComponent(toMediaFolderParam(folder))}&limit=${MAX_ROWS}`,
          ),
        ])
        if (!foldersRes.ok) throw new Error(String(foldersRes.status))
        if (!mediaRes.ok) throw new Error(String(mediaRes.status))
        const foldersJson = (await foldersRes.json()) as {
          data?: { folders?: FolderRow[] }
        }
        const mediaJson = (await mediaRes.json()) as {
          data?: { items?: MediaRow[] }
        }
        if (cancelled) return
        setFolders(
          Array.isArray(foldersJson.data?.folders) ? foldersJson.data.folders : [],
        )
        setFiles(
          Array.isArray(mediaJson.data?.items) ? mediaJson.data.items : [],
        )
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [slug, bucket, folder, nonce, refreshKey])

  if (!bucket) {
    return (
      <WidgetChooseState
        icon={FolderLibraryIcon}
        color={STORAGE_COLOR}
        label={t("widgetsHub.storage.chooseBucket")}
        onConfigure={onConfigure}
      />
    )
  }

  // Seçili klasörün bir seviye altındaki klasörler (en dolu önce).
  const subfolders = (folders ?? [])
    .filter((f) => parentOf(f.path) === folder)
    .sort((a, b) => b.fileCount - a.fileCount)
  const shownFolders = subfolders.slice(0, MAX_ROWS)
  const remaining = MAX_ROWS - shownFolders.length
  const shownFiles = remaining > 0 ? (files ?? []).slice(0, remaining) : []
  const loadingContent = folders === null || files === null
  const isEmpty =
    !loadingContent && shownFolders.length === 0 && shownFiles.length === 0
  // Başlık: bucket adı + (varsa) klasör path'i.
  const headerTitle = folder ? `${bucket} / ${folder}` : bucket

  return (
    <div className="p-3">
      <WidgetHeader
        icon={FolderLibraryIcon}
        color={STORAGE_COLOR}
        title={headerTitle}
        right={
          <button
            type="button"
            onClick={() => onOpenStoragePath(bucket, folder)}
            aria-label={t("widgetsHub.storage.open")}
            title={t("widgetsHub.storage.open")}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5" strokeWidth={2} />
          </button>
        }
      />
      <div className="mt-2.5">
        {failed ? (
          <WidgetErrorState onRetry={() => setNonce((n) => n + 1)} />
        ) : loadingContent ? (
          <WidgetSpinner />
        ) : isEmpty ? (
          <button
            type="button"
            onClick={() => onOpenStoragePath(bucket, folder)}
            className="w-full rounded-lg px-2 py-5 text-center text-xs text-muted-foreground hover:bg-foreground/5"
          >
            {t("widgetsHub.storage.emptyFolder")}
          </button>
        ) : (
          <div className="flex flex-col gap-0.5">
            {shownFolders.map((f) => (
              <button
                key={`d:${f.path}`}
                type="button"
                onClick={() => onOpenStoragePath(bucket, f.path)}
                title={f.path}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/10"
              >
                <HugeiconsIcon
                  icon={Folder01Icon}
                  className="size-3.5 shrink-0 text-amber-500"
                  strokeWidth={2}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">
                  {leafName(f.path)}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {f.fileCount}
                </span>
              </button>
            ))}
            {shownFiles.map((m) => (
              <button
                key={`f:${m.id}`}
                type="button"
                onClick={() => onOpenStoragePath(bucket, folder, m.id)}
                title={m.originalName}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/10"
              >
                <HugeiconsIcon
                  icon={fileIcon(m.type)}
                  className="size-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={2}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">
                  {m.originalName}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onOpenStoragePath(bucket, "")}
        className="mt-2 w-full rounded-lg px-2 py-1 text-center text-[11px] font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      >
        {t("widgetsHub.storage.open")}
      </button>
    </div>
  )
}

/**
 * Config formu — bucket seçimi + klasör seçimi. SelectValue kullanılmaz —
 * trigger'da manuel render (repo kuralı). Bucket değişince folder köke sıfırlanır.
 */
export function StorageConfig({
  slug,
  config,
  onChange,
}: {
  slug: string
  config?: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}) {
  const t = useTranslations("os")
  const selected = typeof config?.bucket === "string" ? config.bucket : ""
  const selectedFolder = typeof config?.folder === "string" ? config.folder : ""
  const [options, setOptions] = useState<{ slug: string; name: string }[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [folders, setFolders] = useState<FolderRow[] | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const res = await fetch(`/api/storage/companies/${slug}/buckets`)
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { data?: unknown }
      const list = Array.isArray(json.data)
        ? (json.data as { slug?: string; name?: string }[])
        : []
      setOptions(
        list
          .filter((b): b is { slug: string; name: string } => Boolean(b.slug))
          .map((b) => ({ slug: b.slug, name: b.name || b.slug })),
      )
    } catch {
      setFailed(true)
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  // Seçili bucket'ın klasörlerini çek (folder Select'i için).
  useEffect(() => {
    if (!selected) {
      setFolders(null)
      return
    }
    let cancelled = false
    setFolders(null)
    const run = async () => {
      try {
        const res = await fetch(
          `/api/storage/companies/${slug}/buckets/${encodeURIComponent(selected)}/folders`,
        )
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as { data?: { folders?: FolderRow[] } }
        if (cancelled) return
        setFolders(Array.isArray(json.data?.folders) ? json.data.folders : [])
      } catch {
        if (!cancelled) setFolders([])
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [slug, selected])

  if (failed) return <WidgetErrorState onRetry={() => void load()} />
  if (!options) return <WidgetSpinner />

  const selectedName = options.find((o) => o.slug === selected)?.name ?? selected
  const folderPaths = (folders ?? [])
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
  const selectedFolderLabel = selectedFolder || t("widgetsHub.storage.folderRoot")

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t("widgetsHub.storage.bucket")}
        </label>
        <Select
          value={selected || undefined}
          onValueChange={(v) => onChange({ bucket: v, folder: "" })}
        >
          <SelectTrigger className="w-full">
            {selected ? (
              <span className="truncate">{selectedName}</span>
            ) : (
              <span className="text-muted-foreground">{t("widgetsHub.storage.chooseBucket")}</span>
            )}
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("widgetsHub.storage.noFolders")}
              </div>
            ) : (
              options.map((b) => (
                <SelectItem key={b.slug} value={b.slug}>
                  {b.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {selected ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("widgetsHub.storage.folder")}
          </label>
          <Select
            value={selectedFolder || ROOT_VALUE}
            onValueChange={(v) => onChange({ folder: v === ROOT_VALUE ? "" : v })}
          >
            <SelectTrigger className="w-full">
              <span className="truncate">{selectedFolderLabel}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT_VALUE}>
                {t("widgetsHub.storage.folderRoot")}
              </SelectItem>
              {folderPaths.map((f) => (
                <SelectItem key={f.path} value={f.path}>
                  {f.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}

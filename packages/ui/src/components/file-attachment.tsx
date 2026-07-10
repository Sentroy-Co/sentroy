"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

// react-file-icon SSR desteklemiyor — dynamic import
const FileIconComponent = dynamic(
  () =>
    import("react-file-icon").then((mod) => {
      const { FileIcon, defaultStyles } = mod
      // Wrapper: extension prop'unu alip FileIcon'a style ile gecirir
      function FileIconWrapper({ extension }: { extension: string }) {
        const ext = extension.toLowerCase()
        const style = (defaultStyles as Record<string, object>)[ext] || {}
        return <FileIcon extension={ext} {...style} />
      }
      return FileIconWrapper
    }),
  { ssr: false, loading: () => <div className="size-10 rounded bg-muted" /> },
)

// ── Helpers ─────────────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".")
  if (dot < 0) return ""
  return filename.slice(dot + 1).toLowerCase()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface AttachmentFile {
  partId: string
  filename: string
  contentType: string
  size: number
}

interface AttachmentListProps {
  attachments: AttachmentFile[]
  /** Tek dosya indirme — partId ile cagirilir */
  onDownload?: (partId: string, filename: string) => void
  /** Onizleme (lightbox) — verilirse kart tiklamasi preview acar; download
   *  ikonu sag tarafta kalir (kullanici ayri indirebilir). Geriye uyumlu:
   *  onPreview yoksa kart tiklamasi onDownload calistirir. */
  onPreview?: (partId: string, filename: string) => void
  /** Toplu indirme (birden fazla dosya varsa gosterilir) */
  onDownloadAll?: () => void
  className?: string
}

// ── Component ───────────────────────────────────────────────────────────────

export function AttachmentList({
  attachments,
  onDownload,
  onPreview,
  onDownloadAll,
  className,
}: AttachmentListProps) {
  const t = useTranslations("inbox")

  const totalSize = useMemo(
    () => attachments.reduce((sum, a) => sum + a.size, 0),
    [attachments],
  )

  if (attachments.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("attachments")} ({attachments.length})
        </span>
        {attachments.length > 1 && onDownloadAll && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={onDownloadAll}
          >
            <HugeiconsIcon
              icon={Download01Icon}
              strokeWidth={2}
              className="size-3"
            />
            {t("downloadAll")} ({formatSize(totalSize)})
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {attachments.map((att) => (
          <AttachmentCard
            key={att.partId}
            attachment={att}
            onDownload={onDownload}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  )
}

function AttachmentCard({
  attachment,
  onDownload,
  onPreview,
}: {
  attachment: AttachmentFile
  onDownload?: (partId: string, filename: string) => void
  onPreview?: (partId: string, filename: string) => void
}) {
  const ext = getExtension(attachment.filename)
  // Primary action: preview > download. Hiçbiri yoksa kart disabled.
  const primaryHandler = onPreview ?? onDownload
  const interactive = Boolean(primaryHandler)

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-lg border bg-card p-2.5 text-left transition-colors",
        interactive && "hover:bg-muted/50",
      )}
    >
      {/* Tüm kartı tıklanır yapan invisible button — overlap olmasın diye
          download ikonu üstüne stopPropagation'la binilen ayrı button. */}
      <button
        type="button"
        onClick={() =>
          primaryHandler?.(attachment.partId, attachment.filename)
        }
        disabled={!primaryHandler}
        aria-label={onPreview ? "Preview" : "Download"}
        className={cn(
          "absolute inset-0 rounded-lg",
          interactive && "cursor-pointer",
        )}
      />

      <div className="pointer-events-none flex size-10 shrink-0 items-center justify-center">
        <FileIconComponent extension={ext || "file"} />
      </div>
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {attachment.filename}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {ext.toUpperCase() || attachment.contentType} · {formatSize(attachment.size)}
        </span>
      </div>

      {/* Download icon — onPreview varsa ayrı download fonksiyonu olarak
          görünür; yoksa primary action'la birlikte. */}
      {onPreview && onDownload && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDownload(attachment.partId, attachment.filename)
          }}
          aria-label="Download"
          className="relative z-10 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
        >
          <HugeiconsIcon
            icon={Download01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </button>
      )}
      {!onPreview && onDownload && (
        <HugeiconsIcon
          icon={Download01Icon}
          strokeWidth={2}
          className="pointer-events-none size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </div>
  )
}

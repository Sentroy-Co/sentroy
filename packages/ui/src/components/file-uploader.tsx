"use client"

import * as React from "react"
import { FileIcon, defaultStyles } from "react-file-icon"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CloudUploadIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Alert01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"

// ── Types ────────────────────────────────────────────────────────────────────

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled"

export interface UploadEntry {
  id: string
  file: File
  progress: number
  status: UploadStatus
  error?: string
  controller?: AbortController
}

export type UploadRejectReason = "size" | "type"

export interface UploadRejectedFile {
  file: File
  reason: UploadRejectReason
  /** Insan-okur açıklama, doğrudan toast metnine konabilir. */
  message: string
}

export interface FileUploaderProps {
  /**
   * Tek bir dosyayı yükleyen async fn — XHR/fetch parent'ın işi. UI buraya
   * `onProgress` ve `signal` verir, sonucu Promise döner. Hata throw edersen
   * status="error" olur ve mesaj UI'da görünür.
   */
  upload: (
    file: File,
    onProgress: (ratio: number) => void,
    signal: AbortSignal,
  ) => Promise<unknown>
  /** Tek bir dosya başarılı olunca tetiklenir — listeyi refresh için. */
  onSuccess?: (file: File, result: unknown) => void
  /** Tüm dosyalar işlendiğinde (success + error karışık) tetiklenir. */
  onComplete?: () => void
  /** Multiple dosya seçimi. Default true. */
  multiple?: boolean
  /** Aynı anda max paralel upload. Default 3. */
  concurrency?: number
  /** Accept attribute (örn `image/*` veya `.pdf,.zip`). */
  accept?: string
  /** Max byte per file — aşılırsa enqueue edilmeden reddedilir. */
  maxSize?: number
  /**
   * Bir veya birden fazla dosya `maxSize` (veya gelecekteki başka pre-check
   * kuralları) yüzünden enqueue edilmeden reddedildiğinde tetiklenir.
   * Parent burada `toast.error(...)` gibi kullanıcıyı uyaran bir aksiyon
   * alır. Tek argüman: reddedilen dosyaların listesi.
   *
   * `onReject` verilmezse, geriye uyumlu davranış olarak büyük dosyalar
   * yine listede `status="error"` olarak görünür (eski davranış). Verirse
   * dosyalar hiç listeye eklenmez — kullanıcı sadece toast görür ve dosya
   * seçim akışı temiz kalır.
   */
  onReject?: (files: UploadRejectedFile[]) => void
  /**
   * Yükleme öncesi her dosya için çağrılan async hook. Caller dosyayı
   * dönüştürebilir (örn. image crop dialog'undan cropped File döndürür)
   * veya `null` döndürerek o dosyayı tamamen skip edebilir.
   *
   * Verilmezse dosyalar olduğu gibi enqueue edilir.
   *
   * Akış: kullanıcı dosya seçti → maxSize check → preprocess (varsa) →
   * sonuç null değilse queue'ya eklenir, null ise sessizce drop edilir
   * (UI'da görünmez — preprocess UX'i kendi cancel mesajını gösterir).
   */
  preprocess?: (file: File) => Promise<File | null>
  /**
   * Imperative handle — parent, uploader'ın kendi drop-zone'u dışından
   * (örn. sayfa-geneli sürükle-bırak) dosya enjekte edebilsin diye. Aynı
   * enqueue akışını (maxSize + preprocess + queue + progress) kullanır.
   */
  apiRef?: React.Ref<FileUploaderHandle>
  /**
   * Mount/değişimde otomatik enqueue edilecek dosyalar — sayfa-geneli
   * sürükle-bırak için. Popover içindeki FileUploader kapalıyken unmount
   * olduğundan `apiRef` ilk drop'ta null olabiliyordu; bu prop, popover
   * açıldığında (uploader mount olunca) dosyaları güvenle kuyruğa alır.
   * Enqueue sonrası `onPendingConsumed` çağrılır → parent listeyi temizler.
   */
  pendingFiles?: File[]
  onPendingConsumed?: () => void
}

/** `apiRef` üzerinden dışarıya açılan imperative API. */
export interface FileUploaderHandle {
  addFiles: (files: FileList | File[]) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".")
  if (idx === -1) return ""
  return name.slice(idx + 1).toLowerCase()
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Circular progress ────────────────────────────────────────────────────────

interface CircularProgressProps {
  ratio: number // 0..1
  size?: number
  strokeWidth?: number
  status: UploadStatus
  children?: React.ReactNode
}

function CircularProgress({
  ratio,
  size = 56,
  strokeWidth = 3,
  status,
  children,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(1, ratio)))

  // Uploading başlangıcında ratio çok küçük (XHR onprogress henüz event
  // yollamadı) → ring neredeyse boş ve ölü görünüyor. Indeterminate mod:
  // ratio < 5% iken çeyrek ring çiz + svg'yi spin et.
  const isIndeterminate = status === "uploading" && ratio < 0.05
  const indeterminateOffset = circumference * 0.75 // çeyrek dolu

  const ringClass =
    status === "done"
      ? "stroke-emerald-500"
      : status === "error"
      ? "stroke-red-500"
      : status === "cancelled"
      ? "stroke-zinc-400"
      : "stroke-primary"

  // Glow efekti: aktif yükleme sırasında soft drop-shadow.
  const glowClass =
    status === "uploading"
      ? "drop-shadow-[0_0_8px_hsl(var(--primary)/0.55)]"
      : status === "done"
      ? "drop-shadow-[0_0_8px_rgba(16,185,129,0.55)]"
      : status === "error"
      ? "drop-shadow-[0_0_8px_rgba(239,68,68,0.55)]"
      : ""

  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center", glowClass)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className={cn(
          isIndeterminate ? "animate-spin" : "-rotate-90",
        )}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={isIndeterminate ? indeterminateOffset : offset}
          className={cn(
            !isIndeterminate && "transition-all duration-300",
            ringClass,
          )}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

// ── Main uploader (controlled list, presentational) ─────────────────────────

export function FileUploader({
  upload,
  onSuccess,
  onComplete,
  multiple = true,
  concurrency = 3,
  accept,
  maxSize,
  onReject,
  preprocess,
  apiRef,
  pendingFiles,
  onPendingConsumed,
}: FileUploaderProps) {
  const [entries, setEntries] = React.useState<UploadEntry[]>([])
  const [dragActive, setDragActive] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  // Pool yönetimi state'ten bağımsız ref'lerle — setEntries scheduling
  // batch'ı pool kararlarını geciktirmesin.
  const activeRef = React.useRef(0)
  // Queue'da entry'nin kendisi tutuluyor (id değil) — startNext state read
  // yapmadan direkt çalışır, race olmaz.
  const queueRef = React.useRef<UploadEntry[]>([])

  const updateEntry = React.useCallback(
    (id: string, patch: Partial<UploadEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      )
    },
    [],
  )

  const runOne = React.useCallback(
    async (entry: UploadEntry) => {
      const controller = new AbortController()
      updateEntry(entry.id, { status: "uploading", controller })
      try {
        const result = await upload(
          entry.file,
          (ratio) => updateEntry(entry.id, { progress: ratio }),
          controller.signal,
        )
        updateEntry(entry.id, { status: "done", progress: 1 })
        onSuccess?.(entry.file, result)
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          updateEntry(entry.id, { status: "cancelled" })
        } else {
          updateEntry(entry.id, {
            status: "error",
            error: (err as Error).message || "Upload failed",
          })
        }
      } finally {
        activeRef.current--
        kickWorker()
        if (activeRef.current === 0 && queueRef.current.length === 0) {
          onComplete?.()
        }
      }
    },
    // kickWorker forward declaration → fonksiyon hoist edilmediği için
    // useCallback zinciri yerine plain ref ile çağrılıyor (aşağıda).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upload, updateEntry, onSuccess, onComplete],
  )

  const kickWorker = React.useCallback(() => {
    while (activeRef.current < concurrency && queueRef.current.length > 0) {
      const entry = queueRef.current.shift()!
      activeRef.current++
      // Fire-and-forget; runOne kendi finally'sinde recursive kickWorker çağırır.
      void runOne(entry)
    }
  }, [concurrency, runOne])

  const enqueueFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return

      // Pre-check: çok büyük dosyalar enqueue edilmeden filtrelenir.
      const rejected: UploadRejectedFile[] = []
      const accepted: File[] = []
      for (const file of list) {
        if (maxSize && file.size > maxSize) {
          rejected.push({
            file,
            reason: "size",
            message: `${file.name} is too large (max ${formatBytes(maxSize)})`,
          })
        } else {
          accepted.push(file)
        }
      }

      if (rejected.length > 0 && onReject) {
        onReject(rejected)
      }

      // preprocess hook (varsa): dosyayı transform et veya null ile skip.
      // Sequential await — kullanıcı her dosya için crop dialog görsün
      // (modal hierarchy karışmasın). preprocess uzun sürerse UX OK,
      // çünkü kullanıcı zaten interactive.
      let processed: File[] = accepted
      if (preprocess) {
        processed = []
        for (const file of accepted) {
          const out = await preprocess(file)
          if (out) processed.push(out)
        }
      }

      const newEntries: UploadEntry[] = []
      if (onReject) {
        for (const file of processed) {
          newEntries.push({ id: nextId(), file, progress: 0, status: "queued" })
        }
      } else {
        // Eski davranış — büyük dosyalar da listede error olarak görünür
        // (preprocess akışında çalışmıyor; preprocess + onReject birlikte
        // doğru pattern).
        for (const file of list) {
          const id = nextId()
          if (maxSize && file.size > maxSize) {
            newEntries.push({
              id,
              file,
              progress: 0,
              status: "error",
              error: `File too large (max ${formatBytes(maxSize)})`,
            })
          } else if (processed.includes(file)) {
            newEntries.push({ id, file, progress: 0, status: "queued" })
          }
        }
      }

      if (newEntries.length === 0) return
      setEntries((prev) => [...prev, ...newEntries])
      for (const e of newEntries) {
        if (e.status === "queued") queueRef.current.push(e)
      }
      kickWorker()
    },
    [maxSize, onReject, preprocess, kickWorker],
  )

  // Dışarıdan dosya enjeksiyonu (sayfa-geneli sürükle-bırak) — aynı enqueue akışı.
  React.useImperativeHandle(
    apiRef,
    () => ({ addFiles: (files: FileList | File[]) => void enqueueFiles(files) }),
    [enqueueFiles],
  )

  // pendingFiles (sayfa-geneli drop) — mount/değişimde enqueue et, sonra
  // parent'a tüketildiğini bildir (tekrar enqueue olmasın).
  React.useEffect(() => {
    if (pendingFiles && pendingFiles.length > 0) {
      void enqueueFiles(pendingFiles)
      onPendingConsumed?.()
    }
    // enqueueFiles/onPendingConsumed stabil; yalnız pendingFiles değişince çalış.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles])

  const cancel = React.useCallback(
    (id: string) => {
      // Queue'dan çıkar (henüz başlamamış), aktifse abort et.
      queueRef.current = queueRef.current.filter((e) => e.id !== id)
      setEntries((prev) => {
        const e = prev.find((x) => x.id === id)
        if (e?.status === "uploading") e.controller?.abort()
        return prev.map((x) =>
          x.id === id ? { ...x, status: "cancelled" } : x,
        )
      })
    },
    [],
  )

  const remove = React.useCallback(
    (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id))
    },
    [],
  )

  const clearDone = React.useCallback(() => {
    setEntries((prev) =>
      prev.filter(
        (e) => e.status !== "done" && e.status !== "cancelled",
      ),
    )
  }, [])

  // ── Drag handlers ───────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!dragActive) setDragActive(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.length) {
      void enqueueFiles(e.dataTransfer.files)
    }
  }

  const summary = React.useMemo(() => {
    const total = entries.length
    const done = entries.filter((e) => e.status === "done").length
    const failed = entries.filter((e) => e.status === "error").length
    const active = entries.filter((e) => e.status === "uploading").length
    return { total, done, failed, active }
  }, [entries])

  return (
    <div className="flex flex-col gap-3">
      {/* ── Drop zone ───────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-all",
          "outline-none focus-visible:ring-2 focus-visible:ring-primary",
          dragActive
            ? "border-primary bg-primary/5 shadow-[0_0_24px_hsl(var(--primary)/0.25)]"
            : "border-border bg-muted/20 hover:border-primary/50 hover:bg-primary/5",
        )}
      >
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform",
            dragActive && "scale-110",
          )}
        >
          <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.8} className="size-6" />
        </div>
        <div className="flex flex-col items-center gap-0.5 text-center">
          <span className="text-sm font-medium">
            {dragActive ? "Drop to upload" : "Drag & drop files here"}
          </span>
          <span className="text-xs text-muted-foreground">
            or click to browse
            {accept ? ` · ${accept}` : ""}
            {maxSize ? ` · max ${formatBytes(maxSize)}` : ""}
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void enqueueFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </button>

      {/* ── Upload list ─────────────────────────────────────────── */}
      {entries.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {summary.done}/{summary.total} done
              {summary.active > 0 && ` · ${summary.active} uploading`}
              {summary.failed > 0 && ` · ${summary.failed} failed`}
            </span>
            {summary.active === 0 && entries.length > 0 && (
              <button
                type="button"
                onClick={clearDone}
                className="hover:text-foreground"
              >
                Clear finished
              </button>
            )}
          </div>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {entries.map((entry) => (
              <UploadRow
                key={entry.id}
                entry={entry}
                onCancel={() => cancel(entry.id)}
                onRemove={() => remove(entry.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Single upload row ───────────────────────────────────────────────────────

function UploadRow({
  entry,
  onCancel,
  onRemove,
}: {
  entry: UploadEntry
  onCancel: () => void
  onRemove: () => void
}) {
  const ext = getExtension(entry.file.name)
  const iconStyle = (defaultStyles as Record<string, unknown>)[ext] ?? {}
  const isFinal =
    entry.status === "done" || entry.status === "error" || entry.status === "cancelled"

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-2.5 transition-colors",
        entry.status === "error" && "border-red-500/30 bg-red-500/5",
        entry.status === "done" && "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <CircularProgress ratio={entry.progress} status={entry.status}>
        <div className="flex size-8 items-center justify-center">
          {entry.status === "done" ? (
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              className="size-5 text-emerald-500"
            />
          ) : entry.status === "error" ? (
            <HugeiconsIcon
              icon={Alert01Icon}
              strokeWidth={2}
              className="size-5 text-red-500"
            />
          ) : entry.status === "cancelled" ? (
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-5 text-zinc-400"
            />
          ) : entry.status === "queued" ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="size-4 text-muted-foreground"
            />
          ) : (
            <FileIcon
              extension={ext || "file"}
              {...iconStyle}
              labelUppercase
            />
          )}
        </div>
      </CircularProgress>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{entry.file.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatBytes(entry.file.size)}
          {entry.status === "uploading" &&
            ` · ${Math.round(entry.progress * 100)}%`}
          {entry.error && ` · ${entry.error}`}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={isFinal ? onRemove : onCancel}
        aria-label={isFinal ? "Remove" : "Cancel"}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
      </Button>
    </div>
  )
}

// ── Popover wrapper ─────────────────────────────────────────────────────────

export interface FileUploaderPopoverProps extends FileUploaderProps {
  children: React.ReactNode
  /** Popover side. */
  side?: "top" | "right" | "bottom" | "left"
  /** Popover align. */
  align?: "start" | "center" | "end"
  /** Default open state for controlled usage. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Optional slot rendered above the uploader inside the popover.
   * Caller uses this for upload-time options (e.g. a "compress
   * video" switch) so the user picks the variant *before* dropping
   * files — once a file lands in the queue the option set is locked
   * for that batch.
   */
  headerSlot?: React.ReactNode
}

export function FileUploaderPopover({
  children,
  side = "bottom",
  align = "end",
  open,
  onOpenChange,
  headerSlot,
  ...uploaderProps
}: FileUploaderPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={children as React.ReactElement} />
      <PopoverContent side={side} align={align} className="w-[420px] p-4">
        {headerSlot ? <div className="mb-3">{headerSlot}</div> : null}
        <FileUploader {...uploaderProps} />
      </PopoverContent>
    </Popover>
  )
}

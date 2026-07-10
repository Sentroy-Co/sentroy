"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Download01Icon,
  Delete02Icon,
  Edit02Icon,
  PlayIcon,
  PauseIcon,
  RecordIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useDjStore } from "@/lib/dj-store"
import { useLocalRecordings } from "@/lib/local-recordings"
import { confirm } from "@workspace/console/stores/confirm"
// Merkezi media URL resolver — lokal dosyalar objectURL, cloud CDN URL.
import { mediaUrl } from "@/lib/media-url"

export function RecordingsSheet({
  open,
  onOpenChange,
  companySlug,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  companySlug: string
}) {
  const recordings = useDjStore((s) => s.tree.recordings)
  const removeRecording = useDjStore((s) => s.removeRecording)
  const renameRecording = useDjStore((s) => s.renameRecording)
  const appendRecording = useDjStore((s) => s.appendRecording)
  const localItems = useLocalRecordings((s) => s.items)
  const removeLocal = useLocalRecordings((s) => s.remove)
  const setUploadPct = useLocalRecordings((s) => s.setUploadPct)

  const [playingId, setPlayingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)

  const handlePlay = useCallback(
    (id: string, url: string) => {
      if (audioEl) {
        audioEl.pause()
        audioEl.remove()
        setAudioEl(null)
      }
      if (playingId === id) {
        setPlayingId(null)
        return
      }
      const a = new Audio(url)
      a.play().catch((err) => toast.error(err.message))
      a.onended = () => setPlayingId(null)
      setAudioEl(a)
      setPlayingId(id)
    },
    [audioEl, playingId],
  )

  const handleDownload = useCallback((url: string, label: string) => {
    const a = document.createElement("a")
    a.href = url
    a.download = label
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [])

  // Lokal kaydı buluta yükle — XHR progress'li single POST (≤100 MB). Başarıda
  // cloud recording'e taşı + local'den düş. (Chunked/resumable = ileride.)
  const handleUpload = useCallback(
    (local: (typeof localItems)[number]) => {
      setUploadPct(local.id, 0)
      const form = new FormData()
      form.append(
        "file",
        new File([local.blob], local.label, { type: local.mimeType }),
      )
      form.append("folder", "recordings")
      const xhr = new XMLHttpRequest()
      xhr.open("POST", `/api/companies/${companySlug}/studio/assets`, true)
      xhr.withCredentials = true
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setUploadPct(local.id, Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText) as {
              data: { mediaId: string; originalName: string }
            }
            appendRecording({
              mediaId: json.data.mediaId,
              label: json.data.originalName,
              durationSec: local.durationSec,
              format: local.extension === "mp4" ? "wav" : "mp3",
              sampleRate: 48000,
              recordedAt: local.recordedAt,
            })
            removeLocal(local.id)
            toast.success("Uploaded to cloud")
          } catch {
            setUploadPct(local.id, null)
            toast.error("Upload response invalid")
          }
        } else {
          setUploadPct(local.id, null)
          toast.error(
            xhr.status === 413
              ? "Too large to upload (max ~100 MB). Download it instead."
              : `Upload failed (HTTP ${xhr.status})`,
          )
        }
      }
      xhr.onerror = () => {
        setUploadPct(local.id, null)
        toast.error("Network error during upload")
      }
      xhr.send(form)
    },
    [companySlug, appendRecording, removeLocal, setUploadPct, localItems],
  )

  const handleDelete = useCallback(
    async (id: string, mediaId: string, label: string) => {
      const ok = await confirm({
        title: `Delete "${label}"?`,
        description: "Both the project reference and the CDN file will be deleted. Cannot be undone.",
        confirmText: "Delete",
        destructive: true,
      })
      if (!ok) return
      // CDN + DB delete via studio/assets DELETE
      try {
        await fetch(
          `/api/companies/${companySlug}/studio/assets/${mediaId}`,
          { method: "DELETE", credentials: "include" },
        )
      } catch {
        /* ignore — sadece referans temizliği yap */
      }
      removeRecording(id)
      if (playingId === id) {
        audioEl?.pause()
        setAudioEl(null)
        setPlayingId(null)
      }
      toast.success("Recording deleted")
    },
    [companySlug, removeRecording, playingId, audioEl],
  )

  const startRename = (id: string, current: string) => {
    setRenamingId(id)
    setRenameValue(current)
  }
  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameRecording(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={RecordIcon} size={16} />
            Recorded sets
          </DialogTitle>
          <DialogDescription>
            Your past live recordings — preview, download, rename, delete.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[26rem] space-y-3 overflow-y-auto">
          {/* LOCAL — kaydedilmiş ama buluta yüklenmemiş set'ler */}
          {localItems.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                  Local
                </span>
                <span className="tracking-normal text-neutral-500">
                  Not uploaded — download or upload to cloud
                </span>
              </div>
              <ul className="divide-y divide-neutral-800 rounded-md border border-amber-500/25">
                {localItems.map((r) => {
                  const isPlaying = playingId === r.id
                  const uploading = r.uploadPct !== null
                  return (
                    <li key={r.id} className="flex items-center gap-2 p-3 text-sm">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handlePlay(r.id, r.url)}
                        title={isPlaying ? "Stop" : "Preview"}
                        className={cn(
                          "shrink-0",
                          isPlaying ? "text-emerald-400" : "text-neutral-400",
                        )}
                      >
                        <HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} size={14} />
                      </Button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-neutral-100">{r.label}</div>
                        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-neutral-500">
                          <span>{fmtTime(r.durationSec)}</span>
                          <span className="font-mono uppercase">{r.extension}</span>
                          <span className="rounded bg-amber-500/15 px-1 text-amber-300">
                            local
                          </span>
                        </div>
                        {uploading && (
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-800">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-[width]"
                              style={{ width: `${r.uploadPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDownload(r.url, r.label)}
                        title="Download to device"
                        className="text-neutral-400 hover:text-neutral-100"
                      >
                        <HugeiconsIcon icon={Download01Icon} size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleUpload(r)}
                        disabled={uploading}
                        title="Upload to cloud"
                        className="text-neutral-400 hover:text-emerald-300 disabled:opacity-50"
                      >
                        {uploading ? (
                          <span className="font-mono text-[10px] tabular-nums">
                            {r.uploadPct}%
                          </span>
                        ) : (
                          <HugeiconsIcon icon={Upload04Icon} size={14} />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          if (playingId === r.id) {
                            audioEl?.pause()
                            setAudioEl(null)
                            setPlayingId(null)
                          }
                          removeLocal(r.id)
                        }}
                        disabled={uploading}
                        title="Discard local recording"
                        className="text-neutral-400 hover:text-red-400 disabled:opacity-50"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={14} />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {recordings.length === 0 && localItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
              No recordings yet. Use the <strong>REC</strong> button in the
              header to capture master output.
            </div>
          ) : recordings.length > 0 ? (
            <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800">
            {recordings.map((r) => {
              const isPlaying = playingId === r.id
              return (
                <li key={r.id} className="flex items-center gap-2 p-3 text-sm">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handlePlay(r.id, mediaUrl(r.mediaId))}
                    title={isPlaying ? "Stop" : "Preview"}
                    className={cn(
                      "shrink-0",
                      isPlaying ? "text-emerald-400" : "text-neutral-400",
                    )}
                  >
                    <HugeiconsIcon
                      icon={isPlaying ? PauseIcon : PlayIcon}
                      size={14}
                    />
                  </Button>
                  <div className="min-w-0 flex-1">
                    {renamingId === r.id ? (
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename()
                          if (e.key === "Escape") setRenamingId(null)
                        }}
                        autoFocus
                        className="h-7 text-sm"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(r.id, r.label)}
                        className="block truncate text-left text-neutral-100 hover:text-neutral-300"
                        title="Rename"
                      >
                        {r.label}
                      </button>
                    )}
                    <div className="mt-0.5 flex items-center gap-3 text-[10px] text-neutral-500">
                      <span>{fmtTime(r.durationSec)}</span>
                      <span className="font-mono uppercase">{r.format}</span>
                      <span>{new Date(r.recordedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDownload(mediaUrl(r.mediaId), r.label)}
                    title="Download"
                    className="text-neutral-400 hover:text-neutral-100"
                  >
                    <HugeiconsIcon icon={Download01Icon} size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => startRename(r.id, r.label)}
                    title="Rename"
                    className="text-neutral-400 hover:text-neutral-100"
                  >
                    <HugeiconsIcon icon={Edit02Icon} size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(r.id, r.mediaId, r.label)}
                    title="Delete"
                    className="text-neutral-400 hover:text-red-400"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} />
                  </Button>
                </li>
              )
            })}
            </ul>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

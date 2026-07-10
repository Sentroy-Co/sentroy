"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { RecordIcon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useDjStore } from "@/lib/dj-store"
import { useLocalRecordings } from "@/lib/local-recordings"
import {
  isRecording,
  startRecording,
  stopRecording,
} from "@/lib/audio-engine"

/**
 * Recording controls — header'da REC button + live duration display.
 *
 * Flow:
 *   1. REC tıkla → MediaRecorder başlar, isRecording=true
 *   2. Live duration ticker (her saniye update)
 *   3. STOP tıkla → blob alınır → /studio/assets (folder=recordings) upload
 *      → tree.recordings'e append
 */
export function RecordingControls({
  onOpenRecordings,
}: {
  /** Kept for API stability; upload artık Recordings sheet'inde. */
  companySlug?: string
  onOpenRecordings(): void
}) {
  const addLocal = useLocalRecordings((s) => s.add)
  const cloudCount = useDjStore((s) => s.tree.recordings.length)
  const localCount = useLocalRecordings((s) => s.items.length)
  const recordingsCount = cloudCount + localCount

  const [active, setActive] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)

  // Live duration ticker
  useEffect(() => {
    if (!active || !startedAt) return
    const id = setInterval(() => {
      setDuration((Date.now() - startedAt) / 1000)
    }, 250)
    return () => clearInterval(id)
  }, [active, startedAt])

  // Sync with engine state on mount (rare: page reload mid-record)
  useEffect(() => {
    setActive(isRecording())
  }, [])

  const handleStart = useCallback(async () => {
    try {
      await startRecording()
      setActive(true)
      setStartedAt(Date.now())
      setDuration(0)
      toast.info("Recording started")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recording failed")
    }
  }, [])

  const handleStop = useCallback(async () => {
    try {
      const result = await stopRecording()
      setActive(false)
      // Süreyi wall-clock'tan hesapla — arka plan sekmede setInterval throttle
      // olunca `duration` state'i geride kalıyordu (yanlış metadata).
      const finalDuration = startedAt ? (Date.now() - startedAt) / 1000 : duration
      setStartedAt(null)
      setDuration(0)
      if (!result) {
        toast.error("Recording output is empty")
        return
      }
      // LOKAL kaydet — anında upload YOK (uzun set 413 riski + veri kaybı yok).
      // Kullanıcı Recordings'ten indirir ya da isterse buluta yükler.
      const stamp = new Date().toISOString().slice(0, 19).replace("T", " ")
      addLocal({
        blob: result.blob,
        label: `Studio set ${stamp}.${result.extension}`,
        durationSec: finalDuration,
        mimeType: result.mimeType,
        extension: result.extension,
        recordedAt: new Date().toISOString(),
      })
      toast.success(
        `Set saved locally (${fmtTime(finalDuration)}) — open Recordings to download or upload`,
      )
      onOpenRecordings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recording failed")
    }
  }, [duration, startedAt, addLocal, onOpenRecordings])

  return (
    <div className="flex items-center gap-2">
      {/* REC / STOP button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={active ? handleStop : handleStart}
        className={cn(
          "gap-2 transition",
          active
            ? "bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:text-red-300"
            : "text-neutral-400 hover:text-neutral-100",
        )}
        title={active ? "Stop recording" : "Start recording master output"}
      >
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            active ? "bg-red-500 animate-pulse" : "bg-neutral-600",
          )}
        />
        {active ? `REC ${fmtTime(duration)}` : "REC"}
      </Button>

      {/* Recordings drawer trigger */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenRecordings}
        className="gap-1.5 text-neutral-400 hover:text-neutral-100"
        title="Recorded sets"
      >
        <HugeiconsIcon icon={RecordIcon} size={14} />
        <span className="text-xs">{recordingsCount}</span>
      </Button>
    </div>
  )
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}


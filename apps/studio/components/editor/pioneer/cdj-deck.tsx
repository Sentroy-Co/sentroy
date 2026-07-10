"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import WaveSurfer from "wavesurfer.js"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DiscIcon,
  PauseIcon,
  PlayIcon,
  Cancel01Icon,
  Upload04Icon,
  PulseIcon,
  MenuSquareIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { LIBRARY_DRAG_MIME } from "../library-sidebar"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import {
  useDjStore,
  type DeckId,
  HOTCUE_COLORS,
  HOTCUE_COUNT,
  DECK_ACCENTS,
  getDeckIdsFromLayout,
} from "@/lib/dj-store"
import {
  assignDeckToMixerEngine,
  ensureAudioContextStarted,
  ejectDeck as engineEject,
  extractDeckBufferSlice,
  getDeckPosition,
  loadDeck as engineLoad,
  pauseDeck as enginePause,
  playDeck as enginePlay,
  seekDeck as engineSeek,
  setDeckLoop,
  setDeckPitch,
  setScratchActive as engineSetScratchActive,
  setScratchRate as engineSetScratch,
  jumpDeckTo,
} from "@/lib/audio-engine"
import { audioBufferToWavBlob } from "@/lib/audio-encoders"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  analyzeAudio,
  generateBeats,
  persistAnalysis,
} from "@/lib/bpm-analyze"
import { mediaUrl } from "@/lib/media-url"
import {
  executeAutoMix,
  getAutoMixState,
  isDeckSlipMode,
  nudgeBeatGrid,
  setDeckSlipMode,
  syncDeckAuto,
  syncDeckBpm,
  tapTempo,
  unsyncDeck,
} from "@/lib/dj-actions"
import { VerticalFader } from "./vertical-fader"

/**
 * Pioneer CDJ-3000 inspired deck.
 *
 * Layout (top→bottom):
 *   - Track info row: title (truncate) + BPM badge + time (current/duration)
 *   - Waveform (full width, ~80px tall) — beat grid + hotcue markers + loop region
 *   - Jog wheel (large, 180-220px) — center stage; pitch fader on RIGHT side
 *   - PLAY/CUE transport below jog (left); SYNC button right
 *   - Hotcue 2×4 pad grid + Loop quick row
 *
 * EQ/Filter/FX deck'in DIŞINDA — DJMMixer'da channel strip'te (Pioneer setup).
 */

// Media URL çözümü merkezi resolver'dan (@/lib/media-url) — lokal (IndexedDB)
// dosyalar objectURL, sunucu dosyaları CDN URL döner; WaveSurfer ikisini de yer.

const BEAT_OPTIONS: { value: number; label: string }[] = [
  { value: 0.5, label: "½" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 4, label: "4" },
  { value: 8, label: "8" },
  { value: 16, label: "16" },
]

export function CDJDeck({
  deckId,
  companySlug,
  onOpenSamplePicker,
}: {
  deckId: DeckId
  companySlug: string
  onOpenSamplePicker(deck: DeckId, mode?: "load" | "queue"): void
}) {
  const deck = useDjStore((s) => s.tree.decks[deckId])
  const runtime = useDjStore((s) => s.transport[deckId])
  const setRuntime = useDjStore((s) => s.setRuntime)
  const loadDeckInStore = useDjStore((s) => s.loadDeck)
  const ejectFromStore = useDjStore((s) => s.ejectDeck)
  const advanceQueue = useDjStore((s) => s.advanceQueue)
  const patchTree = useDjStore((s) => s.patchTree)
  const setHotcue = useDjStore((s) => s.setHotcue)
  const clearHotcue = useDjStore((s) => s.clearHotcue)
  const setLoop = useDjStore((s) => s.setLoop)
  const toggleLoop = useDjStore((s) => s.toggleLoop)
  // Tüm aktif deck id'leri — "Send loop to deck" dropdown picker için.
  // Layout store reference'ı al + useMemo ile filter — useShallow selector
  // SSR getServerSnapshot loop'una sebep oluyordu (cdj-deck DeckMixerAssign
  // Chip ile aynı pattern). Store-direct selector reference eq → no-op
  // patch'lerde stable snapshot → loop yok.
  const layout = useDjStore((s) => s.tree.layout)
  const allDeckIds = useMemo(() => getDeckIdsFromLayout(layout), [layout])

  const waveContainerRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const rafRef = useRef<number | null>(null)
  const autoPlayNextRef = useRef(false)
  // Auto-mix tetikleme guard: aynı parça end-window'unda tekrar tekrar
  // executeAutoMix çağrılmasın diye flag. Yeni parça load olunca
  // (advanceQueue veya manuel) reset edilir.
  const autoMixTriggeredRef = useRef(false)
  const runtimeRef = useRef(runtime)
  useEffect(() => {
    runtimeRef.current = runtime
  }, [runtime])

  const [waveReady, setWaveReady] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingLoopIn, setPendingLoopIn] = useState<number | null>(null)

  const palette = DECK_ACCENTS[deckId]
  const accent = palette.hex
  const accentMuted = palette.bg

  // ─── Direct drag-drop upload ────────────────────────────────────────────
  const uploadAndLoad = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("audio/")) {
        toast.error("Only audio files accepted")
        return
      }
      setUploading(true)
      try {
        const form = new FormData()
        form.append("file", file)
        form.append("folder", "samples")
        const res = await fetch(
          `/api/companies/${companySlug}/studio/assets`,
          { method: "POST", credentials: "include", body: form },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as {
          data: { mediaId: string; originalName: string }
        }
        loadDeckInStore(deckId, {
          mediaId: json.data.mediaId,
          label: json.data.originalName,
          bpm: null,
        })
        toast.success(`Loaded to Deck ${deckId}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed")
      } finally {
        setUploading(false)
      }
    },
    [companySlug, deckId, loadDeckInStore],
  )

  // ─── WaveSurfer mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!waveContainerRef.current) return
    const ws = WaveSurfer.create({
      container: waveContainerRef.current,
      waveColor: palette.wave,
      progressColor: palette.progress,
      cursorColor: "transparent",
      height: 70,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: true,
    })
    wavesurferRef.current = ws
    ws.on("interaction", (newTime) => {
      engineSeek(deckId, newTime, runtimeRef.current.isPlaying)
      setRuntime(deckId, { position: newTime })
    })
    return () => {
      ws.destroy()
      wavesurferRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  // ─── Load on tree.deck.loadedMediaId change ────────────────────────────
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws) return
    if (!deck.loadedMediaId) {
      ws.empty()
      setWaveReady(false)
      return
    }
    const url = mediaUrl(deck.loadedMediaId)
    setWaveReady(false)
    setRuntime(deckId, { loading: true, error: null })
    Promise.all([
      engineLoad(deckId, {
        mediaId: deck.loadedMediaId,
        url,
        onLoaded: ({ duration }) => {
          setRuntime(deckId, {
            loaded: true,
            duration,
            loading: false,
            position: 0,
            error: null,
          })
          // Yeni parça → eski auto-mix flag temizle, yeni track end-window'unda
          // tekrar değerlendirilsin.
          autoMixTriggeredRef.current = false
          if (autoPlayNextRef.current) {
            autoPlayNextRef.current = false
            void ensureAudioContextStarted().then(() => {
              enginePlay(deckId, 0)
              setRuntime(deckId, { isPlaying: true })
            })
          }
        },
        onError: (err) =>
          setRuntime(deckId, {
            loaded: false,
            loading: false,
            error: err.message,
          }),
      }),
      ws.load(url).then(() => {
        setWaveReady(true)
        // Overview için downsample peaks store'a yansıt — multi-deck
        // mini timeline (Batch 4) bu data'yı SVG'de çizer.
        try {
          const peakChannels = ws.exportPeaks({ maxLength: 512 }) as number[][]
          const mono = peakChannels[0]
          if (mono && mono.length > 0) {
            setRuntime(deckId, { peaks: Array.from(mono) })
          }
        } catch {
          /* exportPeaks fail ederse overview boş kalır, kritik değil */
        }
      }),
    ]).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.loadedMediaId, deckId])

  // ─── Pitch sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    setDeckPitch(deckId, deck.pitch)
  }, [deck.pitch, deckId])

  // ─── Loop sync ──────────────────────────────────────────────────────────
  const currentLoop = deck.loops[0]
  useEffect(() => {
    if (!currentLoop) {
      setDeckLoop(deckId, null)
      return
    }
    setDeckLoop(deckId, {
      start: currentLoop.start,
      end: currentLoop.end,
      enabled: currentLoop.enabled,
    })
  }, [deckId, currentLoop?.start, currentLoop?.end, currentLoop?.enabled, currentLoop])

  // ─── BPM analyze on load (cache miss) ──────────────────────────────────
  useEffect(() => {
    if (!deck.loadedMediaId || deck.bpm !== null) return
    const mediaId = deck.loadedMediaId
    let cancelled = false
    ;(async () => {
      try {
        const result = await analyzeAudio(mediaUrl(mediaId))
        if (cancelled) return
        patchTree((tree) => ({
          ...tree,
          decks: {
            ...tree.decks,
            [deckId]: {
              ...tree.decks[deckId],
              bpm: result.bpm,
              beatgridOffset: 0,
            },
          },
        }))
        void persistAnalysis(companySlug, mediaId, result)
      } catch (err) {
        console.warn("[studio/bpm-analyze]", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [deck.loadedMediaId, deck.bpm, deckId, companySlug, patchTree])

  // ─── rAF position ticker ────────────────────────────────────────────────
  useEffect(() => {
    if (!runtime.isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    const tick = () => {
      const pos = getDeckPosition(deckId)
      setRuntime(deckId, { position: pos })
      const duration = runtimeRef.current.duration
      // Pre-end auto-mix trigger: autoMix.enabled iken parça bitmesine
      // `fadeSeconds` kala (varsayılan 16-20s), eğer bu deck crossfader'ın
      // aDeck VEYA bDeck atamasındaysa, diğer deck'e geçişi tetikle. Tek
      // sefer (autoMixTriggeredRef) — bir auto-mix bittikten sonra aynı
      // bitiş için tekrar deneme yok.
      if (duration > 0 && !autoMixTriggeredRef.current) {
        const stState = useDjStore.getState().tree
        const xf = stState.crossfader
        const am = xf.autoMix
        if (am.enabled && !getAutoMixState().active) {
          const onCrossfader = xf.aDeck === deckId || xf.bDeck === deckId
          if (onCrossfader) {
            const toDeck = xf.aDeck === deckId ? xf.bDeck : xf.aDeck
            const toDeckState = stState.decks[toDeck]
            const fadeSec = Math.max(2, am.fadeSeconds || 16)
            if (
              pos >= duration - fadeSec &&
              toDeckState?.loadedMediaId
            ) {
              autoMixTriggeredRef.current = true
              toast.info(
                `Auto-mix → Deck ${toDeck} (${fadeSec}s crossfade)`,
                { duration: 3500 },
              )
              void executeAutoMix({
                fromDeck: deckId,
                toDeck,
              })
            }
          }
        }
      }
      if (duration > 0 && pos >= duration - 0.05) {
        enginePause(deckId)
        setRuntime(deckId, { isPlaying: false, position: 0 })
        autoMixTriggeredRef.current = false // reset for next track
        // Queue auto-advance: çalan parça bitince queue'nun ilk item'ı
        // deck'e load olur (advanceQueue tree.loadedMediaId'yi değiştirir
        // → useEffect engineLoad'i tetikler → onLoaded'de autoPlayNextRef
        // ile otomatik play). Queue boşsa deck boş kalır.
        const nextItem = advanceQueue(deckId)
        if (nextItem) {
          autoPlayNextRef.current = true
          toast.success(`Deck ${deckId} → ${nextItem.label}`, {
            description: "Auto-advanced from queue",
            duration: 3500,
          })
        }
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [runtime.isPlaying, deckId, setRuntime, advanceQueue])

  // ─── Actions ────────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    if (!runtime.loaded) return
    await ensureAudioContextStarted()
    if (runtime.isPlaying) {
      const pos = enginePause(deckId)
      setRuntime(deckId, { isPlaying: false, position: pos })
    } else {
      enginePlay(deckId, runtime.position)
      setRuntime(deckId, { isPlaying: true })
    }
  }, [runtime.isPlaying, runtime.loaded, runtime.position, deckId, setRuntime])

  const handleCue = useCallback(() => {
    if (!runtime.loaded) return
    // CDJ cue: çalıyorsa cue position'a dön + pause; durmuş ise current'tan oynat
    if (runtime.isPlaying) {
      enginePause(deckId)
      const cuePos = deck.hotcues.find((h) => h.slot === 1)?.position ?? 0
      jumpDeckTo(deckId, cuePos, false)
      setRuntime(deckId, { isPlaying: false, position: cuePos })
    } else {
      void ensureAudioContextStarted().then(() => {
        enginePlay(deckId, runtime.position)
        setRuntime(deckId, { isPlaying: true })
      })
    }
  }, [runtime.isPlaying, runtime.loaded, runtime.position, deckId, deck.hotcues, setRuntime])

  const handleEject = useCallback(() => {
    engineEject(deckId)
    ejectFromStore(deckId)
    wavesurferRef.current?.empty()
    setWaveReady(false)
  }, [deckId, ejectFromStore])

  const handlePitchChange = useCallback(
    (val: number) => {
      patchTree((tree) => ({
        ...tree,
        decks: {
          ...tree.decks,
          [deckId]: { ...tree.decks[deckId], pitch: val },
        },
      }))
    },
    [deckId, patchTree],
  )

  // Hotcue pad
  const handlePadClick = useCallback(
    (slot: number, hasCue: boolean, shiftKey: boolean) => {
      if (!runtime.loaded) return
      if (hasCue) {
        if (shiftKey) {
          clearHotcue(deckId, slot)
        } else {
          const cue = deck.hotcues.find((h) => h.slot === slot)
          if (cue) {
            jumpDeckTo(deckId, cue.position, runtime.isPlaying)
            setRuntime(deckId, { position: cue.position })
            // Loop hotcue (CDJ-3000 saved-loop pad): pad'e basınca jump
            // + loop region aktive. Eski loop varsa override edilir.
            if (
              typeof cue.loopEnd === "number" &&
              cue.loopEnd > cue.position
            ) {
              setLoop(deckId, {
                start: cue.position,
                end: cue.loopEnd,
                enabled: true,
              })
            }
          }
        }
      } else {
        setHotcue(deckId, slot)
      }
    },
    [deckId, runtime.loaded, runtime.isPlaying, deck.hotcues, setHotcue, clearHotcue, setRuntime, setLoop],
  )

  // Loop in/out
  const handleLoopIn = () => setPendingLoopIn(runtime.position)
  const handleLoopOut = () => {
    if (pendingLoopIn === null) return
    const start = Math.min(pendingLoopIn, runtime.position)
    const end = Math.max(pendingLoopIn, runtime.position)
    if (end - start < 0.05) return
    setLoop(deckId, { start, end, enabled: true })
    setPendingLoopIn(null)
  }
  const handleLoopBeats = (beats: number) => {
    if (!deck.bpm || !runtime.loaded) return
    const effectiveBpm = deck.bpm * (1 + deck.pitch)
    const beatInterval = 60 / effectiveBpm
    const start = runtime.position
    const end = start + beats * beatInterval
    if (end > runtime.duration) return
    setLoop(deckId, { start, end, enabled: true })
  }
  const handleLoopToggle = () => toggleLoop(deckId)
  const handleLoopClear = () => {
    setLoop(deckId, null)
    setPendingLoopIn(null)
  }

  // ─── Loop → Pad save (CDJ-3000 saved-loop hotcue pattern) ──────────────
  const handleSaveLoopToPad = useCallback(() => {
    const loop = deck.loops[0]
    if (!loop) {
      toast.error("No active loop to save")
      return
    }
    const used = new Set(deck.hotcues.map((h) => h.slot))
    let target = 1
    while (used.has(target) && target <= HOTCUE_COUNT) target++
    if (target > HOTCUE_COUNT) {
      toast.error("All pads full — clear one first")
      return
    }
    const color = HOTCUE_COLORS[(target - 1) % HOTCUE_COLORS.length] ?? "#ec4899"
    patchTree((tree) => ({
      ...tree,
      decks: {
        ...tree.decks,
        [deckId]: {
          ...tree.decks[deckId],
          hotcues: [
            ...tree.decks[deckId].hotcues,
            {
              slot: target,
              position: loop.start,
              loopEnd: loop.end,
              color,
              label: `Loop ${(loop.end - loop.start).toFixed(2)}s`,
            },
          ],
        },
      },
    }))
    toast.success(
      `Loop saved → Pad ${target}`,
      { description: `${(loop.end - loop.start).toFixed(2)}s · tap to recall` },
    )
  }, [deck.loops, deck.hotcues, deckId, patchTree])

  // ─── Loop → Deck transfer (CDJ USB/Rekordbox parallel) ─────────────────
  //   Source deck'in player buffer'ından loop range'i çıkar → WAV blob →
  //   /api/assets POST (folder="loops") → mediaId → hedef deck'e load.
  //   Asset library'de kalıcı; tekrar kullanılabilir.
  const handleExportLoopToDeck = useCallback(
    async (target: DeckId) => {
      const loop = deck.loops[0]
      if (!loop) {
        toast.error("No active loop to send")
        return
      }
      if (target === deckId) return
      const buffer = extractDeckBufferSlice(deckId, loop.start, loop.end)
      if (!buffer) {
        toast.error("Couldn't extract loop buffer (deck not ready)")
        return
      }
      const baseLabel = (deck.loadedLabel ?? "Untitled").replace(/\.[^.]+$/, "")
      const label = `${baseLabel} · loop ${(loop.end - loop.start).toFixed(2)}s`
      const fileName = label
        .replace(/[^a-z0-9._-]/gi, "_")
        .replace(/_+/g, "_")
        .toLowerCase()
      const blob = audioBufferToWavBlob(buffer)
      const form = new FormData()
      form.append("file", new File([blob], `${fileName}.wav`, { type: "audio/wav" }))
      form.append("folder", "loops")
      const t = toast.loading(`Exporting loop → Deck ${target}…`)
      try {
        const res = await fetch(
          `/api/companies/${companySlug}/studio/assets`,
          { method: "POST", credentials: "include", body: form },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as {
          data: { mediaId: string; originalName: string }
        }
        loadDeckInStore(target, {
          mediaId: json.data.mediaId,
          label,
          bpm: deck.bpm,
        })
        toast.success(`Loop → Deck ${target}`, {
          id: t,
          description: `${(loop.end - loop.start).toFixed(2)}s · saved to "loops" folder`,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Loop export failed", {
          id: t,
        })
      }
    },
    [deck.loops, deck.loadedLabel, deck.bpm, deckId, companySlug, loadDeckInStore],
  )

  const playheadPct =
    runtime.duration > 0 ? (runtime.position / runtime.duration) * 100 : 0
  const effectiveBpm = deck.bpm ? deck.bpm * (1 + deck.pitch) : null

  const setFocusedDeck = useDjStore((s) => s.setFocusedDeck)
  const focusedDeck = useDjStore((s) => s.focusedDeck)
  const isFocused = focusedDeck === deckId

  return (
    <div
      onPointerDown={() => setFocusedDeck(deckId)}
      className="flex flex-1 flex-col gap-3 rounded-xl border bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 shadow-2xl"
      style={{
        borderColor: isFocused
          ? accent
          : `color-mix(in srgb, ${accent} 20%, #404040)`,
        boxShadow: isFocused
          ? `0 0 0 1px ${accent}40, 0 12px 24px rgba(0,0,0,0.5)`
          : undefined,
      }}
    >
      {/* ─── Track info ─── */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-xs font-bold text-white",
              accentMuted,
            )}
          >
            {deckId}
          </span>
          {/* Mixer assignment dropdown — birden çok mixer varsa görünür. */}
          <DeckMixerAssignChip deckId={deckId} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-100">
              {deck.loadedLabel ?? (
                <span className="text-neutral-500">— no track loaded —</span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-[10px] text-neutral-500">
              <span className="font-mono">
                {fmtTime(runtime.position)} / {fmtTime(runtime.duration)}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 font-bold text-white",
                  !effectiveBpm && "opacity-40",
                )}
                style={{ background: accent }}
                title={
                  effectiveBpm
                    ? `${effectiveBpm.toFixed(1)} BPM (pitch ${(deck.pitch * 100).toFixed(1)}%)`
                    : runtime.loading
                      ? "Analyzing BPM…"
                      : "BPM not detected"
                }
              >
                <HugeiconsIcon icon={PulseIcon} size={10} />
                {effectiveBpm ? effectiveBpm.toFixed(1) : "—"}
              </span>
              {/* TAP tempo — kullanıcı 4+ tıklayarak BPM girer (analiz
                  yoksa veya yanlışsa kurtarıcı) */}
              <button
                type="button"
                onClick={() => tapTempo(deckId)}
                disabled={!runtime.loaded}
                className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono text-[9px] font-bold text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30"
                title="Tap tempo — 4+ click to set BPM"
              >
                TAP
              </button>
              {/* Beat grid nudge ± — BPM analizi yanlış ise downbeat
                  hizalama */}
              {deck.bpm && (
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => nudgeBeatGrid(deckId, -0.01)}
                    className="rounded border border-neutral-800 px-1 py-0.5 font-mono text-[9px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                    title="Beat grid −10ms"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeBeatGrid(deckId, 0.01)}
                    className="rounded border border-neutral-800 px-1 py-0.5 font-mono text-[9px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                    title="Beat grid +10ms"
                  >
                    →
                  </button>
                </span>
              )}
              {deck.sync && (
                <span className="text-emerald-400">● SYNC</span>
              )}
              {runtime.loading && (
                <span className="text-neutral-400">analyzing…</span>
              )}
              {runtime.error && (
                <span className="text-red-400">{runtime.error}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Queue popover toggle */}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-neutral-500 hover:text-neutral-100"
                  title="Queue"
                />
              }
            >
              <div className="relative">
                <HugeiconsIcon icon={MenuSquareIcon} size={14} />
                {deck.queue.length > 0 && (
                  <span
                    className={cn(
                      "absolute -right-1.5 -top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full px-1 text-[8px] font-bold text-white",
                      palette.bg,
                    )}
                  >
                    {deck.queue.length}
                  </span>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 p-0"
            >
              <DeckQueuePopover deckId={deckId} onAddTrack={onOpenSamplePicker} />
            </PopoverContent>
          </Popover>
          {deck.loadedMediaId && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleEject}
              className="text-neutral-500 hover:text-neutral-100"
              title="Eject"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* ─── Waveform / drop zone ─── */}
      <div
        className={cn(
          "relative h-[70px] overflow-hidden rounded-lg ring-1 transition",
          dragOver ? "ring-2" : "bg-neutral-950/80 ring-black/40",
        )}
        style={
          dragOver
            ? {
                backgroundColor: `${palette.hex}33`,
                borderColor: palette.hex,
                boxShadow: `0 0 0 2px ${palette.hex}`,
              }
            : undefined
        }
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes("Files") ||
            e.dataTransfer.types.includes(LIBRARY_DRAG_MIME)
          ) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragOver(false)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          // Library drag öncelik: existing media → direkt load (re-upload yok)
          const libraryJson = e.dataTransfer.getData(LIBRARY_DRAG_MIME)
          if (libraryJson) {
            try {
              const item = JSON.parse(libraryJson) as {
                mediaId: string
                label: string
                bpm: number | null
              }
              loadDeckInStore(deckId, item)
              toast.success(`Loaded to Deck ${deckId}`)
              return
            } catch {
              /* fallthrough */
            }
          }
          const file = e.dataTransfer.files[0]
          if (file) void uploadAndLoad(file)
        }}
      >
        <div
          ref={waveContainerRef}
          className={cn(
            "absolute inset-0",
            !deck.loadedMediaId && "pointer-events-none",
          )}
        />
        {!deck.loadedMediaId && (
          <button
            type="button"
            onClick={() => onOpenSamplePicker(deckId)}
            disabled={uploading}
            className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-1 text-xs font-medium transition hover:brightness-125 disabled:opacity-60"
            style={{ color: palette.hex }}
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Upload04Icon} size={16} />
              {uploading ? "Uploading…" : "Click to load — or drop a file"}
            </div>
          </button>
        )}
        {/* Beat grid */}
        {waveReady && runtime.duration > 0 && deck.bpm && (
          <BeatGridOverlay
            bpm={deck.bpm}
            offset={deck.beatgridOffset}
            duration={runtime.duration}
            deckId={deckId}
          />
        )}
        {/* Loop region */}
        {waveReady && runtime.duration > 0 && currentLoop?.enabled && (
          <div
            className="pointer-events-none absolute top-0 z-10 h-full bg-emerald-500/20 ring-1 ring-emerald-500/60"
            style={{
              left: `${(currentLoop.start / runtime.duration) * 100}%`,
              width: `${((currentLoop.end - currentLoop.start) / runtime.duration) * 100}%`,
            }}
          />
        )}
        {/* Hotcue markers */}
        {waveReady && runtime.duration > 0 &&
          deck.hotcues.map((h) => (
            <div
              key={h.slot}
              className="pointer-events-none absolute top-0 z-10 h-full w-0.5"
              style={{
                left: `${(h.position / runtime.duration) * 100}%`,
                background: h.color,
              }}
            >
              <div
                className="absolute -top-0.5 -translate-x-1/2 rounded-sm px-1 py-0.5 text-[8px] font-bold text-white shadow-sm"
                style={{ background: h.color }}
              >
                {h.slot}
              </div>
            </div>
          ))}
        {/* Playhead */}
        {waveReady && runtime.duration > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]"
            style={{ left: `${playheadPct}%` }}
          />
        )}
      </div>

      {/* ─── Jog + transport + pitch ─── */}
      <div className="flex items-stretch gap-3">
        {/* Big jog wheel — scratch capable */}
        <div className="flex flex-1 items-center justify-center">
          <BigJog
            deckId={deckId}
            isPlaying={runtime.isPlaying}
            loaded={runtime.loaded}
            accent={accent}
            pitch={deck.pitch}
          />
        </div>

        {/* Transport column */}
        <div className="flex w-20 flex-col justify-end gap-2">
          <Button
            variant="default"
            onClick={handlePlayPause}
            disabled={!runtime.loaded || runtime.loading}
            className="h-10 w-full font-bold uppercase tracking-widest text-white"
            style={{
              background: runtime.isPlaying
                ? `linear-gradient(180deg, ${accent}, color-mix(in srgb, ${accent} 70%, black))`
                : "linear-gradient(180deg, #525252, #262626)",
            }}
          >
            <HugeiconsIcon
              icon={runtime.isPlaying ? PauseIcon : PlayIcon}
              size={16}
            />
          </Button>
          <Button
            variant="outline"
            onClick={handleCue}
            disabled={!runtime.loaded}
            className="h-8 w-full text-[10px] font-bold uppercase tracking-widest"
          >
            Cue
          </Button>
          <DeckSlipToggle deckId={deckId} disabled={!runtime.loaded} />
          {/* SYNC butonu — click = auto sync (en yakın BPM'li deck'le);
              right-click veya küçük ▾ chevron = manuel partner picker. */}
          <div className="flex w-full items-center gap-0.5">
            <Button
              variant="outline"
              onClick={() => {
                if (deck.sync) unsyncDeck(deckId)
                else syncDeckAuto(deckId)
              }}
              disabled={!runtime.loaded || !deck.bpm}
              className={cn(
                "h-7 flex-1 text-[10px] font-bold uppercase tracking-widest",
                deck.sync &&
                  "border-emerald-500 bg-emerald-500/20 text-emerald-300 animate-pulse",
              )}
            >
              Sync
            </Button>
            <SyncPartnerPicker
              deckId={deckId}
              disabled={!runtime.loaded || !deck.bpm}
            />
          </div>
        </div>

        {/* Pitch fader vertical */}
        <div className="flex w-16 flex-col items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => handlePitchChange(0)}
            className="font-mono text-[10px] tabular-nums text-neutral-400 hover:text-neutral-200"
            title="Reset pitch to 0%"
          >
            {(deck.pitch * 100 > 0 ? "+" : "") + (deck.pitch * 100).toFixed(1)}%
          </button>
          <VerticalFader
            value={deck.pitch}
            min={-0.16}
            max={0.16}
            step={0.001}
            defaultValue={0}
            onChange={handlePitchChange}
            capColor={accent}
            height={140}
            aria-label="Pitch fader"
          />
          <div className="text-[8px] font-bold uppercase tracking-widest text-neutral-500">
            PITCH
          </div>
        </div>
      </div>

      {/* ─── Hot cue pads + loop ─── (sticky-bottom; card sonuna yapışır) */}
      <div className="mt-auto flex items-start gap-3">
        {/* 9 hotcue pads (3x3) */}
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {Array.from({ length: HOTCUE_COUNT }, (_, i) => i + 1).map((slot) => {
            const cue = deck.hotcues.find((h) => h.slot === slot)
            const color = cue?.color ?? HOTCUE_COLORS[(slot - 1) % HOTCUE_COLORS.length]
            return (
              <div key={slot} className="group/pad relative">
                <button
                  type="button"
                  onClick={(e) => handlePadClick(slot, !!cue, e.shiftKey)}
                  disabled={!runtime.loaded}
                  className={cn(
                    "relative flex h-10 w-full items-center justify-center rounded-md border text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-30",
                    cue
                      ? "border-transparent text-white shadow-md hover:brightness-110 active:brightness-90"
                      : "border-neutral-800 bg-neutral-900/60 text-neutral-700 hover:border-neutral-600 hover:text-neutral-400",
                  )}
                  style={
                    cue
                      ? {
                          backgroundColor: color,
                          boxShadow: `0 0 12px ${color}50`,
                        }
                      : undefined
                  }
                  title={
                    cue
                      ? typeof cue.loopEnd === "number"
                        ? `Saved loop · ${fmtTime(cue.position)} → ${fmtTime(cue.loopEnd)} (${(cue.loopEnd - cue.position).toFixed(2)}s) · click to jump + loop`
                        : `${fmtTime(cue.position)} · click to jump · ✕ to clear`
                      : `Set cue ${slot} at current position`
                  }
                >
                  {/* Loop hotcue ise ↻ overlay (saved-loop pattern) */}
                  {cue && typeof cue.loopEnd === "number" ? (
                    <span className="flex items-center gap-0.5">
                      <span className="text-[14px] leading-none">↻</span>
                      <span className="text-[10px]">{slot}</span>
                    </span>
                  ) : (
                    slot
                  )}
                </button>
                {/* Hover clear button — sadece slot dolu iken */}
                {cue && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearHotcue(deckId, slot)
                    }}
                    className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-950 text-[10px] font-bold text-white shadow-lg ring-1 ring-white/30 hover:bg-red-600 group-hover/pad:flex"
                    title="Clear hotcue"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Loop strip */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1 text-[10px]">
            <button
              type="button"
              onClick={handleLoopIn}
              disabled={!runtime.loaded}
              className={cn(
                "rounded border border-neutral-800 px-2 py-1 font-bold uppercase transition disabled:opacity-40",
                pendingLoopIn !== null
                  ? "bg-amber-600 text-white border-amber-500"
                  : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800",
              )}
            >
              In
            </button>
            <button
              type="button"
              onClick={handleLoopOut}
              disabled={!runtime.loaded || pendingLoopIn === null}
              className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 font-bold uppercase text-neutral-400 transition hover:bg-neutral-800 disabled:opacity-40"
            >
              Out
            </button>
            <button
              type="button"
              onClick={handleLoopToggle}
              disabled={!currentLoop}
              className={cn(
                "rounded border px-2 py-1 font-bold uppercase transition disabled:opacity-40",
                currentLoop?.enabled
                  ? "bg-emerald-600 text-white border-emerald-500 animate-pulse"
                  : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800",
              )}
            >
              {currentLoop?.enabled ? "On" : "Off"}
            </button>
            {currentLoop && (
              <>
                {/* CDJ-3000 saved-loop: aktif loop'u sıradaki boş pad'e
                    yaz; pad'e basınca jump + auto-enable loop. */}
                <button
                  type="button"
                  onClick={handleSaveLoopToPad}
                  className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-1 font-bold uppercase text-fuchsia-300 transition hover:bg-fuchsia-500/20"
                  title="Save active loop to next empty pad"
                >
                  ↻ Pad
                </button>
                {/* Loop → Deck transfer dropdown (CDJ USB analogu —
                    sample extract + storage upload + load). */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-1 font-bold uppercase text-cyan-300 transition hover:bg-cyan-500/20"
                        title="Export loop as new sample → load on a deck"
                      >
                        → Deck
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-44">
                    {/* Base UI: DropdownMenuLabel (Menu.Group.Label) parent
                        DropdownMenuGroup gerektirir; yoksa "MenuGroupContext
                        is missing" crash (loop in-out sonrası → Deck menüsü).
                        Plain div ile ver. */}
                    <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
                      Send loop to deck…
                    </div>
                    {allDeckIds
                      .filter((id) => id !== deckId)
                      .map((id) => (
                        <DropdownMenuItem
                          key={id}
                          onClick={() => void handleExportLoopToDeck(id)}
                        >
                          Deck {id}
                        </DropdownMenuItem>
                      ))}
                    {allDeckIds.filter((id) => id !== deckId).length === 0 && (
                      <DropdownMenuItem disabled>
                        No other deck
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  onClick={handleLoopClear}
                  className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-neutral-500 transition hover:bg-red-900/40 hover:text-red-400"
                >
                  ✕
                </button>
              </>
            )}
          </div>
          <div className="flex gap-0.5 text-[9px]">
            {BEAT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => handleLoopBeats(o.value)}
                disabled={!runtime.loaded || !deck.bpm}
                className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
                title={`Loop ${o.label} beat${o.value > 1 ? "s" : ""}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function BigJog({
  deckId,
  isPlaying,
  loaded,
  accent,
  pitch,
}: {
  deckId: DeckId
  isPlaying: boolean
  loaded: boolean
  accent: string
  pitch: number
}) {
  // Pitch fader playback rate'i etkiler → wheel'in döngü süresi de
  // (1+pitch) ile orantılı. Pozitif pitch → daha hızlı dönsün,
  // negatif → yavaşlasın. Min 0.3s clamp ile takım extremde çılgın
  // dönüş olmasın.
  const baseRotationSec = 1.8
  const rotationDuration = Math.max(
    0.3,
    baseRotationSec / (1 + pitch),
  )
  const ref = useRef<HTMLDivElement>(null)
  const platterRef = useRef<HTMLDivElement>(null)
  /**
   * Scratch state — TÜMÜ ref, React state YOK. Pointer move'da DOM transform
   * direkt güncellenir (60fps smooth, render döngüsü pipeline'ında değil).
   */
  const scratchRef = useRef<{
    lastAngle: number
    lastTime: number
    accumulatedRotation: number
    wasPlaying: boolean
    rateAvg: number
  } | null>(null)
  const [scratching, setScratching] = useState(false)

  /**
   * Vinyl-style scratch with REAL REVERSE (AudioWorklet sample reader):
   *   - pointer down → engine setScratchActive(true): GrainPlayer susar,
   *     ScratchNode aktif; head pozisyonu mevcut konumdan başlar.
   *   - pointer move → angular velocity'i signed playback rate'e çevirir;
   *     pozitif = forward, NEGATİF = TERS playback (worklet sample buffer'ı
   *     geriye okur — gerçek vinyl scratch sound).
   *   - release → engine setScratchActive(false): worklet'in son head
   *     pozisyonundan GrainPlayer continue eder (eğer önceden çalıyorsa).
   *
   * UI smoothing: platter transform her pointer move'da REF üzerinden
   * direkt güncellenir; React render'ı tetiklenmez. Bu sayede 120Hz pointer
   * stream tam akıcı.
   */
  const computeAngle = useCallback(
    (clientX: number, clientY: number): number => {
      const el = ref.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      return Math.atan2(clientY - cy, clientX - cx)
    },
    [],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!loaded) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      const angle = computeAngle(e.clientX, e.clientY)
      scratchRef.current = {
        lastAngle: angle,
        lastTime: performance.now(),
        accumulatedRotation: 0,
        wasPlaying: isPlaying,
        rateAvg: 0,
      }
      setScratching(true)
      // Engine'i scratch moduna geçir (await etmiyoruz; pointer move
      // gelene kadar worklet hazır olur; ilk rate komutu kabul edilmezse
      // sonraki move'da gelir)
      void engineSetScratchActive(deckId, true, isPlaying)
      // Anlık freeze
      engineSetScratch(deckId, 0)
    },
    [loaded, isPlaying, deckId, computeAngle],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = scratchRef.current
      if (!s) return
      const angle = computeAngle(e.clientX, e.clientY)
      // Angle delta with wrap-around (cross ±π boundary)
      let delta = angle - s.lastAngle
      if (delta > Math.PI) delta -= 2 * Math.PI
      else if (delta < -Math.PI) delta += 2 * Math.PI
      const now = performance.now()
      const dt = Math.max(now - s.lastTime, 1) / 1000
      const angularVel = delta / dt // rad/s, SIGNED

      // 33.3 RPM = 3.49 rad/s nominal. Signed rate: pozitif = forward,
      // negatif = TERS (worklet bunu destekler).
      const NOMINAL = 3.49
      let rate = angularVel / NOMINAL
      // Çok yüksek pointer-event jitter'i yumuşat (1-pole low-pass IIR)
      s.rateAvg = s.rateAvg * 0.35 + rate * 0.65
      rate = s.rateAvg
      // Clamp -4..+4
      rate = Math.max(-4, Math.min(4, rate))
      engineSetScratch(deckId, rate)

      s.lastAngle = angle
      s.lastTime = now
      s.accumulatedRotation += delta
      // Smooth visual: DOM transform direkt (React state yok)
      const platter = platterRef.current
      if (platter) {
        platter.style.transform = `rotate(${(s.accumulatedRotation * 180) / Math.PI}deg)`
      }
    },
    [deckId, computeAngle],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = scratchRef.current
      if (!s) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      const wasPlaying = s.wasPlaying
      scratchRef.current = null
      setScratching(false)
      // Engine smooth scratch-out + GrainPlayer resume (önceden çalıyorsa)
      void engineSetScratchActive(deckId, false, wasPlaying)
      // Manual visual rotation'ı sıfırla (animate-spin tekrar başlar)
      const platter = platterRef.current
      if (platter) platter.style.transform = ""
    },
    [deckId],
  )

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        "relative select-none touch-none",
        loaded ? "cursor-grab active:cursor-grabbing" : "cursor-default",
      )}
      style={{ width: 340, height: 340 }}
      title={loaded ? "Drag to scratch · vinyl scrub (forward/reverse)" : ""}
    >
      {/* Outer ring (Pioneer chrome) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_5px_10px_rgba(0,0,0,0.65),0_5px_16px_rgba(0,0,0,0.45)]"
        style={{
          background:
            "conic-gradient(from 0deg, #1a1a1a, #404040, #1a1a1a, #404040, #1a1a1a)",
        }}
      />
      {/* Inner platter — döner */}
      <div
        ref={platterRef}
        className={cn(
          "pointer-events-none absolute inset-5 rounded-full will-change-transform",
          isPlaying && !scratching && "animate-spin",
        )}
        style={{
          background: `radial-gradient(circle at 30% 30%, #2a2a2a, #0a0a0a)`,
          animationDuration: `${rotationDuration}s`,
          boxShadow: "inset 0 0 16px rgba(0,0,0,0.85)",
        }}
      >
        {/* Concentric grooves (CDJ platter texture) — orantılı scale */}
        {[26, 58, 90, 122].map((inset) => (
          <div
            key={inset}
            className="absolute rounded-full border border-white/[0.03]"
            style={{
              top: inset,
              left: inset,
              right: inset,
              bottom: inset,
            }}
          />
        ))}
        {/* Center spindle */}
        <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-700 ring-2 ring-neutral-900" />
        {/* Position dot (rotates with playback) — vinyl needle hat hissi */}
        <div
          className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-[140px] rounded-full"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
        />
      </div>
      {/* LED ring */}
      <div
        className={cn(
          "pointer-events-none absolute inset-1 rounded-full ring-2 transition",
          loaded ? "opacity-100" : "opacity-30",
          scratching && "ring-4",
        )}
        style={{
          boxShadow: loaded
            ? `0 0 12px ${accent}40, inset 0 0 6px ${accent}30`
            : "none",
          color: accent,
        }}
      />
      {/* Deck letter overlay */}
      <div
        className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-xs font-bold tracking-widest"
        style={{ color: accent }}
      >
        DECK {deckId}
      </div>
      {/* DiscIcon visible only when not loaded */}
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <HugeiconsIcon
            icon={DiscIcon}
            size={64}
            className="text-neutral-700"
          />
        </div>
      )}
      {/* Scratch indicator */}
      {scratching && (
        <div
          className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white"
          style={{ background: accent }}
        >
          ◀ Scratch ▶
        </div>
      )}
    </div>
  )
}

function DeckQueuePopover({
  deckId,
  onAddTrack,
}: {
  deckId: DeckId
  onAddTrack(deck: DeckId, mode?: "load" | "queue"): void
}) {
  const queue = useDjStore((s) => s.tree.decks[deckId].queue)
  const reorderQueue = useDjStore((s) => s.reorderQueue)
  const removeFromQueue = useDjStore((s) => s.removeFromQueue)
  const loadDeck = useDjStore((s) => s.loadDeck)
  const enqueueToDeck = useDjStore((s) => s.enqueueToDeck)
  const [dragOver, setDragOver] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = queue.findIndex((q) => q.id === active.id)
    const newIdx = queue.findIndex((q) => q.id === over.id)
    if (oldIdx >= 0 && newIdx >= 0) reorderQueue(deckId, oldIdx, newIdx)
  }

  const handleLoadNow = (idx: number) => {
    const item = queue[idx]
    if (!item) return
    loadDeck(deckId, {
      mediaId: item.mediaId,
      label: item.label,
      bpm: item.bpm,
    })
    removeFromQueue(deckId, item.id)
  }

  const palette = DECK_ACCENTS[deckId]
  const accentBg = palette.bg

  return (
    <div
      className={cn(
        "flex max-h-72 flex-col rounded-md border bg-neutral-950 transition",
        dragOver ? "" : "border-neutral-800",
      )}
      style={
        dragOver
          ? {
              backgroundColor: `${palette.hex}1a`,
              borderColor: palette.hex,
            }
          : undefined
      }
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(LIBRARY_DRAG_MIME)) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragOver(false)
        }
      }}
      onDrop={(e) => {
        const json = e.dataTransfer.getData(LIBRARY_DRAG_MIME)
        setDragOver(false)
        if (!json) return
        e.preventDefault()
        try {
          const item = JSON.parse(json) as {
            mediaId: string
            label: string
            bpm: number | null
            key: string | null
          }
          enqueueToDeck(deckId, item)
          toast.success(`Added to Deck ${deckId} queue`)
        } catch {
          toast.error("Drag data unreadable")
        }
      }}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          <span className={cn("h-1.5 w-1.5 rounded-full", accentBg)} />
          Queue · {queue.length}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onAddTrack(deckId, "queue")}
          className="text-neutral-500 hover:text-neutral-100"
          title="Add tracks"
        >
          +
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {queue.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-neutral-600">
            Empty — drag a sample or click + to add
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={queue.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-neutral-800/60">
                {queue.map((item, idx) => (
                  <QueueRow
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    bpm={item.bpm}
                    index={idx}
                    deckId={deckId}
                    onPlayNow={() => handleLoadNow(idx)}
                    onRemove={() => removeFromQueue(deckId, item.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

function QueueRow({
  id,
  label,
  bpm,
  index,
  deckId,
  onPlayNow,
  onRemove,
}: {
  id: string
  label: string
  bpm: number | null
  index: number
  deckId: DeckId
  onPlayNow(): void
  onRemove(): void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 text-xs",
        isDragging ? "bg-neutral-800" : "hover:bg-neutral-800/40",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-neutral-600 hover:text-neutral-400 active:cursor-grabbing"
        title="Drag to reorder"
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={12} />
      </button>
      <span
        className="w-4 text-center font-mono text-[10px] opacity-70"
        style={{ color: DECK_ACCENTS[deckId].hex }}
      >
        {index + 1}
      </span>
      <button
        type="button"
        onClick={onPlayNow}
        className="min-w-0 flex-1 truncate text-left text-neutral-300 hover:text-neutral-100"
        title="Click to load now"
      >
        {label}
      </button>
      {bpm && (
        <span className="flex items-center gap-0.5 font-mono text-[10px] text-neutral-500">
          <HugeiconsIcon icon={PulseIcon} size={9} />
          {Math.round(bpm)}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="text-neutral-600 hover:text-red-400"
        title="Remove"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={11} />
      </button>
    </li>
  )
}

function BeatGridOverlay({
  bpm,
  offset,
  duration,
  deckId,
}: {
  bpm: number
  offset: number
  duration: number
  deckId: DeckId
}) {
  const beats = generateBeats(bpm, offset, duration)
  // Hex → rgba 0.5 opacity için: hex'i parse + alpha ekle. Per-deck
  // beat grid'i deck'in accent rengiyle daha okunaklı (Pioneer CDJ
  // standardı her deck'in beat grid'inin LED rengi).
  const hex = DECK_ACCENTS[deckId].hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const color = `rgba(${r},${g},${b},0.5)`
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {beats.map((t, i) => {
        const pct = (t / duration) * 100
        const isBar = i % 4 === 0
        return (
          <div
            key={i}
            className="absolute top-0 h-full"
            style={{
              left: `${pct}%`,
              width: isBar ? 1 : 0.5,
              background: isBar ? color : color.replace("0.5", "0.25"),
            }}
          />
        )
      })}
    </div>
  )
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

/**
 * Sync partner picker — küçük chevron button, popover'da 3 alternatif
 * deck (target hariç). Tıklayınca o partner'a sync uygula.
 *
 * Default SYNC click `syncDeckAuto` ile en yakın BPM'li partner'ı seçer;
 * bu picker kullanıcının manuel override etmesi için.
 */
/**
 * Deck'in atandığı mixer'ı gösteren küçük chip + dropdown picker. Sadece
 * birden çok mixer varsa görünür (tek mixer setup'ta UI clutter olmasın).
 * Click → shadcn DropdownMenu ile mevcut mixer listesi; seçim store ve
 * engine'e push edilir.
 */
function DeckMixerAssignChip({ deckId }: { deckId: DeckId }) {
  // tree.mixers store reference'ı direkt al — store update'inde yeni
  // array oluşur, no-op patch'lerde aynı reference (Zustand built-in
  // ref-eq). Sonra useMemo ile dropdown için ihtiyacımız olan minimal
  // {id, name} array'i derive et. useShallow selector wrap'ı SSR'da
  // "getServerSnapshot should be cached" loop'una sebep oluyordu —
  // store-direct + useMemo daha deterministik.
  const mixersRaw = useDjStore((s) => s.tree.mixers)
  const mixers = useMemo(
    () => mixersRaw.map((m) => ({ id: m.id, name: m.name })),
    [mixersRaw],
  )
  const assignedId = useDjStore(
    (s) => s.tree.decks[deckId]?.assignedMixerId,
  )
  const assignDeckToMixer = useDjStore((s) => s.assignDeckToMixer)
  if (mixers.length <= 1) return null
  const currentName =
    mixers.find((m) => m.id === assignedId)?.name ?? mixers[0]?.name ?? "—"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-6 max-w-[140px] items-center gap-1 truncate rounded border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 transition hover:bg-amber-500/20"
            title={`Routed to ${currentName} (click to change mixer)`}
          >
            <span className="opacity-60">→</span>
            <span className="truncate">{currentName}</span>
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-44">
        {/* Plain div — DropdownMenuLabel group parent gerektirir (crash). */}
        <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
          Route to mixer
        </div>
        {mixers.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => {
              assignDeckToMixer(deckId, m.id)
              assignDeckToMixerEngine(deckId, m.id)
            }}
          >
            <span className="flex-1 truncate">{m.name}</span>
            {assignedId === m.id && (
              <span className="text-emerald-400">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SyncPartnerPicker({
  deckId,
  disabled,
}: {
  deckId: DeckId
  disabled: boolean
}) {
  const decks = useDjStore((s) => s.tree.decks)
  const layout = useDjStore((s) => s.tree.layout)
  const partners = useMemo(
    () => getDeckIdsFromLayout(layout).filter((d) => d !== deckId),
    [layout, deckId],
  )
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className="h-7 w-5 rounded border border-neutral-800 bg-neutral-900 text-[8px] font-bold text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-30"
            title="Pick sync partner"
          />
        }
      >
        ▾
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2" align="end">
        <div className="mb-1.5 text-[9px] uppercase tracking-widest text-neutral-500">
          Sync → partner
        </div>
        <div className="flex flex-col gap-1">
          {partners.map((p) => {
            const partnerBpm = decks[p].bpm
            const partnerLoaded = decks[p].loadedMediaId !== null
            return (
              <button
                key={p}
                type="button"
                disabled={!partnerBpm}
                onClick={() => syncDeckBpm(deckId, p)}
                className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded font-mono text-[9px] font-bold text-white"
                    style={{ backgroundColor: DECK_ACCENTS[p].hex }}
                  >
                    {p}
                  </span>
                  <span className="text-neutral-300">Deck {p}</span>
                </span>
                <span className="font-mono text-neutral-500">
                  {partnerBpm
                    ? `${Math.round(partnerBpm)}`
                    : partnerLoaded
                      ? "…"
                      : "—"}
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * SLIP mode toggle — Pioneer CDJ-3000 imza özelliği. Aktifken loop
 * kapanınca deck, loop'a girmemiş gibi devam eden "virtual" pozisyona
 * sıçrar. State volatile (lokal Map'te), tree'ye persist edilmez.
 */
function DeckSlipToggle({
  deckId,
  disabled,
}: {
  deckId: DeckId
  disabled: boolean
}) {
  // Slip volatile state — store dışı; render için manuel ufak counter
  const [tick, setTick] = useState(0)
  const active = isDeckSlipMode(deckId)
  return (
    <Button
      variant="outline"
      onClick={() => {
        setDeckSlipMode(deckId, !active)
        setTick((n) => n + 1)
      }}
      disabled={disabled}
      className={cn(
        "h-6 w-full text-[9px] font-bold uppercase tracking-widest",
        active && "border-amber-500 bg-amber-500/20 text-amber-300",
      )}
      title={
        active
          ? "Slip mode ON — jump to virtual position after loop"
          : "Slip mode OFF (Pioneer CDJ slip button)"
      }
      data-tick={tick}
    >
      Slip
    </Button>
  )
}

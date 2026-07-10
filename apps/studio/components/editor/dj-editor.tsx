"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  HeadphonesIcon,
  CloudIcon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  FolderLibraryIcon,
  PlayIcon,
  PauseIcon,
  KeyboardIcon,
} from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Button } from "@workspace/ui/components/button"
import {
  EditableTitle,
  BpmKeyDisplay,
} from "../musician/header/header-bits"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"
import type { StudioProject } from "@workspace/db/models/studio-project"
import type {
  StudioProjectData,
  StudioDjProjectTree,
} from "@workspace/db/models/studio-project-data"
import {
  useDjStore,
  type DeckId,
  DECK_ACCENTS,
  getDeckIdsFromLayout,
} from "@/lib/dj-store"
import {
  toggleAllPlayback,
  toggleFocusedDeck,
  togglePlayDeck,
  cueDeck,
  addHotcueAtCurrentPosition,
  toggleOrCreateLoop,
  resizeActiveLoop,
  nudgeDeckPosition,
  syncDeckAuto,
} from "@/lib/dj-actions"
import { getMasterMeterDb } from "@/lib/audio-engine"
import { initLocalFiles } from "@/lib/local-files"
import { VuMeter } from "./pioneer/vu-meter"
import { SamplePickerDialog } from "./sample-picker-dialog"
import { NowPlayingStrip } from "./now-playing-strip"
import { RecordingControls } from "./recording-controls"
import { RecordingsSheet } from "./recordings-sheet"
import { LibrarySidebar } from "./library-sidebar"
import { LowerPanel } from "./lower-panel"
import { AutoMixPanel } from "./auto-mix-panel"
import { CrossfaderPanel } from "./crossfader-panel"
import { DjLayoutSortable } from "./dj-layout-sortable"
import { CDJDeck } from "./pioneer/cdj-deck"
import { DJMMixer } from "./pioneer/djm-mixer"

/**
 * DJ Editor — full-screen layout.
 *
 * Top bar (back / title / save status / settings) → main area (Deck A +
 * crossfader placeholder + Deck B) → bottom status.
 *
 * Phase 1: Her iki deck'i de bağımsız çal/duraklat/seek/volume. Crossfader
 * placeholder Phase 2'de aktif olacak; şu an her iki deck eşit çalar.
 *
 * State hydration: mount'ta server'dan gelen project + data ile dj-store
 * init edilir. Tree mutations auto-save (3s debounce).
 */
export function DjEditor({
  project,
  data,
  companySlug,
  lang,
}: {
  project: StudioProject
  data: StudioProjectData | null
  companySlug: string
  lang: string
}) {
  const [title, setTitle] = useState(project.title)
  const [bpm, setBpm] = useState(project.bpm)

  // Sample picker per deck
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDeck, setPickerDeck] = useState<DeckId | null>(null)
  const [pickerMode, setPickerMode] = useState<"load" | "queue">("load")

  // Recordings sheet
  const [recordingsOpen, setRecordingsOpen] = useState(false)
  // Library sheet (sol panel)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const init = useDjStore((s) => s.init)
  const saveStatus = useDjStore((s) => s.saveStatus)
  const saveError = useDjStore((s) => s.saveError)
  const treeRevision = useDjStore((s) => s.revision)

  // Init store on mount — sadece project.id değişince yeniden çalış.
  // `data` prop'unu deps array'ine eklemek, parent her render'da yeni
  // data reference yaratırsa loop tetikler (init store reset → component
  // re-render → useEffect yine tetiklenir → infinite update). Init bir
  // kez snapshot alır; sonraki tree güncellemeleri patchTree ile akar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tree =
      data?.tree && data.tree.mode === "dj"
        ? (data.tree as StudioDjProjectTree)
        : null
    init({
      projectId: project.id,
      companySlug,
      tree,
      revision: data?.revision ?? 0,
    })
    // Lokal (IndexedDB) library dosyalarını hydrate et — reload sonrası
    // deck'lerdeki local- mediaId'ler objectURL'e çözülebilsin.
    void initLocalFiles(companySlug)
  }, [project.id])

  // Sayfayı kapatma / geri / refresh sırasında onay — kullanıcı çalan
  // veya henüz save edilmemiş set'i yanlışlıkla kaybetmesin. Modern
  // tarayıcılar custom mesajları yok sayıp standart "Leave site?"
  // dialog'unu gösterir. preventDefault + returnValue tetikler.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const state = useDjStore.getState()
      const anyPlaying = Object.values(state.transport).some(
        (rt) => rt?.isPlaying,
      )
      const unsaved =
        state.saveStatus === "dirty" || state.saveStatus === "saving"
      if (anyPlaying || unsaved) {
        e.preventDefault()
        // Legacy property — Chrome/Safari için non-empty string gerekir
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [])

  // AudioWorklet scratch-processor.js dosyasını browser cache'e al —
  // ilk audio gesture'undan sonra addModule() network beklemez. Tone.start()
  // user gesture gerektirir, addModule'ı da burada çağıramayız; fakat
  // dosyayı önceden indirip cache'lemek scratch'in ilk açılış latency'sini
  // ~300ms'den ~10ms'ye düşürür.
  useEffect(() => {
    fetch("/audio-worklets/scratch-processor.js", { cache: "force-cache" })
      .catch(() => {
        /* offline veya 404 — scratch çağrısı kendi error'unu yönetir */
      })
  }, [])

  // ─── Global keyboard shortcuts ─────────────────────────────────────────
  //
  // Pioneer CDJ + DJM klavye eşleştirmesi. Bir deck'i seçmek için
  // CDJDeck'e pointer-down (border accent vurgulu) → focusedDeck set.
  //
  //   Space          → toggleAllPlayback (master play/pause)
  //   Shift+Space    → toggleFocusedDeck (sadece son tıklanan deck)
  //   1 / 2 / 3 / 4  → toggle play/pause Deck A/B/C/D
  //   Q / W / E / R  → cue Deck A/B/C/D (cue point veya 0)
  //   H              → set hotcue at current position (focused deck)
  //   L              → toggle/create loop (focused deck, default 4 beats)
  //   S              → sync focused deck (auto partner)
  //   [ / ]          → halve/double active loop length (focused deck)
  //   ← / →          → seek -2s / +2s (focused deck)
  //   ?              → help popover toggle (TODO)
  //
  // Input/textarea/contenteditable içindeyken tüm shortcut'lar kapalı.
  useEffect(() => {
    const numberToDeck: Record<string, DeckId> = {
      Digit1: "A",
      Digit2: "B",
      Digit3: "C",
      Digit4: "D",
    }
    const cueLetterToDeck: Record<string, DeckId> = {
      KeyQ: "A",
      KeyW: "B",
      KeyE: "C",
      KeyR: "D",
    }
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable)
      ) {
        return
      }
      const focused = useDjStore.getState().focusedDeck

      // Space — master / focused playback toggle
      if (e.code === "Space") {
        e.preventDefault()
        if (e.shiftKey) void toggleFocusedDeck()
        else void toggleAllPlayback()
        return
      }
      // Number → play deck
      const numDeck = numberToDeck[e.code]
      if (numDeck) {
        e.preventDefault()
        useDjStore.getState().setFocusedDeck(numDeck)
        void togglePlayDeck(numDeck)
        return
      }
      // Q/W/E/R → cue deck
      const cueDeckId = cueLetterToDeck[e.code]
      if (cueDeckId) {
        e.preventDefault()
        useDjStore.getState().setFocusedDeck(cueDeckId)
        void cueDeck(cueDeckId)
        return
      }
      // Focused-only shortcuts — focus yoksa no-op
      if (!focused) return
      switch (e.code) {
        case "KeyH":
          e.preventDefault()
          addHotcueAtCurrentPosition(focused)
          break
        case "KeyL":
          e.preventDefault()
          toggleOrCreateLoop(focused)
          break
        case "KeyS":
          e.preventDefault()
          syncDeckAuto(focused)
          break
        case "BracketLeft":
          e.preventDefault()
          resizeActiveLoop(focused, 0.5)
          break
        case "BracketRight":
          e.preventDefault()
          resizeActiveLoop(focused, 2)
          break
        case "ArrowLeft":
          e.preventDefault()
          nudgeDeckPosition(focused, e.shiftKey ? -10 : -2)
          break
        case "ArrowRight":
          e.preventDefault()
          nudgeDeckPosition(focused, e.shiftKey ? 10 : 2)
          break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // Inline metadata patch (EditableTitle + BpmKeyDisplay on-change'lerden
  // çağrılır). Optimistic local state + PATCH; başarısız olunca toast.
  const patchMeta = useCallback(
    async (patch: { title?: string; bpm?: number }) => {
      try {
        const res = await fetch(
          `/api/companies/${companySlug}/studio/projects/${project.id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed")
      }
    },
    [companySlug, project.id],
  )

  const openPicker = (deck: DeckId, mode: "load" | "queue" = "load") => {
    setPickerDeck(deck)
    setPickerMode(mode)
    setPickerOpen(true)
  }

  return (
    <div className="flex h-svh flex-col bg-neutral-950 text-neutral-100">
      {/* ─── Header ─── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-neutral-400 hover:text-neutral-100"
            render={<Link href={`/${lang}/d/${companySlug}/studio`} />}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            Dashboard
          </Button>
          <div className="h-5 w-px bg-neutral-800" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLibraryOpen((o) => !o)}
            className={cn(
              "gap-2 transition",
              libraryOpen
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-300 hover:text-neutral-100",
            )}
            title="Library — sample browser"
          >
            <HugeiconsIcon icon={FolderLibraryIcon} size={14} />
            Library
          </Button>
          <div className="h-5 w-px bg-neutral-800" />
          <div className="flex items-center gap-2 text-sm">
            <HugeiconsIcon
              icon={HeadphonesIcon}
              size={14}
              className="text-pink-500"
            />
            {/* Musician pattern: inline-editable title + LCD BPM popover.
                Settings dialog kaldırıldı — title/BPM artık header'da
                doğrudan düzenlenir, optimistic PATCH. */}
            <EditableTitle
              value={title}
              onChange={(next) => {
                setTitle(next)
                void patchMeta({ title: next })
              }}
            />
            <BpmKeyDisplay
              bpm={bpm}
              musicalKey={undefined}
              musicalScale={undefined}
              onBpmChange={(next) => {
                setBpm(next)
                void patchMeta({ bpm: next })
              }}
              onKeyChange={() => {}}
              onScaleChange={() => {}}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RecordingControls
            companySlug={companySlug}
            onOpenRecordings={() => setRecordingsOpen(true)}
          />
          <div className="h-5 w-px bg-neutral-800" />
          <KeyboardShortcutsPopover />
          <SaveStatusBadge status={saveStatus} error={saveError} />
        </div>
      </header>

      {/* ─── Now-playing strip ─── */}
      <NowPlayingStrip />

      {/* ─── Main: Library sidebar (inline) + decks area ─── */}
      <main className="flex flex-1 items-stretch overflow-hidden">
        <LibrarySidebar
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          companySlug={companySlug}
        />
        <div className="flex flex-1 items-stretch justify-center overflow-auto p-4">
          {/*
            Dinamik deck + mixer layout — DND sortable.
              Kullanıcı her item'ı (deck/mixer) drag handle (header'da ≡)
              ile sürükleyip yer değiştirebilir. "+" butonu sağ uçta
              yeni deck ekler (next available letter, max Z).
              Crossfader v1 yalnızca "A" ve "B" id'leri etkiler.
          */}
          <DjLayoutSortable
            renderDeck={(id) => (
              <CDJDeck
                deckId={id}
                companySlug={companySlug}
                onOpenSamplePicker={openPicker}
              />
            )}
            renderMixer={(mixerId) => <DJMMixer mixerId={mixerId} />}
          />
        </div>
      </main>

      {/* ─── Lower panel (Master FX / Beat Repeat / Overview tabs) ─── */}
      <LowerPanel />

      {/* ─── Footer: master transport + per-mixer crossfaders + auto-mix.
            Multi-mixer setup'ta her mixer'ın crossfader'ı yan yana footer'da
            görünür — gerçek DJ donanım layout'u (mixer card master sadece
            gain + name; crossfader DJM-V10'da fader paneli ayrı pozisyonda). */}
      <footer className="flex h-14 shrink-0 items-center gap-3 overflow-x-auto border-t border-neutral-800 bg-neutral-900 px-4 text-xs text-neutral-500">
        <MasterTransportBar />
        <MultiMixerCrossfaders />
        <AutoMixPanel />
        <div className="flex shrink-0 items-center gap-2 font-mono text-[9px] text-neutral-600">
          <span>r{treeRevision}</span>
          {process.env.APP_VERSION && (
            <span>v{process.env.APP_VERSION}</span>
          )}
        </div>
      </footer>

      <SamplePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        deck={pickerDeck}
        defaultMode={pickerMode}
        companySlug={companySlug}
      />

      <RecordingsSheet
        open={recordingsOpen}
        onOpenChange={setRecordingsOpen}
        companySlug={companySlug}
      />
    </div>
  )
}

function SaveStatusBadge({
  status,
  error,
}: {
  status: "idle" | "dirty" | "saving" | "saved" | "error"
  error: string | null
}) {
  const map: Record<typeof status, { icon: typeof CloudIcon; label: string; cls: string }> = {
    idle: { icon: CloudIcon, label: "Synced", cls: "text-neutral-600" },
    dirty: { icon: CloudIcon, label: "Unsaved", cls: "text-yellow-500" },
    saving: { icon: CloudIcon, label: "Saving…", cls: "text-blue-400 animate-pulse" },
    saved: { icon: CheckmarkCircle01Icon, label: "Saved", cls: "text-green-500" },
    error: { icon: AlertCircleIcon, label: error ?? "Save error", cls: "text-red-500" },
  }
  const entry = map[status]
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-medium transition",
        entry.cls,
      )}
      title={error ?? undefined}
    >
      <HugeiconsIcon icon={entry.icon} size={12} />
      {entry.label}
    </div>
  )
}

/**
 * Master transport bar — footer'a yerleşik. Sol: master ▶/⏸ butonu
 * (anyPlaying ? pause : play). Yanında 4 deck mini LED indicator —
 * yüklü deck'in rengi, çalanlarda animate-pulse. Sağında focused deck +
 * keyboard hint (Space / Shift+Space).
 *
 * Master butona tıklamak `toggleAllPlayback`; per-deck LED'e tıklamak
 * sadece o deck'i toggle eder + focused yapar.
 */
/**
 * Footer'da her mixer için ayrı bir CrossfaderPanel yan yana render eder.
 * Mevcut tek-mixer setup'larda tek panel; multi-mixer'da hepsi yan yana.
 * Mixer card'larında crossfader yok (sadece master gain + isim), gerçek
 * DJM-V10 layout'una uygun.
 */
function MultiMixerCrossfaders() {
  // Store-direct selector (ref-eq stable) + useMemo derive — selector
  // içinde .map yapmak Zustand getSnapshot caching ihlal eder.
  const mixersRaw = useDjStore((s) => s.tree.mixers)
  const mixerIds = useMemo(
    () => mixersRaw.map((m) => m.id),
    [mixersRaw],
  )
  return (
    <div className="flex shrink-0 items-center gap-2">
      {mixerIds.map((id) => (
        <CrossfaderPanel key={id} mixerId={id} />
      ))}
    </div>
  )
}

function MasterTransportBar() {
  const transport = useDjStore((s) => s.transport)
  const decks = useDjStore((s) => s.tree.decks)
  const layout = useDjStore((s) => s.tree.layout)
  const focusedDeck = useDjStore((s) => s.focusedDeck)
  const setFocusedDeck = useDjStore((s) => s.setFocusedDeck)
  const deckIds = useMemo(() => getDeckIdsFromLayout(layout), [layout])

  const anyPlaying = deckIds.some((d) => transport[d]?.isPlaying)
  const loadedCount = deckIds.filter((d) => transport[d]?.loaded).length

  return (
    <div className="flex flex-1 items-center gap-3">
      {/* Master play/pause */}
      <button
        type="button"
        onClick={() => void toggleAllPlayback()}
        disabled={loadedCount === 0}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-30",
          anyPlaying
            ? "border-red-500/60 bg-red-500/20 text-red-300 hover:bg-red-500/30"
            : "border-emerald-500/60 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
        )}
        title={
          anyPlaying
            ? "Pause all decks (Space)"
            : "Play all loaded decks (Space)"
        }
      >
        <HugeiconsIcon icon={anyPlaying ? PauseIcon : PlayIcon} size={14} />
        {anyPlaying ? "Pause All" : "Play All"}
      </button>

      {/* Master VU meter — post-limiter okur, clipping görseli */}
      <div className="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-950 px-1.5 py-1">
        <span className="font-mono text-[8px] uppercase tracking-widest text-neutral-600">M</span>
        <VuMeter
          getDb={getMasterMeterDb}
          segments={14}
          width={4}
          segmentGap={1}
          segmentHeight={2.5}
          title="Master output level"
        />
      </div>

      {/* Quantize toggle — global cue/loop beat-snap */}
      <QuantizeToggle />

      {/* Per-deck LED row */}
      <div className="flex items-center gap-1.5">
        {deckIds.map((id) => {
          const rt = transport[id] ?? {
            loaded: false,
            isPlaying: false,
            position: 0,
            duration: 0,
            loading: false,
            error: null,
            peaks: null,
          }
          const palette = DECK_ACCENTS[id]
          const isFocused = focusedDeck === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFocusedDeck(id)
                if (!rt.loaded) return
                if (rt.isPlaying) {
                  // Per-deck pause — global setRuntime + engine handle
                  // edilmiyor burada; CDJDeck kendi handlePlayPause'u
                  // dinler ama dış'tan kontrol için store + engine
                  // direct. Basit: ayrı action helper eklemek yerine
                  // toggleFocusedDeck'i kullan (focused setlendi).
                  void toggleFocusedDeck()
                } else {
                  void toggleFocusedDeck()
                }
              }}
              className={cn(
                "group flex h-9 w-9 flex-col items-center justify-center rounded-md border transition",
                rt.loaded
                  ? "border-neutral-700 hover:border-neutral-500"
                  : "border-neutral-900 bg-neutral-950 opacity-50",
                isFocused && "ring-1 ring-offset-1 ring-offset-neutral-900",
              )}
              style={{
                ...(isFocused ? { borderColor: palette.hex } : undefined),
                ...(isFocused
                  ? ({ "--tw-ring-color": palette.hex } as React.CSSProperties)
                  : undefined),
              }}
              title={
                rt.loaded
                  ? `Deck ${id} · ${rt.isPlaying ? "playing" : "stopped"}${decks[id]?.loadedLabel ? " · " + decks[id].loadedLabel : ""}`
                  : `Deck ${id} · empty`
              }
            >
              <span
                className="font-mono text-[10px] font-bold"
                style={{
                  color: rt.loaded ? palette.hex : "#525252",
                }}
              >
                {id}
              </span>
              <span
                className={cn(
                  "mt-0.5 h-1 w-4 rounded-full transition",
                  rt.isPlaying && "animate-pulse",
                )}
                style={{
                  backgroundColor: rt.isPlaying
                    ? palette.hex
                    : rt.loaded
                      ? `${palette.hex}40`
                      : "#262626",
                }}
              />
            </button>
          )
        })}
      </div>

      {/* Keyboard hint */}
      <div className="ms-2 hidden text-[10px] text-neutral-600 md:flex md:items-center md:gap-3">
        <span>
          <kbd className="rounded border border-neutral-800 bg-neutral-900 px-1 py-0.5 font-mono text-[9px] text-neutral-400">
            Space
          </kbd>{" "}
          all
        </span>
        <span>
          <kbd className="rounded border border-neutral-800 bg-neutral-900 px-1 py-0.5 font-mono text-[9px] text-neutral-400">
            ⇧ Space
          </kbd>{" "}
          {focusedDeck ? `Deck ${focusedDeck}` : "focused"}
        </span>
      </div>
    </div>
  )
}

/**
 * Header'da küçük klavye ikonu — açılır popover ile tüm shortcut'lar.
 * Pioneer CDJ/DJM hardware layout'tan ödünç + space toggle (master)
 * + shift+space (focused deck).
 */
function KeyboardShortcutsPopover() {
  const SECTIONS: { title: string; rows: [string, string][] }[] = [
    {
      title: "Global",
      rows: [
        ["Space", "Play / Pause All"],
        ["Shift + Space", "Focused deck play / pause"],
      ],
    },
    {
      title: "Per-deck",
      rows: [
        ["1 2 3 4", "Play / Pause Deck A / B / C / D"],
        ["Q W E R", "Cue Deck A / B / C / D"],
      ],
    },
    {
      title: "Focused deck",
      rows: [
        ["H", "Set hotcue (next empty slot)"],
        ["L", "Loop on/off (creates 4 beats if none)"],
        ["S", "Sync (auto partner)"],
        ["[ / ]", "Loop length 0.5x / 2x"],
        ["← / →", "Seek -2s / +2s (Shift = 10s)"],
      ],
    },
  ]
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-neutral-400 hover:text-neutral-100"
            title="Keyboard shortcuts"
          />
        }
      >
        <HugeiconsIcon icon={KeyboardIcon} size={16} />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="mb-2 text-[10px] uppercase tracking-widest text-neutral-500">
          Keyboard shortcuts
        </div>
        <div className="space-y-3">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-pink-400/80">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.rows.map(([keys, desc]) => (
                  <div
                    key={keys}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="text-neutral-300">{desc}</span>
                    <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-neutral-800 pt-2 text-[9px] text-neutral-600">
          To change the focused deck, click anywhere on its panel — the
          accent border highlights it.
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Footer'da "Q" toggle — global quantize aç/kapat. Aktifken yeni
 * hotcue, loop, sürükleme noktaları en yakın downbeat'e snap (deck'in
 * bpm + beatgridOffset gerekir; yoksa snap no-op).
 */
function QuantizeToggle() {
  const enabled = useDjStore((s) => Boolean(s.tree.quantize))
  const patchTree = useDjStore((s) => s.patchTree)
  return (
    <button
      type="button"
      onClick={() =>
        patchTree((tree) => ({ ...tree, quantize: !tree.quantize }))
      }
      className={cn(
        "flex h-9 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-bold uppercase tracking-widest transition",
        enabled
          ? "border-amber-500/60 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
          : "border-neutral-800 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200",
      )}
      title={
        enabled
          ? "Quantize ON — cue/loop points snap to beat"
          : "Quantize OFF (click to enable beat-snap)"
      }
    >
      Q
    </button>
  )
}

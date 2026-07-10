"use client"

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  Add01Icon,
  FolderLibraryIcon,
  Mic01Icon,
  Clock01Icon,
  ArrowReloadHorizontalIcon,
  DragDropVerticalIcon,
  MoreVerticalIcon,
  Magnet01Icon,
  RepeatIcon,
  Flag01Icon,
  HeadphonesIcon,
} from "@hugeicons/core-free-icons"
import {
  LibrarySidebar,
  LIBRARY_DRAG_MIME,
  getLibraryTargetFolder,
  type LibraryDragPayload,
} from "../editor/library-sidebar"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import type { StudioProject } from "@workspace/db/models/studio-project"
import type {
  StudioProjectData,
  StudioMusicianProjectTree,
  MusicianTrack,
  MusicianClip,
  MusicianEffect,
} from "@workspace/db/models/studio-project-data"
import {
  ensureAudioStarted,
  ensureTrack,
  removeTrack as engineRemoveTrack,
  setTrackVolume,
  setTrackPan,
  setTrackMuted,
  setTrackFxChain,
  setMasterVolume,
  transportPlay,
  transportPause,
  transportStop,
  transportSeek,
  transportClearSchedule,
  setTransportLoop,
  setMetronome,
  getTrackMeterDb,
  getMasterMeterDb,
  getTransportPosition,
  scheduleClip,
  removeClip as engineRemoveClip,
  renderProject,
  startMicRecording,
  stopMicRecording,
  triggerTapeStop,
  setTrackOutputDevice,
  isTrackOutputRoutingSupported,
} from "@/lib/musician-engine"
import { useAudioDevices, type AudioDeviceOption } from "@/lib/audio-devices"
import { AudioDevicePopover } from "./audio-device-popover"
import {
  encodeAudio,
  isM4aSupported,
  FORMAT_META,
  type AudioFormat,
} from "@/lib/audio-encoders"
import {
  Download01Icon,
  RecordIcon,
  StopIcon as RecStopIcon,
} from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import { Tip } from "./tip-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { InspectorPanel, tabKey, type InspectorTab } from "./inspector-panel"
import { confirm } from "@workspace/console/stores/confirm"
import { promptInput } from "@/components/common/input-dialog"
// LOCAL-FIRST katmanı — dosya URL resolver'ı + IndexedDB dosya/proje depoları
import { mediaUrl, isLocalMediaId } from "@/lib/media-url"
import {
  initLocalFiles,
  useLocalFiles,
  uploadLocalFileToCloud,
} from "@/lib/local-files"
import { getLocalProject, putLocalProject } from "@/lib/local-db"
import { ClipAutomationOverlay } from "./clip-automation-overlay"
import { LyricsSidebar } from "./lyrics-sidebar"
import { VuMeter } from "./controls/vu-meter"
import {
  EditableTitle,
  SavedDot,
  HamburgerMenu,
  BpmKeyDisplay,
} from "./header/header-bits"

/**
 * Sentroy Studio — Musician (multitrack timeline) editor. FL Studio'nun
 * basit bir versiyonu: per-track audio clips, drag/move/split, master
 * transport, render-to-WAV (faz 2).
 *
 * MVP (bu iter):
 *   - Header: back / title / play/pause/stop / time / save status
 *   - Sol: tracks panel (her track için header + volume/pan/mute/solo)
 *   - Sağ: timeline ruler (saniye) + her track için yatay clip kanal
 *   - Library sidebar'ı: track listesinden bir sample sürükle → clip eklenir
 *   - Save tree (3s debounce, DJ ile aynı pattern)
 *
 * Sonraki iterasyonlar:
 *   - Clip resize/split/duplicate
 *   - Per-track FX + sends
 *   - Mic input recording
 *   - Render to WAV (offline rendering)
 */

const BASE_pxPerSec = 60
const BASE_trackHeight = 64
const TRACK_HEADER_WIDTH_DEFAULT = 200
const TRACK_HEADER_WIDTH_MIN = 80
const TRACK_HEADER_WIDTH_MAX = 380
const RULER_HEIGHT = 24
// Zoom min 0.05 → 3 px/sec; uzun setler (30+ dk) tek ekrana sığabilir.
// Eski 0.25 (15 px/sec) kullanıcı uzun timeline'larda fit edemiyordu.
const ZOOM_X_MIN = 0.05
const ZOOM_X_MAX = 8
const ZOOM_Y_MIN = 0.6
const ZOOM_Y_MAX = 3.5

export function MusicianEditor({
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
  const initialTree = useTreeOrDefault(data)
  const [tree, setTree] = useState<StudioMusicianProjectTree>(initialTree)
  const [revision, setRevision] = useState<number>(data?.revision ?? 0)
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle")
  const [isPlaying, setIsPlaying] = useState(false)
  const [transportSec, setTransportSec] = useState(0)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null)
  const [recElapsed, setRecElapsed] = useState(0)
  const [zoomX, setZoomX] = useState(1)
  const [zoomY, setZoomY] = useState(1)
  const [headerWidth, setHeaderWidth] = useState(TRACK_HEADER_WIDTH_DEFAULT)
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  // Multi-clip selection — Set of `${trackId}::${clipId}` keys. Cmd+click
  // toggle, Shift+click ekle, sade click sadece bunu seç, lane background
  // click veya Esc clear.
  const [selectedClipKeys, setSelectedClipKeys] = useState<Set<string>>(
    () => new Set()
  )
  // Ruler'da drag ile seçilen zaman aralığı — SANİYE cinsinden tutulur,
  // render'da pxPerSec ile px'e çevrilir (zoom değişse de doğru kalır).
  // L kısayolu veya banda tıklama tree.loopRegion'ı bu aralıktan set/clear
  // eder. Esc veya ruler'a sade tık temizler.
  const [rangeSelection, setRangeSelection] = useState<{
    start: number
    end: number
  } | null>(null)
  // Clipboard — Cmd+C ile snapshot; relative time aralıklarını koruyarak
  // Cmd+V ile playhead pozisyonuna paste edilir.
  const [clipClipboard, setClipClipboard] = useState<{
    clips: Array<{
      trackId: string
      clip: MusicianClip
    }>
    /** Snapshot anındaki en küçük startTime — paste'te referans alınır */
    minStart: number
  } | null>(null)
  // Snap-to-grid — clip drag/resize sırasında en yakın grid çizgisine
  // kenetlenir. snapEnabled false → free move. snapDivision: 1 = whole
  // note, 2 = half, 4 = 1/4 (default), 8 = 1/8, 16 = 1/16.
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapDivision, setSnapDivision] = useState<1 | 2 | 4 | 8 | 16>(4)
  // Auto-crossfade — aynı track'te overlap eden clip'lerde fade-out/in
  // otomatik uygulanır. User-set fadeIn/fadeOut korunur (override değil
  // max alınır). localStorage persist.
  const [autoCrossfade, setAutoCrossfade] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    const raw = window.localStorage.getItem("studio-auto-crossfade")
    return raw === null ? true : raw === "1"
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "studio-auto-crossfade",
        autoCrossfade ? "1" : "0"
      )
    } catch {}
  }, [autoCrossfade])

  // Component unmount cleanup — kullanıcı dashboard'a / başka sayfaya
  // geçtiğinde Tone.Transport hâlâ çalmaya devam ediyordu (global Tone
  // state musician-editor lifecycle'ı tamamen bilmediği için). Unmount'ta
  // transport durdurulur + pending schedule'lar temizlenir, böylece arka
  // planda ses çalmaya devam etmez.
  useEffect(() => {
    return () => {
      try {
        transportStop()
        transportClearSchedule()
      } catch {}
    }
  }, [])
  // Metronome state — Transport çalarken click sound, stop'ta sessiz
  const [metronomeEnabled, setMetronomeEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("studio-metronome") === "1"
  })
  // Automation edit mode — DAW standardı (Reaper "envelope view", Studio One
  // "automation lane"): default kapalı, açıkken clip waveform üzerine SVG
  // overlay görünür ve drag ile düzenlenebilir. Kapalıyken clip taşıma /
  // seçim normal akar (otomation çizgisi pointer event'leri yutmuyor).
  const [automationMode, setAutomationMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("studio-automation-mode") === "1"
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "studio-automation-mode",
        automationMode ? "1" : "0"
      )
    } catch {}
  }, [automationMode])
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "studio-metronome",
        metronomeEnabled ? "1" : "0"
      )
    } catch {}
  }, [metronomeEnabled])
  const snapSeconds = useMemo(
    () => (60 / project.bpm) * (4 / snapDivision),
    [project.bpm, snapDivision]
  )
  // patchClip + drag handler'lar için snap helper — yalnızca enabled iken
  // uygulanır.
  const snapTime = useCallback(
    (sec: number): number => {
      if (!snapEnabled || snapSeconds <= 0) return sec
      return Math.round(sec / snapSeconds) * snapSeconds
    },
    [snapEnabled, snapSeconds]
  )
  // Inspector multi-tab state — tabs[] + activeTabId. Aynı target için tab
  // duplicate açılmaz (addInspectorTab idempotent).
  const [inspectorTabs, setInspectorTabs] = useState<InspectorTab[]>([])
  const [activeInspectorTabId, setActiveInspectorTabId] = useState<
    string | null
  >(null)
  // Trim editör source decode cache — clip mediaId → seconds
  const [trimSourceDurations, setTrimSourceDurations] = useState<
    Record<string, number>
  >({})

  const addInspectorTab = useCallback((tab: InspectorTab) => {
    const id = tabKey(tab)
    setInspectorTabs((prev) => {
      if (prev.some((t) => tabKey(t) === id)) return prev
      return [...prev, tab]
    })
    setActiveInspectorTabId(id)
  }, [])

  const closeInspectorTab = useCallback((id: string) => {
    setInspectorTabs((prev) => {
      const next = prev.filter((t) => tabKey(t) !== id)
      // Aktif tab kapatılırsa komşusu aktif olsun
      setActiveInspectorTabId((current) => {
        if (current !== id) return current
        if (next.length === 0) return null
        // Kapatılan tab'ın index'ini bul, komşu seç (önce sağ, yoksa sol)
        const idx = prev.findIndex((t) => tabKey(t) === id)
        const neighbor = next[idx] ?? next[idx - 1] ?? next[0]
        return neighbor ? tabKey(neighbor) : null
      })
      return next
    })
  }, [])
  const pxPerSec = BASE_pxPerSec * zoomX
  const trackHeight = BASE_trackHeight * zoomY
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Persistent refs for ALWAYS-FRESH tree + revision ──────────────────
  // setTimeout callback closure'da kapanan eski state save'lemesin diye
  // ref tutuyoruz; doSave bunlardan okuyor.
  const treeRef = useRef(tree)
  const revisionRef = useRef(revision)
  useEffect(() => {
    treeRef.current = tree
  }, [tree])
  useEffect(() => {
    revisionRef.current = revision
  }, [revision])

  // ─── LOCAL-FIRST kayıt durumu ──────────────────────────────────────────
  // Proje tree'si DEFAULT olarak lokalde (IndexedDB) tutulur; cloudSync
  // açıksa kayıtlar sunucuya DA gider (lokal her zaman anlık yedek).
  const [cloudSync, setCloudSyncState] = useState(false)
  const cloudSyncRef = useRef(false)
  const setCloudSync = useCallback((v: boolean) => {
    cloudSyncRef.current = v
    setCloudSyncState(v)
  }, [])
  const [syncing, setSyncing] = useState(false)
  // IndexedDB hydration bitti mi — editor içeriği bunu bekleyerek render
  // edilir (lokal dosyaların objectURL registry'si + varsa lokal tree
  // yüklenmeden clip'ler yanlış URL fetch etmesin).
  const [localReady, setLocalReady] = useState(false)
  // Proje meta (title/bpm) — lokal proje kaydına güncel yazılsın diye ref.
  const localMetaRef = useRef({ title: project.title, bpm: project.bpm })

  /** Tree'yi lokal (IndexedDB) proje kaydına yaz — her save'de çağrılır. */
  const persistLocal = useCallback(
    async (currentTree: StudioMusicianProjectTree) => {
      try {
        await putLocalProject({
          projectId: project.id,
          companySlug,
          title: localMetaRef.current.title,
          mode: "musician",
          bpm: localMetaRef.current.bpm,
          tree: currentTree,
          cloudSync: cloudSyncRef.current,
          updatedAt: Date.now(),
        })
      } catch {
        // IndexedDB yok/yazılamadı — sessiz degrade (cloudSync açıksa
        // sunucu kaydı yine akar)
      }
    },
    [project.id, companySlug]
  )

  // Undo/redo history — labeled snapshot entries.
  // Drag/resize gibi rapid mutation'lar 400ms settle bekler → tek entry
  // (DEBOUNCE_PUSH_MS); aksi halde her micro-pixel'de patladığımız için
  // Cmd+Z 1-2 hareket geri gidip kalıyordu.
  interface HistoryEntry {
    label: string
    snapshot: StudioMusicianProjectTree
    ts: number
  }
  const historyRef = useRef<HistoryEntry[]>([])
  const futureRef = useRef<HistoryEntry[]>([])
  const HISTORY_LIMIT = 100
  const DEBOUNCE_PUSH_MS = 400
  // Pending push timer + last-label — settle window'da gelen aynı tipte
  // mutation history'yi şişirmesin diye.
  const pendingPushRef = useRef<{
    label: string
    snapshot: StudioMusicianProjectTree
    timerId: ReturnType<typeof setTimeout> | null
  } | null>(null)
  // History UI tick — hamburger History submenu re-render trigger (ref-bazlı
  // listenin değişimi React'e haber vermez, manual tick gerekir). Value
  // okunmuyor; setter re-render'ı tetikler → hamburger actions.history tazelenir.
  const [, setHistoryTick] = useState(0)
  const bumpHistory = useCallback(() => setHistoryTick((n) => n + 1), [])

  // ─── Save — LOCAL-FIRST ────────────────────────────────────────────────
  // Her save ÖNCE IndexedDB'ye yazar (anlık lokal yedek; sayfa yenilense de
  // geri gelir). Sunucu PUT'u YALNIZ cloudSync açıkken yapılır — default
  // kapalı, hamburger menüden "Cloud sync" ile açılır.
  const doSave = useCallback(async () => {
    const currentTree = treeRef.current
    const currentRev = revisionRef.current
    setSaveStatus("saving")
    await persistLocal(currentTree)
    if (!cloudSyncRef.current) {
      setSaveStatus("saved")
      return
    }
    try {
      const res = await fetch(
        `/api/companies/${companySlug}/studio/projects/${project.id}/tree`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tree: currentTree,
            expectedRevision: currentRev,
          }),
        }
      )
      if (!res.ok) {
        if (res.status === 409) {
          const err = await res.json().catch(() => null)
          const m = /server at (\d+)/.exec(err?.error ?? "")
          if (m) {
            const newRev = parseInt(m[1] ?? "0", 10)
            setRevision(newRev)
            revisionRef.current = newRev
            await doSave()
            return
          }
          setSaveStatus("error")
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      const nextRev = json.data?.revision ?? currentRev + 1
      setRevision(nextRev)
      revisionRef.current = nextRev
      setSaveStatus("saved")
    } catch (e) {
      setSaveStatus("error")
      toast.error(e instanceof Error ? e.message : "Save failed")
    }
  }, [companySlug, project.id, persistLocal])

  // ─── Tree mutation + debounced history push + debounced save ──────────
  //
  // History debounce mantığı:
  //   - Aynı label ile 400ms içinde gelen mutation'lar pendingPushRef'te
  //     "snapshot" olarak saklı kalır (BEFORE state); timer her tetikte
  //     resetlenir. Settle olunca tek bir history entry oluşturulur.
  //   - Farklı label gelirse pending entry hemen flush olur, yeni pending
  //     başlar. Bu sayede "drag move → resize" senaryosunda iki ayrı
  //     entry alırsın.
  const flushPendingHistory = useCallback(() => {
    const pending = pendingPushRef.current
    if (!pending) return
    if (pending.timerId) clearTimeout(pending.timerId)
    historyRef.current.push({
      label: pending.label,
      snapshot: pending.snapshot,
      ts: Date.now(),
    })
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
    pendingPushRef.current = null
    bumpHistory()
  }, [bumpHistory])

  const updateTree = useCallback(
    (
      mutator: (t: StudioMusicianProjectTree) => StudioMusicianProjectTree,
      label = "edit"
    ) => {
      setTree((t) => {
        const pending = pendingPushRef.current
        if (pending && pending.label === label) {
          // Aynı action devamı — timer reset, snapshot dokunulmaz (BEFORE
          // state ilk mutation öncesi tree)
          if (pending.timerId) clearTimeout(pending.timerId)
          pending.timerId = setTimeout(flushPendingHistory, DEBOUNCE_PUSH_MS)
        } else {
          // Farklı label → mevcut pending'i hemen flush, yeni pending başlat
          if (pending) flushPendingHistory()
          pendingPushRef.current = {
            label,
            snapshot: t,
            timerId: setTimeout(flushPendingHistory, DEBOUNCE_PUSH_MS),
          }
        }
        // Yeni mutation gelince redo zinciri geçersizleşir
        if (futureRef.current.length > 0) {
          futureRef.current = []
          bumpHistory()
        }
        return mutator(t)
      })
      setSaveStatus("dirty")
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        void doSave()
      }, 3000)
    },
    [bumpHistory, doSave, flushPendingHistory]
  )

  // ─── Undo / redo ──────────────────────────────────────────────────────
  const undo = useCallback(() => {
    // Pending varsa önce flush — son yarım hareketi de history'ye yazıp
    // pop'la (undo'nun en son edit'i geri alma garanti).
    flushPendingHistory()
    const entry = historyRef.current.pop()
    if (!entry) return
    setTree((current) => {
      futureRef.current.push({
        label: entry.label,
        snapshot: current,
        ts: Date.now(),
      })
      if (futureRef.current.length > HISTORY_LIMIT) futureRef.current.shift()
      return entry.snapshot
    })
    bumpHistory()
    setSaveStatus("dirty")
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void doSave(), 3000)
  }, [bumpHistory, doSave, flushPendingHistory])

  const redo = useCallback(() => {
    flushPendingHistory()
    const entry = futureRef.current.pop()
    if (!entry) return
    setTree((current) => {
      historyRef.current.push({
        label: entry.label,
        snapshot: current,
        ts: Date.now(),
      })
      if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
      return entry.snapshot
    })
    bumpHistory()
    setSaveStatus("dirty")
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void doSave(), 3000)
  }, [bumpHistory, doSave, flushPendingHistory])

  /**
   * Belirli history entry'ye rollback — current state'i future'a it,
   * o entry'den sonraki tüm history kayıtlarını future'a aktarır
   * (sıralı geri alma). UI history paneli kullanır.
   */
  const rollbackToHistory = useCallback(
    (entryIdx: number) => {
      flushPendingHistory()
      const target = historyRef.current[entryIdx]
      if (!target) return
      const popped = historyRef.current.splice(
        entryIdx,
        historyRef.current.length - entryIdx
      )
      // popped[0] = target, sonrası newer; current'i en sona future'a it
      setTree((current) => {
        // Eski sırayı koru — en yenisi future stack'in tepesinde olsun
        for (const e of [
          ...popped,
          { label: target.label, snapshot: current, ts: Date.now() },
        ].slice(1)) {
          futureRef.current.push(e)
          if (futureRef.current.length > HISTORY_LIMIT)
            futureRef.current.shift()
        }
        return target.snapshot
      })
      bumpHistory()
      setSaveStatus("dirty")
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => void doSave(), 3000)
    },
    [bumpHistory, doSave, flushPendingHistory]
  )

  // ─── Master sync: tree → engine ────────────────────────────────────────
  useEffect(() => {
    setMasterVolume(tree.master.volume)
  }, [tree.master.volume])

  // Loop region sync → Tone.Transport
  useEffect(() => {
    setTransportLoop(tree.loopRegion ?? null)
  }, [tree.loopRegion])

  // Metronome sync — toggle veya BPM/time-signature değişimi
  useEffect(() => {
    setMetronome({
      enabled: metronomeEnabled,
      bpm: project.bpm,
      beatsPerBar: project.timeSignature[0] ?? 4,
      volumeDb: -12,
    })
  }, [metronomeEnabled, project.bpm, project.timeSignature])

  useEffect(() => {
    // Track ensure + cleanup
    const wantedIds = new Set(tree.tracks.map((t) => t.id))
    // Solo mode aktifse (en az bir track soloed) → soloed olmayan track'ler
    // sustur. Studio One / DAW standardı: solo yalnız o track'i izole eder,
    // mute flag'ini override etmez ama signal path effective olarak sıfır.
    const anySoloed = tree.tracks.some((t) => t.soloed)
    for (const t of tree.tracks) {
      ensureTrack(t.id)
      const isAudible = anySoloed ? t.soloed && !t.muted : !t.muted
      setTrackVolume(t.id, isAudible ? t.volume : 0)
      setTrackPan(t.id, t.pan)
      setTrackMuted(t.id, !isAudible)
      // Full FX chain sync — engine shape-diff yapıp incremental param update
      // ya da full rebuild eder. effects[] sırası signal flow sırasıdır.
      setTrackFxChain(
        t.id,
        t.effects.map((fx) => ({
          id: fx.id,
          type: fx.type,
          enabled: fx.enabled,
          wet: fx.wet,
          params: fx.params,
        }))
      )
    }
    // Eksik track'ler için engineRemoveTrack: kullanmıyoruz çünkü
    // sadece tree değişiminde track silindiyse remove edilir. Basit
    // diff için sadece beklenen id seti dışındakileri engineRemoveTrack
    // ile siliyoruz (mevcut graph engine'den iterate edemiyoruz, basit
    // tree.tracks dışı ID için diff yapmak yerine v1 atlanır — tek
    // user, kısa session).
    void wantedIds
  }, [tree.tracks])

  // ─── Transport tick (rAF) ──────────────────────────────────────────────
  // transportSecRef: rAF-frekanslı transport pozisyonunu STABLE callback'lere
  // (örn. split-at-playhead) dep eklemeden okutmak için — aksi halde her
  // frame'de callback identity değişir ve memo'lu clip'ler boşa render olur.
  const transportSecRef = useRef(0)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const pos = getTransportPosition()
      transportSecRef.current = pos
      setTransportSec(pos)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Stable seek — ruler click + marker click + markers popover ortak yolu.
  const handleSeek = useCallback((s: number) => {
    transportSeek(s)
    transportSecRef.current = s
    setTransportSec(s)
  }, [])

  // ─── LOCAL-FIRST hydration (mount) ─────────────────────────────────────
  // 1. Lokal dosya store'unu yükle (objectURL registry — local- mediaId'ler
  //    çözülebilsin), 2. lokal proje kaydı varsa cloudSync bayrağını al ve
  //    tree'nin lokal sürümü daha güncelse onu kullan:
  //    - cloudSync KAPALI → lokal tree tek doğruluk kaynağı (sunucudaki eski
  //      snapshot olabilir)
  //    - cloudSync AÇIK  → timestamp karşılaştır (başka cihazda edit edilmiş
  //      olabilir; sunucu daha yeniyse sunucu kazanır)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await initLocalFiles(companySlug)
      } catch {}
      try {
        const rec = await getLocalProject(project.id)
        if (!cancelled && rec) {
          cloudSyncRef.current = rec.cloudSync
          setCloudSyncState(rec.cloudSync)
          const serverTs = data?.updatedAt
            ? new Date(data.updatedAt).getTime()
            : 0
          const localTree = rec.tree as StudioMusicianProjectTree | undefined
          const preferLocal =
            localTree &&
            localTree.mode === "musician" &&
            (!rec.cloudSync || rec.updatedAt > serverTs + 1500)
          if (preferLocal && localTree) {
            treeRef.current = localTree
            setTree(localTree)
          }
        }
      } catch {}
      if (!cancelled) setLocalReady(true)
    })()
    return () => {
      cancelled = true
    }
    // Mount-only — data/companySlug proje açılışında sabittir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  // ─── Master transport handlers ─────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    await ensureAudioStarted()
    transportClearSchedule()
    const currentTree = treeRef.current
    const referenceTime = getTransportPosition()
    for (const track of currentTree.tracks) {
      // Frozen track — orijinal clip'ler + FX chain bypass; tek frozen
      // sample 0'dan başlatılır (cached render zaten time-aligned).
      if (track.frozen) {
        const url = mediaUrl(track.frozen.mediaId)
        await scheduleClip(
          {
            clipId: `frozen-${track.id}`,
            trackId: track.id,
            url,
            startTime: 0,
            duration: track.frozen.duration,
            offset: 0,
            gain: 1,
            fadeIn: 0,
            fadeOut: 0,
          },
          referenceTime
        )
        continue
      }
      // Auto-crossfade için track içindeki clip'leri startTime'a göre
      // sırala, her clip için overlap-bazlı effective fade hesapla.
      const sortedClips = autoCrossfade
        ? [...track.clips].sort((a, b) => a.startTime - b.startTime)
        : track.clips
      for (let i = 0; i < sortedClips.length; i++) {
        const clip = sortedClips[i]!
        const fades = computeEffectiveFades(sortedClips, i, autoCrossfade)
        const url = mediaUrl(clip.mediaId)
        await scheduleClip(
          {
            clipId: clip.id,
            trackId: track.id,
            url,
            startTime: clip.startTime,
            duration: clip.duration,
            offset: clip.offset,
            gain: clip.gain,
            fadeIn: fades.fadeIn,
            fadeOut: fades.fadeOut,
            gainPoints: clip.gainPoints,
            playbackRate: clip.playbackRate,
            pitchShift: clip.pitchShift,
            reverseReverb: clip.reverseReverb,
          },
          referenceTime
        )
      }
    }
    await transportPlay()
    setIsPlaying(true)
  }, [tree.tracks, autoCrossfade])

  const handlePause = useCallback(() => {
    transportPause()
    setIsPlaying(false)
  }, [])

  const handleStop = useCallback(() => {
    transportStop()
    setIsPlaying(false)
    setTransportSec(0)
  }, [])

  // ─── Per-track FX chain patch (atomik replace) ─────────────────────────
  const setTrackEffects = useCallback(
    (trackId: string, next: MusicianEffect[]) => {
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) =>
            tr.id === trackId ? { ...tr, effects: next } : tr
          ),
        }),
        "FX chain edit"
      )
    },
    [updateTree]
  )

  // ─── Mic recording — per track ────────────────────────────────────────
  useEffect(() => {
    if (!recordingTrackId) return
    const startedAt = Date.now()
    const id = setInterval(
      () => setRecElapsed((Date.now() - startedAt) / 1000),
      100
    )
    return () => clearInterval(id)
  }, [recordingTrackId])

  const handleStartRec = useCallback(async (trackId: string) => {
    try {
      // Seçili giriş aygıtı (master strip → Audio devices) constraint olarak
      // geçilir; aygıt yoksa browser varsayılana düşer.
      const inputId = useAudioDevices.getState().inputId
      await startMicRecording(inputId || undefined)
      setRecordingTrackId(trackId)
      setRecElapsed(0)
      toast.info("Mic recording started — click ⏹ to stop")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Microphone access failed"
      )
    }
  }, [])

  const handleStopRec = useCallback(async () => {
    const trackId = recordingTrackId
    if (!trackId) return
    const startPos = transportSec
    const t = toast.loading("Saving recording…")
    try {
      const result = await stopMicRecording()
      setRecordingTrackId(null)
      if (!result) {
        toast.dismiss(t)
        return
      }
      const fileName = `Mic ${new Date().toISOString().slice(0, 19).replace("T", " ")}.${result.extension}`
      const file = new File([result.blob], fileName, { type: result.mimeType })
      // LOCAL-FIRST: cloudSync kapalıysa kayıt bu cihazda kalır (IndexedDB);
      // cloud sync açılınca diğer lokal dosyalarla birlikte migrate edilir.
      let mediaId: string
      let label: string
      if (!cloudSyncRef.current) {
        const metas = await useLocalFiles
          .getState()
          .addFiles([file], "recordings")
        const meta = metas[0]
        if (!meta) throw new Error("Local save failed")
        mediaId = meta.id
        label = meta.name
      } else {
        const form = new FormData()
        form.append("file", file)
        form.append("folder", "recordings")
        const res = await fetch(
          `/api/companies/${companySlug}/studio/assets`,
          {
            method: "POST",
            credentials: "include",
            body: form,
          }
        )
        if (!res.ok) throw new Error(`Upload HTTP ${res.status}`)
        const json = (await res.json()) as {
          data: { mediaId: string; originalName: string }
        }
        mediaId = json.data.mediaId
        label = json.data.originalName
      }
      const dur = recElapsed
      const clip: MusicianClip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mediaId,
        source: "user-bucket",
        startTime: startPos,
        duration: dur,
        offset: 0,
        gain: 1,
        fadeIn: 0,
        fadeOut: 0,
        label,
      }
      updateTree(
        (tr) => ({
          ...tr,
          tracks: tr.tracks.map((track) =>
            track.id === trackId
              ? { ...track, clips: [...track.clips, clip] }
              : track
          ),
        }),
        "Mic recording"
      )
      toast.success(`Recording added (${fmtTime(dur)})`, { id: t })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recording failed", {
        id: t,
      })
    }
  }, [recordingTrackId, transportSec, recElapsed, companySlug, updateTree])

  // ─── Export — format-aware ───────────────────────────────────────────
  // Persisted format choice — kullanıcı bir kez seçer, sonraki export'lar
  // varsayılan olarak aynı format'ı kullanır.
  const [exportFormat, setExportFormat] = useState<AudioFormat>(() => {
    if (typeof window === "undefined") return "wav"
    const raw = window.localStorage.getItem("studio-export-format")
    return raw === "mp3" || raw === "m4a" || raw === "wav" ? raw : "wav"
  })
  useEffect(() => {
    try {
      window.localStorage.setItem("studio-export-format", exportFormat)
    } catch {}
  }, [exportFormat])

  /**
   * Reusable export helper — `onlyTrackId` verilirse sadece o track render
   * edilir (per-track export), aksi halde soloed veya hepsi.
   * `format` override → format selector'dan veya `exportFormat` default.
   */
  const exportAudio = useCallback(
    async (opts?: {
      onlyTrackId?: string
      fileSuffix?: string
      format?: AudioFormat
    }) => {
      const onlyTrackId = opts?.onlyTrackId
      const format = opts?.format ?? exportFormat
      const meta = FORMAT_META[format]
      const sourceTracks = onlyTrackId
        ? tree.tracks.filter((t) => t.id === onlyTrackId)
        : tree.tracks
      const anyClip = sourceTracks.some((t) => t.clips.length > 0)
      if (!anyClip) {
        toast.error(
          onlyTrackId
            ? "This track has no clips"
            : "Nothing to export — add some clips first"
        )
        return
      }
      if (format === "m4a" && !isM4aSupported()) {
        toast.error("M4A requires Chrome/Edge — fallback to MP3")
        return
      }
      setExporting(true)
      const t = toast.loading(`Rendering ${meta.label}…`)
      try {
        let endSec = 0
        for (const track of sourceTracks) {
          if (track.frozen) {
            if (track.frozen.duration > endSec) endSec = track.frozen.duration
            continue
          }
          for (const clip of track.clips) {
            const e = clip.startTime + clip.duration
            if (e > endSec) endSec = e
          }
        }
        const totalSec = Math.max(1, endSec + 0.5)
        let renderSource = sourceTracks
        if (!onlyTrackId) {
          const soloed = tree.tracks.filter((tr) => tr.soloed)
          renderSource = soloed.length > 0 ? soloed : tree.tracks
        }
        const renderTracks = renderSource.map((track) => {
          // Frozen track → orijinal clips + effects bypass; tek frozen
          // sample 0'dan
          if (track.frozen) {
            return {
              trackId: track.id,
              muted: onlyTrackId ? false : track.muted,
              volume: track.volume,
              pan: track.pan,
              clips: [
                {
                  clipId: `frozen-${track.id}`,
                  url: mediaUrl(track.frozen.mediaId),
                  startTime: 0,
                  duration: track.frozen.duration,
                  offset: 0,
                  gain: 1,
                  fadeIn: 0,
                  fadeOut: 0,
                },
              ],
              effects: [],
            }
          }
          const sortedClips = autoCrossfade
            ? [...track.clips].sort((a, b) => a.startTime - b.startTime)
            : track.clips
          return {
            trackId: track.id,
            muted: onlyTrackId ? false : track.muted,
            volume: track.volume,
            pan: track.pan,
            clips: sortedClips.map((clip, i) => {
              const fades = computeEffectiveFades(sortedClips, i, autoCrossfade)
              return {
                clipId: clip.id,
                url: mediaUrl(clip.mediaId),
                startTime: clip.startTime,
                duration: clip.duration,
                offset: clip.offset,
                gain: clip.gain,
                fadeIn: fades.fadeIn,
                fadeOut: fades.fadeOut,
                gainPoints: clip.gainPoints,
                playbackRate: clip.playbackRate,
                pitchShift: clip.pitchShift,
              }
            }),
            effects: track.effects.map((fx) => ({
              id: fx.id,
              type: fx.type,
              enabled: fx.enabled,
              wet: fx.wet,
              params: fx.params,
            })),
          }
        })
        toast.loading(`Rendering ${meta.label}…`, { id: t })
        const buffer = await renderProject({
          masterVolume: tree.master.volume,
          totalDurationSec: totalSec,
          tracks: renderTracks,
        })
        toast.loading(`Encoding ${meta.label}…`, { id: t })
        const blob = await encodeAudio(buffer, format)
        const baseName = project.title.replace(/[^a-z0-9_\-]/gi, "_")
        const suffix = opts?.fileSuffix ? `-${opts.fileSuffix}` : ""
        const a = document.createElement("a")
        const url = URL.createObjectURL(blob)
        a.href = url
        a.download = `${baseName}${suffix}.${meta.ext}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`Exported ${fmtTime(totalSec)} ${meta.label}`, { id: t })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed", {
          id: t,
        })
      } finally {
        setExporting(false)
      }
    },
    [tree, project.title, exportFormat, autoCrossfade]
  )

  const handleExport = useCallback(() => exportAudio(), [exportAudio])

  // Karaoke video export'u için offline mix AudioBuffer — audio export ile
  // aynı renderProject yolu (Tone.Offline). Video frame'leri mediabunny ile
  // OFFLINE encode edildiğinden (real-time MediaRecorder DEĞİL) ses de offline
  // buffer olmalı; böylece uzun videolarda ~60s freeze yaşanmaz.
  const renderMixBuffer = useCallback(async (): Promise<AudioBuffer> => {
    const currentTree = treeRef.current
    let endSec = 0
    for (const track of currentTree.tracks) {
      if (track.frozen) {
        if (track.frozen.duration > endSec) endSec = track.frozen.duration
        continue
      }
      for (const clip of track.clips) {
        const e = clip.startTime + clip.duration
        if (e > endSec) endSec = e
      }
    }
    const totalSec = Math.max(1, endSec + 0.5)
    const soloed = currentTree.tracks.filter((tr) => tr.soloed)
    const renderSource = soloed.length > 0 ? soloed : currentTree.tracks
    const renderTracks = renderSource.map((track) => {
      if (track.frozen) {
        return {
          trackId: track.id,
          muted: track.muted,
          volume: track.volume,
          pan: track.pan,
          clips: [
            {
              clipId: `frozen-${track.id}`,
              url: mediaUrl(track.frozen.mediaId),
              startTime: 0,
              duration: track.frozen.duration,
              offset: 0,
              gain: 1,
              fadeIn: 0,
              fadeOut: 0,
            },
          ],
          effects: [],
        }
      }
      const sortedClips = autoCrossfade
        ? [...track.clips].sort((a, b) => a.startTime - b.startTime)
        : track.clips
      return {
        trackId: track.id,
        muted: track.muted,
        volume: track.volume,
        pan: track.pan,
        clips: sortedClips.map((clip, i) => {
          const fades = computeEffectiveFades(sortedClips, i, autoCrossfade)
          return {
            clipId: clip.id,
            url: mediaUrl(clip.mediaId),
            startTime: clip.startTime,
            duration: clip.duration,
            offset: clip.offset,
            gain: clip.gain,
            fadeIn: fades.fadeIn,
            fadeOut: fades.fadeOut,
            gainPoints: clip.gainPoints,
            playbackRate: clip.playbackRate,
            pitchShift: clip.pitchShift,
          }
        }),
        effects: track.effects.map((fx) => ({
          id: fx.id,
          type: fx.type,
          enabled: fx.enabled,
          wet: fx.wet,
          params: fx.params,
        })),
      }
    })
    return renderProject({
      masterVolume: currentTree.master.volume,
      totalDurationSec: totalSec,
      tracks: renderTracks,
    })
  }, [autoCrossfade])

  // ─── Track CRUD ────────────────────────────────────────────────────────
  const addTrack = useCallback(() => {
    const id = `track-${Date.now()}`
    const newTrack: MusicianTrack = {
      id,
      name: `Audio ${tree.tracks.length + 1}`,
      color:
        TRACK_COLORS[tree.tracks.length % TRACK_COLORS.length] ?? "#a855f7",
      muted: false,
      soloed: false,
      volume: 0.85,
      pan: 0,
      clips: [],
      effects: [],
    }
    updateTree((t) => ({ ...t, tracks: [...t.tracks, newTrack] }), "Add track")
  }, [tree.tracks.length, updateTree])

  const removeTrack = useCallback(
    (trackId: string) => {
      engineRemoveTrack(trackId)
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.filter((tr) => tr.id !== trackId),
        }),
        "Delete track"
      )
    },
    [updateTree]
  )

  const patchTrack = useCallback(
    (trackId: string, patch: Partial<MusicianTrack>) => {
      // Label patch key'lerine göre — volume slider drag aynı label'da
      // batched kalır, name düzenleme harf bazında ayrı kayıt olmaz, vb.
      const keys = Object.keys(patch).sort().join(",")
      const label =
        keys === "volume"
          ? `Volume ${trackId.slice(-4)}`
          : keys === "pan"
            ? `Pan ${trackId.slice(-4)}`
            : keys === "name"
              ? `Rename ${trackId.slice(-4)}`
              : keys === "color"
                ? `Color ${trackId.slice(-4)}`
                : keys === "muted"
                  ? `Mute toggle ${trackId.slice(-4)}`
                  : keys === "soloed"
                    ? `Solo toggle ${trackId.slice(-4)}`
                    : `Track edit ${trackId.slice(-4)}`
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) =>
            tr.id === trackId ? { ...tr, ...patch } : tr
          ),
        }),
        label
      )
    },
    [updateTree]
  )

  // ─── Clip yerleştirme — tek/çoklu, satır satır ─────────────────────────
  // items[0] bırakılan track'e, sonrakiler ALTINDAKİ track'lere aynı
  // startTime ile yerleşir; satır yetmezse gereken kadar yeni track açılır
  // (mevcut makeDefaultTrack + TRACK_COLORS yolu). Tek mutation = tek
  // history entry + tek debounced save.
  const insertClipsAcrossTracks = useCallback(
    (
      anchorTrackId: string,
      startTime: number,
      items: Array<{
        mediaId: string
        label?: string
        duration?: number | null
      }>
    ) => {
      if (items.length === 0) return
      updateTree(
        (t) => {
          const idx = t.tracks.findIndex((tr) => tr.id === anchorTrackId)
          if (idx === -1) return t
          let tracks = [...t.tracks]
          // Yeterli satır yoksa yeni track'ler yarat
          const needed = idx + items.length - tracks.length
          for (let i = 0; i < needed; i++) {
            tracks.push(
              makeDefaultTrack(
                `track-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                `Audio ${tracks.length + 1}`,
                TRACK_COLORS[tracks.length % TRACK_COLORS.length] ?? "#a855f7"
              )
            )
          }
          tracks = tracks.map((tr, i) => {
            const itemIdx = i - idx
            if (itemIdx < 0 || itemIdx >= items.length) return tr
            const item = items[itemIdx]!
            // Duration payload'da yoksa fallback 10s (resize ile düzeltilir)
            const duration =
              typeof item.duration === "number" && item.duration > 0
                ? item.duration
                : 10
            const clip: MusicianClip = {
              id: `clip-${Date.now()}-${itemIdx}-${Math.random().toString(36).slice(2, 6)}`,
              mediaId: item.mediaId,
              source: "user-bucket",
              startTime,
              duration,
              offset: 0,
              gain: 1,
              fadeIn: 0,
              fadeOut: 0,
              label: item.label,
            }
            return { ...tr, clips: [...tr.clips, clip] }
          })
          return { ...t, tracks }
        },
        items.length === 1
          ? `Add clip "${items[0]!.label ?? "clip"}"`
          : `Add ${items.length} clips`
      )
    },
    [updateTree]
  )

  // ─── Drop sample into a track (library sidebar drag) ──────────────────
  // Payload çoklu seçim taşıyorsa (items[]) her dosya ayrı track satırına;
  // tek dosya davranışı değişmez.
  const handleDropOnTrack = useCallback(
    (
      trackId: string,
      e: React.DragEvent<HTMLDivElement>,
      timelineEl: HTMLDivElement
    ) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData(LIBRARY_DRAG_MIME)
      if (!raw) return
      try {
        const payload = JSON.parse(raw) as LibraryDragPayload
        const rect = timelineEl.getBoundingClientRect()
        const rawStart = Math.max(
          0,
          (e.clientX - rect.left + timelineEl.scrollLeft) / pxPerSec
        )
        const startTime = snapTime(rawStart)
        const items =
          payload.items && payload.items.length > 0 ? payload.items : [payload]
        insertClipsAcrossTracks(trackId, startTime, items)
        toast.success(
          items.length === 1
            ? `Added "${items[0]!.label}"`
            : `Added ${items.length} clips — one per track`
        )
      } catch {
        toast.error("Drop data unreadable")
      }
    },
    [insertClipsAcrossTracks, snapTime, pxPerSec]
  )

  // ─── Finder → TIMELINE direkt drop ─────────────────────────────────────
  // OS'tan bırakılan dosyalar library'nin AÇIK klasörüne local-first import
  // edilir + bırakılan zaman/track'ten itibaren satır satır klip olur.
  const handleDropFilesOnTrack = useCallback(
    async (
      trackId: string,
      e: React.DragEvent<HTMLDivElement>,
      timelineEl: HTMLDivElement
    ) => {
      // FileList snapshot'ı + koordinatlar SENKRON alınır (ilk await'ten
      // önce) — DataTransfer event sonrası güvenilir değildir.
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("audio/")
      )
      if (files.length === 0) {
        toast.error("Audio files only")
        return
      }
      const rect = timelineEl.getBoundingClientRect()
      const rawStart = Math.max(
        0,
        (e.clientX - rect.left + timelineEl.scrollLeft) / pxPerSec
      )
      const startTime = snapTime(rawStart)
      const t = toast.loading(
        `Importing ${files.length} file${files.length === 1 ? "" : "s"}…`
      )
      try {
        const metas = await useLocalFiles
          .getState()
          .addFiles(files, getLibraryTargetFolder())
        insertClipsAcrossTracks(
          trackId,
          startTime,
          metas.map((m) => ({
            mediaId: m.id,
            label: m.name,
            duration: m.durationSec,
          }))
        )
        toast.success(
          metas.length === 1
            ? `Imported and placed "${metas[0]!.name}"`
            : `Imported ${metas.length} files — one per track`,
          { id: t }
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed", {
          id: t,
        })
      }
    },
    [pxPerSec, snapTime, insertClipsAcrossTracks]
  )

  const removeClip = useCallback(
    (trackId: string, clipId: string) => {
      engineRemoveClip(trackId, clipId)
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) =>
            tr.id === trackId
              ? { ...tr, clips: tr.clips.filter((c) => c.id !== clipId) }
              : tr
          ),
        }),
        "Delete clip"
      )
    },
    [updateTree]
  )

  /** Clip pozisyon/duration/offset patch — drag move + resize için. */
  const patchClip = useCallback(
    (trackId: string, clipId: string, patch: Partial<MusicianClip>) => {
      // Snap uygula — startTime ve duration için en yakın grid noktasına;
      // free drag istiyorsanız header'da snap toggle'ı kapatın.
      const snappedPatch: Partial<MusicianClip> = { ...patch }
      if (typeof patch.startTime === "number") {
        snappedPatch.startTime = Math.max(0, snapTime(patch.startTime))
      }
      if (typeof patch.duration === "number") {
        const snapped = snapTime(patch.duration)
        snappedPatch.duration = Math.max(0.1, snapped)
      }
      const keys = Object.keys(patch).sort().join(",")
      const label =
        keys === "startTime"
          ? `Move clip ${clipId.slice(-4)}`
          : keys === "duration"
            ? `Resize clip ${clipId.slice(-4)}`
            : keys === "fadeIn"
              ? `Fade-in ${clipId.slice(-4)}`
              : keys === "fadeOut"
                ? `Fade-out ${clipId.slice(-4)}`
                : `Clip edit ${clipId.slice(-4)}`
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) =>
            tr.id === trackId
              ? {
                  ...tr,
                  clips: tr.clips.map((c) =>
                    c.id === clipId ? { ...c, ...snappedPatch } : c
                  ),
                }
              : tr
          ),
        }),
        label
      )
    },
    [updateTree, snapTime]
  )

  /**
   * Clip'i fromTrack'ten kaldırıp toTrack'e ekle (startTime + diğer
   * meta korunur). Cross-track drag drop sırasında çağrılır.
   * Engine'de scheduling sonraki transport.play'de reset olur — bu
   * iter'de in-place track switch sırasında ses kesilmez (loop'u önce
   * stop edip tekrar play kullanıcının elinde).
   */
  const duplicateClip = useCallback(
    (trackId: string, clipId: string) => {
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) => {
            if (tr.id !== trackId) return tr
            const clip = tr.clips.find((c) => c.id === clipId)
            if (!clip) return tr
            const copy: MusicianClip = {
              ...clip,
              id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              startTime: clip.startTime + clip.duration,
            }
            return { ...tr, clips: [...tr.clips, copy] }
          }),
        }),
        "Duplicate clip"
      )
    },
    [updateTree]
  )

  const splitClipAt = useCallback(
    (trackId: string, clipId: string, atSec: number) => {
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) =>
            tr.id === trackId
              ? {
                  ...tr,
                  clips: tr.clips.flatMap((c) => {
                    if (c.id !== clipId) return [c]
                    const end = c.startTime + c.duration
                    if (atSec <= c.startTime + 0.05 || atSec >= end - 0.05)
                      return [c]
                    const leftDur = atSec - c.startTime
                    const rightDur = end - atSec
                    return [
                      { ...c, duration: leftDur },
                      {
                        ...c,
                        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        startTime: atSec,
                        duration: rightDur,
                        offset: c.offset + leftDur,
                      },
                    ]
                  }),
                }
              : tr
          ),
        }),
        "Split clip"
      )
    },
    [updateTree]
  )

  const duplicateTrack = useCallback(
    (trackId: string) => {
      updateTree((t) => {
        const track = t.tracks.find((tr) => tr.id === trackId)
        if (!track) return t
        const newId = `track-${Date.now()}`
        const copy: MusicianTrack = {
          ...track,
          id: newId,
          name: `${track.name} copy`,
          clips: track.clips.map((c) => ({
            ...c,
            id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          })),
        }
        return { ...t, tracks: [...t.tracks, copy] }
      }, "Duplicate track")
    },
    [updateTree]
  )

  /**
   * Track listesini yeniden sırala — dnd-kit sortable callback'i.
   * fromIdx / toIdx visual sıraya göre; tree.tracks dizisini yeniden
   * yapılandırır. Engine'de sıra önemli değil (her track izole signal
   * chain'e sahip), sadece UI ve render-order için.
   */
  // ─── Loop region + markers mutator'ları ───────────────────────────────
  // ─── Project metadata patch ───────────────────────────────────────────
  // Project title / BPM / time signature / musical key / scale değişimi
  // için. Optimistic state update + PATCH /api/.../projects/[id]
  const [localProject, setLocalProject] = useState<StudioProject>(project)
  useEffect(() => {
    setLocalProject(project)
  }, [project])
  // Lokal proje kaydına güncel title/bpm yazılsın (persistLocal ref okur)
  useEffect(() => {
    localMetaRef.current = {
      title: localProject.title,
      bpm: localProject.bpm,
    }
  }, [localProject.title, localProject.bpm])
  const patchProjectMeta = useCallback(
    async (
      patch: Partial<{
        title: string
        bpm: number
        timeSignature: [number, number]
        musicalKey: string | undefined
        musicalScale: "major" | "minor"
      }>
    ) => {
      setLocalProject((p) => ({ ...p, ...patch }) as StudioProject)
      try {
        const res = await fetch(
          `/api/companies/${companySlug}/studio/projects/${project.id}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => null)
          throw new Error(err?.error ?? `HTTP ${res.status}`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Project meta save failed")
        // Rollback on failure
        setLocalProject(project)
      }
    },
    [companySlug, project]
  )

  const setLoopRegion = useCallback(
    (region: { start: number; end: number; enabled: boolean } | null) => {
      updateTree(
        (t) => ({ ...t, loopRegion: region ?? undefined }),
        "Loop region"
      )
    },
    [updateTree]
  )

  /**
   * Ruler aralık seçiminden loop toggle — DAW standardı:
   *   - Seçim varken L (veya banda tıklama): loop'u seçimden set eder.
   *   - Loop zaten aynı aralıkta aktifse: loop'u kaldırır (set/clear toggle).
   * Transport senkronu tree.loopRegion effect'i üzerinden otomatik akar.
   */
  const toggleLoopFromSelection = useCallback(() => {
    const sel = rangeSelection
    if (!sel || sel.end - sel.start < 0.01) return
    const lr = tree.loopRegion
    const eps = 0.001
    if (
      lr?.enabled &&
      Math.abs(lr.start - sel.start) < eps &&
      Math.abs(lr.end - sel.end) < eps
    ) {
      setLoopRegion(null)
    } else {
      setLoopRegion({ start: sel.start, end: sel.end, enabled: true })
    }
  }, [rangeSelection, tree.loopRegion, setLoopRegion])

  const addMarker = useCallback(
    (time: number, label?: string) => {
      const id = `mk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      updateTree((t) => {
        const list = t.markers ?? []
        const idx = list.length + 1
        return {
          ...t,
          markers: [
            ...list,
            {
              id,
              time: Math.max(0, time),
              label: label ?? `M${idx}`,
            },
          ].sort((a, b) => a.time - b.time),
        }
      }, "Add marker")
    },
    [updateTree]
  )

  const patchMarker = useCallback(
    (
      id: string,
      patch: Partial<{ time: number; label: string; color: string | undefined }>
    ) => {
      updateTree(
        (t) => ({
          ...t,
          markers: (t.markers ?? [])
            .map((m) => (m.id === id ? { ...m, ...patch } : m))
            .sort((a, b) => a.time - b.time),
        }),
        "Marker edit"
      )
    },
    [updateTree]
  )

  const removeMarker = useCallback(
    (id: string) => {
      updateTree(
        (t) => ({
          ...t,
          markers: (t.markers ?? []).filter((m) => m.id !== id),
        }),
        "Delete marker"
      )
    },
    [updateTree]
  )

  // ─── Clip selection helpers ───────────────────────────────────────────
  const clipKey = useCallback(
    (trackId: string, clipId: string) => `${trackId}::${clipId}`,
    []
  )

  const handleClipSelect = useCallback(
    (trackId: string, clipId: string, mode: "single" | "toggle" | "add") => {
      const key = clipKey(trackId, clipId)
      setSelectedClipKeys((prev) => {
        if (mode === "toggle") {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        }
        if (mode === "add") {
          if (prev.has(key)) return prev
          const next = new Set(prev)
          next.add(key)
          return next
        }
        // single
        return new Set([key])
      })
    },
    [clipKey]
  )

  const clearClipSelection = useCallback(() => {
    setSelectedClipKeys((prev) => (prev.size === 0 ? prev : new Set()))
  }, [])

  // Tree değişince (örn. undo/clip silindi) hayalet selection key'leri temizle
  useEffect(() => {
    setSelectedClipKeys((prev) => {
      if (prev.size === 0) return prev
      let dirty = false
      const next = new Set<string>()
      const validKeys = new Set<string>()
      for (const tr of tree.tracks) {
        for (const c of tr.clips) {
          validKeys.add(clipKey(tr.id, c.id))
        }
      }
      for (const k of prev) {
        if (validKeys.has(k)) next.add(k)
        else dirty = true
      }
      return dirty ? next : prev
    })
  }, [tree.tracks, clipKey])

  // Bulk move — drag eden clip için patchClip çağrılırken aynı delta'yı
  // tüm seçili clip'lere uygula. Selection sadece tek clip içeriyorsa
  // normal patchClip akar (ekstra iş yok).
  const bulkMoveByDelta = useCallback(
    (anchorTrackId: string, anchorClipId: string, deltaSec: number) => {
      const anchorKey = clipKey(anchorTrackId, anchorClipId)
      if (!selectedClipKeys.has(anchorKey) || selectedClipKeys.size <= 1)
        return false
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) => ({
            ...tr,
            clips: tr.clips.map((c) => {
              const k = clipKey(tr.id, c.id)
              if (!selectedClipKeys.has(k)) return c
              if (k === anchorKey) return c // anchor patchClip ile zaten güncellendi
              return {
                ...c,
                startTime: Math.max(0, c.startTime + deltaSec),
              }
            }),
          })),
        }),
        `Bulk move ${selectedClipKeys.size}`
      )
      return true
    },
    [selectedClipKeys, clipKey, updateTree]
  )

  // Bulk delete — seçili tüm clip'leri sil
  const bulkDeleteSelected = useCallback(() => {
    if (selectedClipKeys.size === 0) return
    const keys = selectedClipKeys
    updateTree(
      (t) => ({
        ...t,
        tracks: t.tracks.map((tr) => ({
          ...tr,
          clips: tr.clips.filter((c) => !keys.has(clipKey(tr.id, c.id))),
        })),
      }),
      `Delete ${selectedClipKeys.size} clip${selectedClipKeys.size === 1 ? "" : "s"}`
    )
    // Engine cleanup
    for (const k of keys) {
      const [tid, cid] = k.split("::")
      if (tid && cid) engineRemoveClip(tid, cid)
    }
    setSelectedClipKeys(new Set())
  }, [selectedClipKeys, clipKey, updateTree])

  // Copy — seçili clip'leri snapshot
  const copySelectedClips = useCallback(() => {
    if (selectedClipKeys.size === 0) return false
    const snap: Array<{ trackId: string; clip: MusicianClip }> = []
    let minStart = Infinity
    for (const tr of tree.tracks) {
      for (const c of tr.clips) {
        if (selectedClipKeys.has(clipKey(tr.id, c.id))) {
          snap.push({ trackId: tr.id, clip: c })
          if (c.startTime < minStart) minStart = c.startTime
        }
      }
    }
    if (snap.length === 0) return false
    setClipClipboard({ clips: snap, minStart })
    toast.success(`Copied ${snap.length} clip${snap.length === 1 ? "" : "s"}`)
    return true
  }, [tree.tracks, selectedClipKeys, clipKey])

  // Paste — playhead'e (transportSec referans). Clip'lerin orijinal
  // göreceli mesafeleri korunur (snap dahil otomatik patchClip pipeline'ına
  // sokmuyoruz — paste atomik, snap drag sırasındaki davranışı için ayrı).
  const pasteClipboard = useCallback(() => {
    if (!clipClipboard || clipClipboard.clips.length === 0) return
    const offset = transportSec - clipClipboard.minStart
    const newKeys = new Set<string>()
    updateTree(
      (t) => ({
        ...t,
        tracks: t.tracks.map((tr) => {
          const newClips: MusicianClip[] = []
          for (const entry of clipClipboard.clips) {
            if (entry.trackId !== tr.id) continue
            const newId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            newClips.push({
              ...entry.clip,
              id: newId,
              startTime: Math.max(0, entry.clip.startTime + offset),
            })
            newKeys.add(clipKey(tr.id, newId))
          }
          if (newClips.length === 0) return tr
          return { ...tr, clips: [...tr.clips, ...newClips] }
        }),
      }),
      `Paste ${clipClipboard.clips.length}`
    )
    setSelectedClipKeys(newKeys)
    toast.success(
      `Pasted ${clipClipboard.clips.length} clip${clipClipboard.clips.length === 1 ? "" : "s"}`
    )
  }, [clipClipboard, transportSec, updateTree, clipKey])

  // ─── Track group mutators ─────────────────────────────────────────────
  const addGroup = useCallback(
    (name?: string) => {
      const id = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const palette = [
        "#ec4899",
        "#06b6d4",
        "#eab308",
        "#22c55e",
        "#a855f7",
        "#f97316",
      ]
      const usedCount = (tree.groups ?? []).length
      const color = palette[usedCount % palette.length] ?? "#a855f7"
      updateTree(
        (t) => ({
          ...t,
          groups: [
            ...(t.groups ?? []),
            {
              id,
              name: name?.trim() || `Group ${usedCount + 1}`,
              color,
              collapsed: false,
            },
          ],
        }),
        "Add group"
      )
      return id
    },
    [tree.groups, updateTree]
  )

  const removeGroup = useCallback(
    (groupId: string) => {
      // Grup silindiyse üyelerin groupId'sini boşalt — track'ler korunur
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) =>
            tr.groupId === groupId ? { ...tr, groupId: undefined } : tr
          ),
          groups: (t.groups ?? []).filter((g) => g.id !== groupId),
        }),
        "Delete group"
      )
    },
    [updateTree]
  )

  const patchGroup = useCallback(
    (
      groupId: string,
      patch: Partial<{ name: string; color: string; collapsed: boolean }>
    ) => {
      const keys = Object.keys(patch).sort().join(",")
      const label =
        keys === "collapsed"
          ? `Group collapse`
          : keys === "name"
            ? `Rename group`
            : keys === "color"
              ? `Group color`
              : `Group edit`
      updateTree(
        (t) => ({
          ...t,
          groups: (t.groups ?? []).map((g) =>
            g.id === groupId ? { ...g, ...patch } : g
          ),
        }),
        label
      )
    },
    [updateTree]
  )

  const setTrackGroup = useCallback(
    (trackId: string, groupId: string | undefined) => {
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) =>
            tr.id === trackId ? { ...tr, groupId } : tr
          ),
        }),
        groupId ? "Add track to group" : "Remove track from group"
      )
    },
    [updateTree]
  )

  // ─── Bounce / freeze track ─────────────────────────────────────────────
  const freezeTrack = useCallback(
    async (trackId: string) => {
      const track = tree.tracks.find((t) => t.id === trackId)
      if (!track) return
      if (track.frozen) {
        toast.info("Track already frozen — unfreeze first to re-render")
        return
      }
      if (track.clips.length === 0) {
        toast.error("Empty track — nothing to freeze")
        return
      }
      // Track içeriğini offline render et (effects dahil)
      const t = toast.loading(`Freezing ${track.name}…`)
      try {
        let endSec = 0
        for (const clip of track.clips) {
          const e = clip.startTime + clip.duration
          if (e > endSec) endSec = e
        }
        const totalSec = Math.max(1, endSec + 0.5)
        const sortedClips = autoCrossfade
          ? [...track.clips].sort((a, b) => a.startTime - b.startTime)
          : track.clips
        const renderTrack = {
          trackId: track.id,
          // Mute/solo ignore — freeze tek-track snapshot, raw render
          muted: false,
          volume: 1, // Volume freeze'de 1 — kullanıcı sonradan track.volume ile düzenleyebilir
          pan: 0, // Pan da nötr; track-level pan post-freeze
          clips: sortedClips.map((clip, i) => {
            const fades = computeEffectiveFades(sortedClips, i, autoCrossfade)
            return {
              clipId: clip.id,
              url: mediaUrl(clip.mediaId),
              startTime: clip.startTime,
              duration: clip.duration,
              offset: clip.offset,
              gain: clip.gain,
              fadeIn: fades.fadeIn,
              fadeOut: fades.fadeOut,
              gainPoints: clip.gainPoints,
              playbackRate: clip.playbackRate,
              pitchShift: clip.pitchShift,
            }
          }),
          effects: track.effects.map((fx) => ({
            id: fx.id,
            type: fx.type,
            enabled: fx.enabled,
            wet: fx.wet,
            params: fx.params,
          })),
        }
        toast.loading(`Rendering ${track.name}…`, { id: t })
        const buffer = await renderProject({
          masterVolume: 1,
          totalDurationSec: totalSec,
          tracks: [renderTrack],
        })
        toast.loading(`Encoding WAV…`, { id: t })
        const wav = await encodeAudio(buffer, "wav")
        const file = new File(
          [wav],
          `${track.name.replace(/[^a-z0-9_\-]/gi, "_")}-frozen.wav`,
          { type: "audio/wav" }
        )
        // LOCAL-FIRST: cloudSync kapalıysa frozen render bu cihazda kalır
        // (IndexedDB); cloud sync açılınca migrate edilir.
        let frozenMediaId: string
        if (!cloudSyncRef.current) {
          toast.loading(`Saving locally…`, { id: t })
          const metas = await useLocalFiles
            .getState()
            .addFiles([file], "frozen")
          const meta = metas[0]
          if (!meta) throw new Error("Local save failed")
          frozenMediaId = meta.id
        } else {
          toast.loading(`Uploading…`, { id: t })
          const form = new FormData()
          form.append("file", file)
          form.append("folder", "frozen")
          const res = await fetch(
            `/api/companies/${companySlug}/studio/assets`,
            {
              method: "POST",
              credentials: "include",
              body: form,
            }
          )
          if (!res.ok) throw new Error(`Upload HTTP ${res.status}`)
          const json = (await res.json()) as { data: { mediaId: string } }
          frozenMediaId = json.data.mediaId
        }
        updateTree(
          (cur) => ({
            ...cur,
            tracks: cur.tracks.map((tr) =>
              tr.id === trackId
                ? {
                    ...tr,
                    frozen: {
                      mediaId: frozenMediaId,
                      duration: totalSec,
                      frozenAt: new Date().toISOString(),
                    },
                  }
                : tr
            ),
          }),
          "Freeze track"
        )
        toast.success(`Frozen ${track.name} (${fmtTime(totalSec)})`, {
          id: t,
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Freeze failed", {
          id: t,
        })
      }
    },
    [tree.tracks, autoCrossfade, companySlug, updateTree]
  )

  const unfreezeTrack = useCallback(
    (trackId: string) => {
      // Sadece flag temizle — frozen mediaId storage'da kalır (re-freeze
      // gerekirse aynı dosyaya yazılmaz, yeni upload olur; cache cleanup
      // ayrı epic). Bu kullanıcı için "geri orijinale dön" UX'idir.
      updateTree(
        (t) => ({
          ...t,
          tracks: t.tracks.map((tr) =>
            tr.id === trackId ? { ...tr, frozen: undefined } : tr
          ),
        }),
        "Unfreeze track"
      )
    },
    [updateTree]
  )

  const reorderTracks = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx) return
      updateTree((t) => {
        if (
          fromIdx < 0 ||
          fromIdx >= t.tracks.length ||
          toIdx < 0 ||
          toIdx >= t.tracks.length
        )
          return t
        const next = [...t.tracks]
        const [item] = next.splice(fromIdx, 1)
        if (!item) return t
        next.splice(toIdx, 0, item)
        return { ...t, tracks: next }
      }, "Reorder tracks")
    },
    [updateTree]
  )

  const moveClipToTrack = useCallback(
    (fromTrackId: string, toTrackId: string, clipId: string) => {
      if (fromTrackId === toTrackId) return
      updateTree((t) => {
        const fromTrack = t.tracks.find((tr) => tr.id === fromTrackId)
        const clip = fromTrack?.clips.find((c) => c.id === clipId)
        if (!clip) return t
        return {
          ...t,
          tracks: t.tracks.map((tr) => {
            if (tr.id === fromTrackId) {
              return { ...tr, clips: tr.clips.filter((c) => c.id !== clipId) }
            }
            if (tr.id === toTrackId) {
              return { ...tr, clips: [...tr.clips, clip] }
            }
            return tr
          }),
        }
      }, "Move to track")
    },
    [updateTree]
  )

  /**
   * Clip split — playhead pozisyonunda iki parçaya böl. S klavye
   * kısayolu veya context menu. Yeni clip aynı track'te, ikinci
   * yarı için offset = original.offset + (cutPoint - original.start).
   */
  const splitClipAtPlayhead = useCallback(() => {
    const cutAt = transportSec
    let didSplit = false
    updateTree(
      (t) => ({
        ...t,
        tracks: t.tracks.map((tr) => ({
          ...tr,
          clips: tr.clips.flatMap((c) => {
            const end = c.startTime + c.duration
            if (cutAt <= c.startTime + 0.05 || cutAt >= end - 0.05) return [c]
            didSplit = true
            const leftDur = cutAt - c.startTime
            const rightDur = end - cutAt
            return [
              { ...c, duration: leftDur },
              {
                ...c,
                id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                startTime: cutAt,
                duration: rightDur,
                offset: c.offset + leftDur,
              },
            ]
          }),
        })),
      }),
      "Split at playhead"
    )
    if (didSplit) toast.success(`Split at ${fmtTime(cutAt)}`)
  }, [transportSec, updateTree])

  // Tek clip'i playhead pozisyonunda böl — ClipBlock context menüsünden.
  // transportSecRef ile okunur; transportSec dep'i olsaydı her rAF frame'de
  // yeni identity üretilir, memo'lu ClipBlock'lar sürekli re-render olurdu.
  const splitClipAtTransport = useCallback(
    (trackId: string, clipId: string) => {
      splitClipAt(trackId, clipId, transportSecRef.current)
    },
    [splitClipAt]
  )

  // Tape stop — transient engine action + toast. JSX'te inline lambda yerine
  // stable callback (memo'lu ClipBlock'lara identity-stable geçsin diye).
  const handleTapeStopClip = useCallback(
    (trackId: string, clipId: string, durationSec: number) => {
      triggerTapeStop(trackId, clipId, durationSec)
      toast.success(`Tape stop · ${durationSec.toFixed(1)}s spin-down`)
    },
    []
  )

  // Clip trim editörünü inspector tab olarak aç — stable identity.
  const handleEnterClipEdit = useCallback(
    (trackId: string, clipId: string) => {
      addInspectorTab({ type: "trim", trackId, clipId })
    },
    [addInspectorTab]
  )

  // ─── Cloud sync — lokal dosya migrate + tree sunucu kaydı ──────────────
  const localItems = useLocalFiles((s) => s.items)

  // Projede KULLANILAN ve hâlâ bu cihazda blob'u olan lokal dosyalar —
  // hamburger "Upload local files (N)" sayacı.
  const usedLocalFileIds = useMemo(() => {
    const active = new Set(localItems.map((i) => i.id))
    const out: string[] = []
    const seen = new Set<string>()
    for (const tr of tree.tracks) {
      const consider = (id: string) => {
        if (isLocalMediaId(id) && active.has(id) && !seen.has(id)) {
          seen.add(id)
          out.push(id)
        }
      }
      if (tr.frozen) consider(tr.frozen.mediaId)
      for (const c of tr.clips) consider(c.mediaId)
    }
    return out
  }, [tree.tracks, localItems])

  /**
   * Projede kullanılan lokal dosyaları assets API'siyle cloud'a yükle ve
   * tree'deki referansları sunucu mediaId'lerine MIGRATE et (clip + frozen).
   * Kısmi hata: yüklenemeyenler lokal kalır (referansları değişmez), özet
   * toast gösterilir. Dönüş: başarısız dosya sayısı.
   */
  const uploadUsedLocalFiles = useCallback(async (): Promise<number> => {
    const active = new Set(useLocalFiles.getState().items.map((i) => i.id))
    const ids: string[] = []
    const seen = new Set<string>()
    for (const tr of treeRef.current.tracks) {
      const consider = (id: string) => {
        if (isLocalMediaId(id) && active.has(id) && !seen.has(id)) {
          seen.add(id)
          ids.push(id)
        }
      }
      if (tr.frozen) consider(tr.frozen.mediaId)
      for (const c of tr.clips) consider(c.mediaId)
    }
    if (ids.length === 0) return 0
    const t = toast.loading(`Uploading local files… 0/${ids.length}`)
    const idMap = new Map<string, string>()
    let fail = 0
    for (let i = 0; i < ids.length; i++) {
      toast.loading(`Uploading local files… ${i + 1}/${ids.length}`, { id: t })
      try {
        const serverId = await uploadLocalFileToCloud(companySlug, ids[i]!)
        idMap.set(ids[i]!, serverId)
      } catch {
        fail++
      }
    }
    if (idMap.size > 0) {
      // Peaks cache'i yeni id'ye köprüle — waveform'lar yeniden fetch etmesin
      for (const [localId, serverId] of idMap) {
        const p = CLIP_PEAKS_CACHE.get(localId)
        if (p) CLIP_PEAKS_CACHE.set(serverId, p)
      }
      // treeRef'i senkron güncelle — hemen ardından gelen doSave stale tree
      // yazmasın (setTree commit'i asenkron, ref effect'i sonra çalışır).
      const migrated = rewriteTreeMediaIds(treeRef.current, idMap)
      treeRef.current = migrated
      updateTree(() => migrated, "Cloud sync")
    }
    if (fail > 0) {
      toast.error(
        `${idMap.size} uploaded, ${fail} file${fail === 1 ? "" : "s"} failed — they stay on this device`,
        { id: t }
      )
    } else {
      toast.success(
        `${idMap.size} local file${idMap.size === 1 ? "" : "s"} uploaded to cloud`,
        { id: t }
      )
    }
    return fail
  }, [companySlug, updateTree])

  /**
   * Hamburger: Cloud sync toggle.
   *   AÇILIŞ  → kullanılan lokal dosyalar upload + referans migrate + tree
   *             sunucuya kaydedilir; sonraki save'ler lokal + sunucu.
   *   KAPANIŞ → yalnız bayrak kapanır; kayıtlar bu cihazda kalmaya döner.
   */
  const handleCloudSyncToggle = useCallback(async () => {
    if (syncing) return
    if (cloudSyncRef.current) {
      setCloudSync(false)
      await persistLocal(treeRef.current)
      toast.info("Cloud sync off — changes stay on this device")
      return
    }
    setSyncing(true)
    try {
      await uploadUsedLocalFiles()
      setCloudSync(true)
      await doSave()
      toast.success("Project synced to cloud")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cloud sync failed")
    } finally {
      setSyncing(false)
    }
  }, [syncing, setCloudSync, persistLocal, uploadUsedLocalFiles, doSave])

  /** Hamburger: yalnız dosyaları yükle — tree kaydı cloudSync durumuna göre. */
  const handleUploadLocalFiles = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      await uploadUsedLocalFiles()
      if (cloudSyncRef.current) await doSave()
      else await persistLocal(treeRef.current)
    } finally {
      setSyncing(false)
    }
  }, [syncing, uploadUsedLocalFiles, doSave, persistLocal])

  // ─── Per-track alternatif çıkış (karaoke routing) ──────────────────────
  // Aygıt id'leri makineye özgü olduğundan tree'ye DEĞİL localStorage'a
  // yazılır (proje başına anahtar). Engine route'ları mount'ta yeniden
  // kurulur; kaybolan aygıtların route'ları state'ten düşer.
  const outputDevices = useAudioDevices((s) => s.outputs)
  const trackOutputsKey = `studio-track-outputs:${project.id}`
  const [trackOutputs, setTrackOutputs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isTrackOutputRoutingSupported()) return
    let raw: Record<string, string> = {}
    try {
      raw = JSON.parse(
        window.localStorage.getItem(trackOutputsKey) ?? "{}"
      ) as Record<string, string>
    } catch {}
    const entries = Object.entries(raw).filter(
      ([, v]) => typeof v === "string" && v.length > 0
    )
    if (entries.length === 0) return
    setTrackOutputs(Object.fromEntries(entries))
    void (async () => {
      const failed: string[] = []
      for (const [tid, dev] of entries) {
        try {
          await setTrackOutputDevice(tid, dev)
        } catch {
          failed.push(tid)
        }
      }
      if (failed.length > 0) {
        setTrackOutputs((prev) => {
          const next = { ...prev }
          for (const tid of failed) delete next[tid]
          return next
        })
      }
    })()
    // Mount-only (proje başına) — sonraki değişimler handleSetTrackOutput'ta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  useEffect(() => {
    try {
      window.localStorage.setItem(trackOutputsKey, JSON.stringify(trackOutputs))
    } catch {}
  }, [trackOutputs, trackOutputsKey])

  const handleSetTrackOutput = useCallback(
    async (trackId: string, deviceId: string | null) => {
      try {
        await setTrackOutputDevice(trackId, deviceId)
        setTrackOutputs((prev) => {
          const next = { ...prev }
          if (deviceId) next[trackId] = deviceId
          else delete next[trackId]
          return next
        })
        toast.success(
          deviceId
            ? "Track routed to alternate output — may add slight latency"
            : "Track routed back to Master"
        )
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not switch track output"
        )
      }
    },
    []
  )

  // devicechange sonrası master'a geri düşen track'ler (popover bildirir)
  const handleTrackRoutesDropped = useCallback((trackIds: string[]) => {
    setTrackOutputs((prev) => {
      const next = { ...prev }
      for (const tid of trackIds) delete next[tid]
      return next
    })
  }, [])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
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
      // Undo / Redo — Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z veya Cmd+Y (redo)
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyY") {
        e.preventDefault()
        redo()
        return
      }
      if (e.code === "Space") {
        e.preventDefault()
        if (isPlaying) handlePause()
        else void handlePlay()
        return
      }
      if (e.code === "KeyS" && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        splitClipAtPlayhead()
        return
      }
      if (e.code === "KeyM" && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        addMarker(transportSec)
        return
      }
      if (e.code === "KeyK" && !(e.metaKey || e.ctrlKey)) {
        // K toggle metronome
        e.preventDefault()
        setMetronomeEnabled((v) => !v)
        return
      }
      if (e.code === "KeyL" && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        // Ruler aralık seçimi varken: loop'u seçimden set/clear (DAW
        // standardı). Seçim yokken: mevcut davranış — loopRegion enabled
        // toggle (start/end korunur).
        if (rangeSelection && rangeSelection.end - rangeSelection.start >= 0.01) {
          toggleLoopFromSelection()
          return
        }
        if (tree.loopRegion) {
          setLoopRegion({
            ...tree.loopRegion,
            enabled: !tree.loopRegion.enabled,
          })
        }
        return
      }
      // Cmd/Ctrl + C → copy selected clips
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyC") {
        if (copySelectedClips()) {
          e.preventDefault()
        }
        return
      }
      // Cmd/Ctrl + V → paste clipboard at playhead
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyV") {
        if (clipClipboard) {
          e.preventDefault()
          pasteClipboard()
        }
        return
      }
      // Backspace / Delete → bulk delete selected
      if (e.code === "Backspace" || e.code === "Delete") {
        if (selectedClipKeys.size > 0) {
          e.preventDefault()
          bulkDeleteSelected()
        }
        return
      }
      // Esc → clear selections (clip + ruler zaman aralığı)
      if (e.code === "Escape") {
        if (selectedClipKeys.size > 0) {
          e.preventDefault()
          clearClipSelection()
        }
        if (rangeSelection) {
          e.preventDefault()
          setRangeSelection(null)
        }
        return
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isPlaying,
    splitClipAtPlayhead,
    undo,
    redo,
    addMarker,
    transportSec,
    tree.loopRegion,
    setLoopRegion,
    rangeSelection,
    toggleLoopFromSelection,
    copySelectedClips,
    pasteClipboard,
    clipClipboard,
    bulkDeleteSelected,
    clearClipSelection,
    selectedClipKeys,
  ])

  // ─── Render ────────────────────────────────────────────────────────────
  const totalTimelineSec = useMemo(() => {
    let max = 60
    for (const track of tree.tracks) {
      if (track.frozen) {
        if (track.frozen.duration > max) max = track.frozen.duration
        continue
      }
      for (const clip of track.clips) {
        const end = clip.startTime + (clip.duration || 10)
        if (end > max) max = end
      }
    }
    return Math.ceil(max + 10)
  }, [tree.tracks])

  // Lyrics karaoke fullscreen player için aggregated waveform input —
  // her track ve clip'ten ortak grid'e projeksiyon. muted track'ler atlanır.
  const waveformClips = useMemo(() => {
    const out: {
      mediaId: string
      url: string
      startSec: number
      durationSec: number
      gain?: number
      muted?: boolean
    }[] = []
    for (const track of tree.tracks) {
      if (track.muted) continue
      if (track.frozen) {
        out.push({
          mediaId: track.frozen.mediaId,
          url: mediaUrl(track.frozen.mediaId),
          startSec: 0,
          durationSec: track.frozen.duration,
          gain: track.volume,
        })
        continue
      }
      for (const clip of track.clips) {
        if (!clip.mediaId) continue
        out.push({
          mediaId: clip.mediaId,
          url: mediaUrl(clip.mediaId),
          startSec: clip.startTime,
          durationSec: clip.duration,
          gain: (clip.gain ?? 1) * track.volume,
        })
      }
    }
    return out
  }, [tree.tracks])

  // Collapsed grup üyelerinin trackId set'i — TimelinePanel bunu kullanarak
  // ilgili lane'leri gizler. Audio etkilenmez (grup pure UI organization).
  const hiddenTrackIds = useMemo(() => {
    const hidden = new Set<string>()
    const collapsedGroupIds = new Set(
      (tree.groups ?? []).filter((g) => g.collapsed).map((g) => g.id)
    )
    if (collapsedGroupIds.size === 0) return hidden
    for (const t of tree.tracks) {
      if (t.groupId && collapsedGroupIds.has(t.groupId)) hidden.add(t.id)
    }
    return hidden
  }, [tree.tracks, tree.groups])

  // LOCAL-FIRST hydration gate — lokal dosya registry'si + lokal tree
  // yüklenmeden içerik render edilirse clip'ler yanlış URL fetch eder /
  // eski tree görünür. Kısa (ms mertebesi) splash yeterli.
  if (!localReady) {
    return (
      <div className="flex h-svh items-center justify-center bg-neutral-950">
        <span className="size-6 animate-spin rounded-full border-2 border-neutral-700 border-t-cyan-400" />
        <span className="ms-3 text-xs text-neutral-500">Loading project…</span>
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col bg-neutral-950 text-neutral-100">
      {/* ─── Header — BandLab paterni: hamburger / title+saved / center
          transport / right tools (compact icon-first) ─── */}
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-neutral-800 bg-neutral-900 px-3">
        <div className="flex items-center gap-2">
          <HamburgerMenu
            actions={{
              dashboardHref: `/${lang}/d/${companySlug}/studio`,
              libraryOpen,
              snapEnabled,
              metronomeEnabled,
              autoCrossfade,
              automationMode,
              cloudSync,
              syncing,
              onCloudSyncToggle: () => void handleCloudSyncToggle(),
              localFileCount: usedLocalFileIds.length,
              onUploadLocalFiles: () => void handleUploadLocalFiles(),
              onSave: () => void doSave(),
              onExport: handleExport,
              onLibraryToggle: () => setLibraryOpen((o) => !o),
              onSnapToggle: () => setSnapEnabled((s) => !s),
              onMarkersToggle: () => addMarker(transportSec),
              onMetronomeToggle: () => setMetronomeEnabled((v) => !v),
              onAutoCrossfadeToggle: () => setAutoCrossfade((v) => !v),
              onAutomationModeToggle: () => setAutomationMode((v) => !v),
              // History toolbar'dan hamburger'a taşındı.
              canUndo: historyRef.current.length > 0,
              canRedo: futureRef.current.length > 0,
              onUndo: undo,
              onRedo: redo,
              history: historyRef.current,
              onRollback: rollbackToHistory,
            }}
          />
          <Tip text="Library — sample browser">
            <button
              type="button"
              onClick={() => setLibraryOpen((o) => !o)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded px-2 text-xs transition",
                libraryOpen
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              )}
            >
              <HugeiconsIcon icon={FolderLibraryIcon} size={13} />
              Library
            </button>
          </Tip>
          <div className="mx-1 h-5 w-px bg-neutral-800" />
          <EditableTitle
            value={localProject.title}
            onChange={(t) => void patchProjectMeta({ title: t })}
          />
          <SavedDot status={saveStatus} />
          <div className="mx-1 h-5 w-px bg-neutral-800" />
          <BpmKeyDisplay
            bpm={localProject.bpm}
            musicalKey={localProject.musicalKey}
            musicalScale={localProject.musicalScale}
            onBpmChange={(n) => void patchProjectMeta({ bpm: n })}
            onKeyChange={(k) => void patchProjectMeta({ musicalKey: k })}
            onScaleChange={(s) => void patchProjectMeta({ musicalScale: s })}
          />
        </div>
        {/* ─── Center — transport: play/pause + stop + loop + time + global REC ─── */}
        <div className="flex items-center gap-1.5 justify-self-center">
          <Tip text={isPlaying ? "Pause" : "Play"}>
            <button
              type="button"
              onClick={isPlaying ? handlePause : handlePlay}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded border transition",
                isPlaying
                  ? "border-red-500/60 bg-red-500/20 text-red-300"
                  : "border-emerald-500/60 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
              )}
            >
              <HugeiconsIcon
                icon={isPlaying ? PauseIcon : PlayIcon}
                size={14}
              />
            </button>
          </Tip>
          <Tip text="Stop">
            <button
              type="button"
              onClick={handleStop}
              className="flex h-8 w-8 items-center justify-center rounded border border-neutral-700 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
            >
              <HugeiconsIcon icon={StopIcon} size={14} />
            </button>
          </Tip>
          <Tip
            text={
              tree.loopRegion?.enabled
                ? `Loop on (${fmtTime(tree.loopRegion.start)} → ${fmtTime(tree.loopRegion.end)}) — L`
                : "Enable loop region (L)"
            }
          >
            <button
              type="button"
              onClick={() => {
                const cur = tree.loopRegion
                if (cur && cur.enabled) {
                  setLoopRegion({ ...cur, enabled: false })
                } else if (cur) {
                  setLoopRegion({ ...cur, enabled: true })
                } else {
                  const oneBar = (60 / localProject.bpm) * 4
                  setLoopRegion({
                    start: transportSec,
                    end: transportSec + oneBar * 4,
                    enabled: true,
                  })
                }
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded border transition",
                tree.loopRegion?.enabled
                  ? "border-amber-500/60 bg-amber-500/20 text-amber-300"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              )}
            >
              <HugeiconsIcon icon={RepeatIcon} size={13} />
            </button>
          </Tip>
          {/* Transport timestamp — digital LCD readout (Orbitron font).
              Yeşil glow + tabular-nums fixed-width; CDJ/DJM master display
              tarzı. Inner shadow + border digital panel hissi verir. */}
          <span
            className="mx-2 inline-flex items-center rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1 text-sm font-semibold tracking-wider text-emerald-400 tabular-nums"
            style={{
              fontFamily: "var(--font-display), 'Orbitron', monospace",
              textShadow:
                "0 0 6px rgba(52, 211, 153, 0.55), 0 0 14px rgba(52, 211, 153, 0.25)",
              boxShadow:
                "inset 0 1px 3px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(52, 211, 153, 0.12)",
            }}
          >
            {fmtTime(transportSec)}
          </span>
          {/* Global REC — selected track'e kayda alır */}
          <Tip
            text={
              recordingTrackId
                ? `Stop recording on ${tree.tracks.find((t) => t.id === recordingTrackId)?.name ?? ""} (${recElapsed.toFixed(1)}s)`
                : selectedTrackId
                  ? `Start mic recording on ${tree.tracks.find((t) => t.id === selectedTrackId)?.name ?? ""}`
                  : "Select a track to record"
            }
          >
            <button
              type="button"
              onClick={() => {
                if (recordingTrackId) {
                  void handleStopRec()
                } else if (selectedTrackId) {
                  void handleStartRec(selectedTrackId)
                } else {
                  toast.error("Select a track first (click its header)")
                }
              }}
              disabled={!recordingTrackId && !selectedTrackId}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded border px-2.5 text-[10px] font-bold tracking-widest uppercase transition disabled:cursor-not-allowed disabled:opacity-40",
                recordingTrackId
                  ? "animate-pulse border-red-500 bg-red-500/30 text-red-200"
                  : "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              )}
            >
              <HugeiconsIcon
                icon={recordingTrackId ? RecStopIcon : RecordIcon}
                size={12}
              />
              {recordingTrackId
                ? `${recElapsed.toFixed(1)}s`
                : selectedTrackId
                  ? "REC"
                  : "REC"}
            </button>
          </Tip>
        </div>

        {/* ─── Right — workflow toggles + tools (compact icon-first) ─── */}
        <div className="flex items-center justify-end gap-1.5">
          <Tip text={`Add marker at ${fmtTime(transportSec)} (M)`}>
            <button
              type="button"
              onClick={() => addMarker(transportSec)}
              className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
            >
              <HugeiconsIcon icon={Flag01Icon} size={13} />
            </button>
          </Tip>
          <Tip text="Auto crossfade — overlapping clips fade automatically">
            <button
              type="button"
              onClick={() => setAutoCrossfade((v) => !v)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded text-[11px] font-bold transition",
                autoCrossfade
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              )}
            >
              XF
            </button>
          </Tip>
          <Tip
            text={`Metronome ${metronomeEnabled ? "on" : "off"} — ${localProject.bpm} BPM (K)`}
          >
            <button
              type="button"
              onClick={() => setMetronomeEnabled((v) => !v)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded text-[14px] transition",
                metronomeEnabled
                  ? "bg-amber-500/20 text-amber-300"
                  : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              )}
            >
              ♪
            </button>
          </Tip>
          <Tip
            text={
              automationMode
                ? "Automation edit mode on — clip volume curves editable"
                : "Enable automation edit mode"
            }
          >
            <button
              type="button"
              onClick={() => setAutomationMode((v) => !v)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded text-[10px] font-bold transition",
                automationMode
                  ? "bg-primary/20 text-primary"
                  : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              )}
            >
              ⌇A
            </button>
          </Tip>
          <Tip text="Open spectrum analyzer">
            <button
              type="button"
              onClick={() => addInspectorTab({ type: "spectrum" })}
              className="flex h-8 w-8 items-center justify-center rounded text-[11px] font-bold text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200"
            >
              ≈
            </button>
          </Tip>
          {(tree.markers ?? []).length > 0 && (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1 rounded px-1.5 font-mono text-[10px] text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
                    title="Markers list"
                  >
                    <HugeiconsIcon icon={Flag01Icon} size={11} />
                    {(tree.markers ?? []).length}
                  </button>
                }
              />
              <PopoverContent className="w-64 p-1" align="end">
                <div className="px-2 py-1 text-[9px] font-bold tracking-widest text-neutral-500 uppercase">
                  Markers — click to seek
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {(tree.markers ?? []).map((m) => (
                    <div
                      key={m.id}
                      className="group/mk flex items-center gap-1 rounded px-2 py-1 hover:bg-neutral-800"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          transportSeek(m.time)
                          setTransportSec(m.time)
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-neutral-100"
                      >
                        <HugeiconsIcon
                          icon={Flag01Icon}
                          size={10}
                          style={{ color: m.color ?? "#eab308" }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {m.label}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-neutral-500">
                          {fmtTime(m.time)}
                        </span>
                      </button>
                      <Tip text="Delete marker">
                        <button
                          type="button"
                          onClick={() => removeMarker(m.id)}
                          className="text-neutral-600 opacity-0 transition group-hover/mk:opacity-100 hover:text-red-400"
                        >
                          ✕
                        </button>
                      </Tip>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {/* Snap toggle — magnet + bölme. Aktif iken bölme rakamı görünür,
              tıklandığında popover ile değiştirilir. */}
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    "flex h-8 items-center gap-1 rounded px-1.5 transition",
                    snapEnabled
                      ? "bg-primary/15 text-primary"
                      : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                  )}
                  title={
                    snapEnabled
                      ? `Snap to 1/${snapDivision} — click to change`
                      : "Snap off — click to enable"
                  }
                />
              }
            >
              <HugeiconsIcon icon={Magnet01Icon} size={12} />
              <span className="ms-1 font-mono text-[10px]">
                {snapEnabled ? `1/${snapDivision}` : "—"}
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <button
                type="button"
                onClick={() => setSnapEnabled((s) => !s)}
                className={cn(
                  "mb-1 flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition",
                  snapEnabled
                    ? "bg-primary/20 text-primary"
                    : "text-neutral-200 hover:bg-neutral-800"
                )}
              >
                <span>{snapEnabled ? "Snap on" : "Snap off"}</span>
                {snapEnabled && <span className="text-emerald-400">✓</span>}
              </button>
              {snapEnabled &&
                ([1, 2, 4, 8, 16] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSnapDivision(d)}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition",
                      snapDivision === d
                        ? "bg-primary/20 text-primary"
                        : "text-neutral-200 hover:bg-neutral-800"
                    )}
                  >
                    <span>1/{d}</span>
                    <span className="font-mono text-[9px] text-neutral-500">
                      {((60 / localProject.bpm) * (4 / d)).toFixed(2)}s
                    </span>
                  </button>
                ))}
            </PopoverContent>
          </Popover>
          {/* Export split-button: ana click default format, ▾ format seçici */}
          <div className="flex items-stretch">
            <Tip
              text={`Render timeline → ${FORMAT_META[exportFormat].label} download`}
            >
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="flex h-8 items-center gap-1.5 rounded-l border border-cyan-500/60 bg-cyan-500/20 px-2.5 text-[10px] font-bold tracking-widest text-cyan-300 uppercase transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <HugeiconsIcon icon={Download01Icon} size={12} />
                {exporting
                  ? "Rendering…"
                  : `Export ${FORMAT_META[exportFormat].label}`}
              </button>
            </Tip>
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    disabled={exporting}
                    className="flex h-8 w-6 items-center justify-center rounded-r border border-l-0 border-cyan-500/60 bg-cyan-500/20 text-cyan-300 transition hover:bg-cyan-500/30 disabled:opacity-40"
                    title="Change export format"
                  >
                    ▾
                  </button>
                }
              />
              <PopoverContent className="w-56 p-1" align="end">
                <div className="px-2 py-1 text-[9px] font-bold tracking-widest text-neutral-500 uppercase">
                  Default export format
                </div>
                {(["wav", "mp3", "m4a"] as const).map((fmt) => {
                  const meta = FORMAT_META[fmt]
                  const disabled = fmt === "m4a" && !isM4aSupported()
                  return (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => {
                        if (disabled) return
                        setExportFormat(fmt)
                      }}
                      disabled={disabled}
                      className={cn(
                        "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition",
                        disabled
                          ? "cursor-not-allowed opacity-40"
                          : exportFormat === fmt
                            ? "bg-cyan-500/15 text-cyan-200"
                            : "text-neutral-200 hover:bg-neutral-800"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          exportFormat === fmt
                            ? "bg-cyan-400"
                            : "bg-neutral-700"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium">{meta.label}</div>
                        <div className="text-[9px] text-neutral-500">
                          {disabled
                            ? "Not supported in this browser"
                            : meta.description}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </PopoverContent>
            </Popover>
          </div>
          {/* History hamburger menüye taşındı; bu slota Lyrics geldi
              (lyrics sheet sağdan açılır → buton sağ uçta hizalı). */}
          <div className="mx-1 h-5 w-px bg-neutral-800" />
          <Tip text="Lyrics — alternate drafts + karaoke">
            <button
              type="button"
              onClick={() => setLyricsOpen((o) => !o)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded px-2 text-xs transition",
                lyricsOpen
                  ? "bg-pink-500/20 text-pink-200"
                  : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              )}
            >
              <HugeiconsIcon icon={Mic01Icon} size={13} />
              Lyrics
            </button>
          </Tip>
        </div>
      </header>

      {/* ─── Main: library + tracks panel + timeline ─── */}
      <main className="flex flex-1 items-stretch overflow-hidden">
        <LibrarySidebar
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          companySlug={companySlug}
        />
        {/* Sol — track header'ları (sticky width). Cmd/Ctrl+Wheel burada
            dikey zoom; clipler tarafında yatay zoom (TimelinePanel kendi
            içinde handle eder). */}
        <div
          className="shrink-0 overflow-y-auto bg-neutral-900/60"
          style={{ width: headerWidth }}
          onWheel={(e) => {
            if (!(e.metaKey || e.ctrlKey)) return
            e.preventDefault()
            const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1
            setZoomY((z) =>
              Math.max(ZOOM_Y_MIN, Math.min(ZOOM_Y_MAX, z * delta))
            )
          }}
        >
          <div
            className="border-b border-neutral-800 bg-neutral-950 px-3 py-1.5 text-[10px] font-bold tracking-widest text-neutral-500 uppercase"
            style={{ height: RULER_HEIGHT }}
          >
            {headerWidth > 110 ? "Tracks" : "TR"}
          </div>
          <SortableTrackList
            tracks={tree.tracks}
            onReorder={reorderTracks}
            renderItem={(track, idx) => {
              // Group header — bu track'in groupId'si önceki track'ten
              // farklıysa veya idx=0 ise + track'in groupId'si tanımlıysa
              // render et. Collapsed grup → child tracks gizli (lane de).
              const groups = tree.groups ?? []
              const group = track.groupId
                ? groups.find((g) => g.id === track.groupId)
                : null
              const prev = idx > 0 ? tree.tracks[idx - 1] : null
              const showGroupHeader =
                group && (idx === 0 || prev?.groupId !== track.groupId)
              const trackHidden = group?.collapsed ?? false
              return (
                <>
                  {showGroupHeader && (
                    <GroupHeaderRow
                      group={group}
                      onToggleCollapse={() =>
                        patchGroup(group.id, { collapsed: !group.collapsed })
                      }
                      onRename={async () => {
                        const next = await promptInput({
                          title: "Rename group",
                          label: "Group name",
                          defaultValue: group.name,
                          confirmText: "Rename",
                        })
                        if (next !== null && next.trim() !== "") {
                          patchGroup(group.id, { name: next.trim() })
                        }
                      }}
                      onChangeColor={(c) => patchGroup(group.id, { color: c })}
                      onDelete={async () => {
                        const ok = await confirm({
                          title: `Delete group "${group.name}"?`,
                          description:
                            "Tracks in this group will be ungrouped — they are not deleted.",
                          confirmText: "Delete group",
                          destructive: true,
                        })
                        if (ok) removeGroup(group.id)
                      }}
                    />
                  )}
                  {!trackHidden && (
                    <TrackHeader
                      track={track}
                      trackHeight={trackHeight}
                      headerWidth={headerWidth}
                      selected={selectedTrackId === track.id}
                      groupColor={group?.color}
                      onSelect={() => setSelectedTrackId(track.id)}
                      onPatch={(p) => patchTrack(track.id, p)}
                      onOpenFx={() =>
                        addInspectorTab({ type: "fx", trackId: track.id })
                      }
                      onRemove={() => {
                        if (selectedTrackId === track.id)
                          setSelectedTrackId(null)
                        removeTrack(track.id)
                      }}
                      onDuplicate={() => duplicateTrack(track.id)}
                      onExport={(format) =>
                        exportAudio({
                          onlyTrackId: track.id,
                          fileSuffix: track.name.replace(/[^a-z0-9_\-]/gi, "_"),
                          format,
                        })
                      }
                      groups={groups}
                      onMoveToGroup={(gid) => setTrackGroup(track.id, gid)}
                      onCreateGroupWithTrack={() => {
                        const newId = addGroup()
                        setTrackGroup(track.id, newId)
                      }}
                      onFreezeToggle={() => {
                        if (track.frozen) unfreezeTrack(track.id)
                        else void freezeTrack(track.id)
                      }}
                      outputDevices={outputDevices}
                      trackOutputId={trackOutputs[track.id] ?? null}
                      onSetTrackOutput={(dev) =>
                        void handleSetTrackOutput(track.id, dev)
                      }
                      onResizeHeight={(deltaPx) => {
                        setZoomY((z) =>
                          Math.max(
                            ZOOM_Y_MIN,
                            Math.min(ZOOM_Y_MAX, z + deltaPx / BASE_trackHeight)
                          )
                        )
                      }}
                    />
                  )}
                </>
              )
            }}
          />
          {/* Lane sıralaması da TrackHeader sırasını izlesin diye TimelinePanel
              tree.tracks'i kullanır; reorder edildiğinde otomatik senkron.
              hiddenTrackIds collapsed grup üyelerini lane render'dan çıkarır. */}
          <div className="flex border-y border-dashed border-neutral-800">
            <button
              type="button"
              onClick={addTrack}
              className="flex flex-1 items-center justify-center gap-1.5 py-2 text-[10px] font-bold tracking-widest text-neutral-500 uppercase hover:bg-neutral-800/40 hover:text-neutral-200"
            >
              <HugeiconsIcon icon={Add01Icon} size={12} />
              {headerWidth > 110 ? "Track" : "+"}
            </button>
            <button
              type="button"
              onClick={() => addGroup()}
              className="flex flex-1 items-center justify-center gap-1.5 border-s border-dashed border-neutral-800 py-2 text-[10px] font-bold tracking-widest text-neutral-500 uppercase hover:bg-neutral-800/40 hover:text-neutral-200"
              title="Add empty group folder"
            >
              <HugeiconsIcon icon={FolderLibraryIcon} size={12} />
              {headerWidth > 110 ? "Group" : "▾"}
            </button>
          </div>
        </div>

        {/* Resize divider — left/right drag, double-click → reset default */}
        <HeaderResizeHandle width={headerWidth} onResize={setHeaderWidth} />

        {/* Sağ — timeline (ruler + per-track clip kanalları) */}
        <TimelinePanel
          tree={tree}
          totalSec={totalTimelineSec}
          transportSec={transportSec}
          pxPerSec={pxPerSec}
          trackHeight={trackHeight}
          onSeek={handleSeek}
          onZoomX={(deltaSign) => {
            const factor = deltaSign < 0 ? 1.1 : 1 / 1.1
            setZoomX((z) =>
              Math.max(ZOOM_X_MIN, Math.min(ZOOM_X_MAX, z * factor))
            )
          }}
          onZoomFit={(viewportPx) => {
            // Fit-to-content: tüm clip'ler tek ekranda görünsün.
            // pxPerSec = BASE_pxPerSec * zoomX, bu yüzden zoomX hedef =
            // viewportPx / (totalSec * BASE_pxPerSec).
            const padding = 40 // sağda küçük boşluk
            const target =
              (viewportPx - padding) / (totalTimelineSec * BASE_pxPerSec)
            setZoomX(
              Math.max(ZOOM_X_MIN, Math.min(ZOOM_X_MAX, target)),
            )
          }}
          onDropOnTrack={handleDropOnTrack}
          onDropFilesOnTrack={(trackId, e, el) =>
            void handleDropFilesOnTrack(trackId, e, el)
          }
          onRemoveClip={removeClip}
          onPatchClip={patchClip}
          onMoveClipToTrack={moveClipToTrack}
          onDuplicateClip={duplicateClip}
          onSplitClipAtPlayhead={splitClipAtTransport}
          onTapeStopClip={handleTapeStopClip}
          onEnterClipEdit={handleEnterClipEdit}
          loopRegion={tree.loopRegion}
          markers={tree.markers ?? []}
          onLoopRegionChange={setLoopRegion}
          rangeSelection={rangeSelection}
          onRangeSelectionChange={setRangeSelection}
          onToggleLoopFromSelection={toggleLoopFromSelection}
          snapTime={snapTime}
          onMarkerSeek={handleSeek}
          onMarkerPatch={patchMarker}
          onMarkerRemove={removeMarker}
          selectedClipKeys={selectedClipKeys}
          onClipSelect={handleClipSelect}
          onBulkMoveByDelta={bulkMoveByDelta}
          onLaneBackgroundClick={clearClipSelection}
          autoCrossfade={autoCrossfade}
          hiddenTrackIds={hiddenTrackIds}
          automationMode={automationMode}
        />
        {/* Right — Lyrics drafts sidebar (toggle from header) */}
        <LyricsSidebar
          open={lyricsOpen}
          onOpenChange={setLyricsOpen}
          companySlug={companySlug}
          projectId={project.id}
          initial={localProject.lyrics}
          projectDurationSec={totalTimelineSec}
          waveformClips={waveformClips}
          bpm={localProject.bpm}
          onPlay={handlePlay}
          onPause={handlePause}
          renderAudio={renderMixBuffer}
          markers={(tree.markers ?? []).map((m) => ({
            time: m.time,
            label: m.label,
          }))}
        />
      </main>

      {/* ─── Footer / Master strip ─── */}
      <footer className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-neutral-800 bg-neutral-900 px-4 text-[10px] text-neutral-500">
        <span className="justify-self-start">
          {tree.tracks.length} track{tree.tracks.length === 1 ? "" : "s"} ·{" "}
          {tree.tracks.reduce((acc, t) => acc + t.clips.length, 0)} clip(s)
        </span>
        {/* Center master strip — volume slider + stereo meter + label */}
        <div className="flex items-center gap-3 justify-self-center">
          <span className="text-[9px] font-bold tracking-widest text-neutral-500 uppercase">
            Master
          </span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={tree.master.volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              updateTree(
                (t) => ({
                  ...t,
                  master: { ...t.master, volume: v },
                }),
                "Master volume"
              )
            }}
            className="h-1 w-40 cursor-pointer accent-primary"
            title={`Master ${Math.round(tree.master.volume * 100)}%`}
          />
          <span className="w-8 text-right font-mono text-[10px] text-neutral-300 tabular-nums">
            {Math.round(tree.master.volume * 100)}
          </span>
          <VuMeter
            read={getMasterMeterDb}
            orientation="vertical"
            width={5}
            height={28}
            segments={20}
          />
          <span className="rounded border border-neutral-800 px-1 py-0.5 font-mono text-[8px] text-neutral-500">
            -0.5 dB LIM
          </span>
          {/* Ses aygıtları — Output (setSinkId) / Input (mic) seçimi */}
          <AudioDevicePopover onTrackRoutesDropped={handleTrackRoutesDropped} />
        </div>
        <span className="justify-self-end font-mono">r{revision}</span>
      </footer>

      {/* ─── Inspector panel — in-flow bottom panel, multi-tab ─── */}
      <InspectorPanel
        tabs={inspectorTabs}
        activeTabId={activeInspectorTabId}
        onSelectTab={setActiveInspectorTabId}
        onCloseTab={closeInspectorTab}
        tracks={tree.tracks}
        companySlug={companySlug}
        onMutateTrackEffects={setTrackEffects}
        trimClipPeaks={(mediaId) => CLIP_PEAKS_CACHE.get(mediaId) ?? null}
        trimClipSourceDuration={(mediaId) => trimSourceDurations[mediaId] ?? 0}
        onMutateClip={patchClip}
        onRequestSourceDecode={(mediaId) => {
          if (trimSourceDurations[mediaId]) return
          const url = mediaUrl(mediaId)
          // Peaks zaten async cache'leniyor; ek olarak source duration için
          // decode tetikle.
          void getOrFetchClipPeaks(mediaId, url).catch(() => {})
          ;(async () => {
            try {
              const res = await fetch(url)
              const ab = await res.arrayBuffer()
              const Ctx =
                window.AudioContext ||
                (
                  window as unknown as {
                    webkitAudioContext: typeof AudioContext
                  }
                ).webkitAudioContext
              const ctx = new Ctx()
              const buf = await ctx.decodeAudioData(ab.slice(0))
              setTrimSourceDurations((prev) => ({
                ...prev,
                [mediaId]: buf.duration,
              }))
              void ctx.close()
            } catch {}
          })()
        }}
      />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function useTreeOrDefault(
  data: StudioProjectData | null
): StudioMusicianProjectTree {
  if (data?.tree && data.tree.mode === "musician") {
    return data.tree as StudioMusicianProjectTree
  }
  return {
    mode: "musician",
    version: 1,
    master: { volume: 1.0, pan: 0, effects: [] },
    tracks: [
      makeDefaultTrack("track-1", "Audio 1", TRACK_COLORS[0]!),
      makeDefaultTrack("track-2", "Audio 2", TRACK_COLORS[1]!),
    ],
    buses: [],
    automation: [],
  }
}

function makeDefaultTrack(
  id: string,
  name: string,
  color: string
): MusicianTrack {
  return {
    id,
    name,
    color,
    muted: false,
    soloed: false,
    volume: 0.85,
    pan: 0,
    clips: [],
    effects: [],
  }
}

const TRACK_COLORS = [
  "#ec4899",
  "#06b6d4",
  "#eab308",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#3b82f6",
  "#14b8a6",
]

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00.00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.floor((s % 1) * 100)
  return `${m}:${sec.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`
}

/**
 * Cloud sync migrate — tree'deki local- mediaId referanslarını sunucu
 * mediaId'lerine çevirir (clips + frozen). idMap'te olmayanlar dokunulmaz;
 * yüklenemeyen dosyaların referansları lokal kalır.
 */
function rewriteTreeMediaIds(
  tree: StudioMusicianProjectTree,
  idMap: Map<string, string>
): StudioMusicianProjectTree {
  return {
    ...tree,
    tracks: tree.tracks.map((tr) => ({
      ...tr,
      frozen:
        tr.frozen && idMap.has(tr.frozen.mediaId)
          ? { ...tr.frozen, mediaId: idMap.get(tr.frozen.mediaId)! }
          : tr.frozen,
      clips: tr.clips.map((c) =>
        idMap.has(c.mediaId) ? { ...c, mediaId: idMap.get(c.mediaId)! } : c
      ),
    })),
  }
}

/**
 * Track içindeki overlap'lere göre clip için "effective" fadeIn/fadeOut
 * hesapla. autoEnabled=false ise user-set değerleri olduğu gibi döner.
 * autoEnabled=true ise overlap miktarı kadar otomatik fade uygulanır
 * (user fade max() ile korunur — kullanıcı daha uzun bir fade istemişse
 * onun değeri kalır).
 *
 * `sortedClips` startTime'a göre artan sıralı olmalı.
 */
function computeEffectiveFades(
  sortedClips: MusicianClip[],
  idx: number,
  autoEnabled: boolean
): { fadeIn: number; fadeOut: number } {
  const clip = sortedClips[idx]!
  if (!autoEnabled) {
    return { fadeIn: clip.fadeIn, fadeOut: clip.fadeOut }
  }
  let autoFadeIn = 0
  let autoFadeOut = 0
  // Önceki clip → bu clip overlap'i: prev.end > this.start ise
  if (idx > 0) {
    const prev = sortedClips[idx - 1]!
    const prevEnd = prev.startTime + prev.duration
    if (prevEnd > clip.startTime) {
      const overlap = prevEnd - clip.startTime
      autoFadeIn = Math.min(overlap, clip.duration * 0.5)
    }
  }
  // Bu clip → sonraki clip overlap'i
  if (idx < sortedClips.length - 1) {
    const next = sortedClips[idx + 1]!
    const thisEnd = clip.startTime + clip.duration
    if (thisEnd > next.startTime) {
      const overlap = thisEnd - next.startTime
      autoFadeOut = Math.min(overlap, clip.duration * 0.5)
    }
  }
  return {
    fadeIn: Math.max(clip.fadeIn, autoFadeIn),
    fadeOut: Math.max(clip.fadeOut, autoFadeOut),
  }
}

/**
 * Header'a yerleşik history dropdown — son düzenlemeleri sıralı listeler,
 * tıklanan entry'ye rollback yapar. Undo/redo butonları popover içinde
 * + Cmd+Z/Cmd+Shift+Z klavye kısayolları aynı eylemi tetikler.
 *
 * `historyTick` historyRef.current değişimini React'e haber vermek için —
 * ref güncellenince parent setHistoryTick(n+1) çağırır, bu component
 * re-render olur ve liste tazelenir.
 */
function HistoryPanel({
  historyTick,
  history,
  future,
  onUndo,
  onRedo,
  onRollback,
}: {
  historyTick: number
  history: { label: string; ts: number }[]
  future: { label: string; ts: number }[]
  onUndo(): void
  onRedo(): void
  onRollback(entryIdx: number): void
}) {
  void historyTick
  const canUndo = history.length > 0
  const canRedo = future.length > 0
  // Newest first (history'nin sonu en yeni edit'in BEFORE state'i)
  const items = [...history].reverse()
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="relative flex h-8 w-8 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
            title={`Edit history (${history.length})`}
          >
            <HugeiconsIcon icon={Clock01Icon} size={14} />
            {history.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-1 font-mono text-[8px] font-bold text-primary-foreground">
                {Math.min(99, history.length)}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent className="w-72 p-2" align="end">
        <div className="mb-2 flex items-center gap-1">
          <Tip text="Undo (Cmd+Z)">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] font-bold tracking-widest uppercase transition",
                canUndo
                  ? "border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                  : "border-neutral-800 text-neutral-700"
              )}
            >
              <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={11} />
              Undo
            </button>
          </Tip>
          <Tip text="Redo (Cmd+Shift+Z)">
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] font-bold tracking-widest uppercase transition",
                canRedo
                  ? "border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                  : "border-neutral-800 text-neutral-700"
              )}
            >
              Redo
              <HugeiconsIcon
                icon={ArrowReloadHorizontalIcon}
                size={11}
                className="scale-x-[-1]"
              />
            </button>
          </Tip>
        </div>
        <div className="mb-1 text-[9px] tracking-widest text-neutral-500 uppercase">
          Recent edits
        </div>
        <div className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-4 text-center text-[10px] text-neutral-500">
              No history yet
            </div>
          ) : (
            <ul className="space-y-0.5">
              {items.map((entry, displayIdx) => {
                // displayIdx 0 = en yeni; gerçek history index sondan
                const realIdx = history.length - 1 - displayIdx
                return (
                  <li key={`${entry.ts}-${displayIdx}`}>
                    <Tip text="Rollback to this point">
                      <button
                        type="button"
                        onClick={() => onRollback(realIdx)}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {entry.label}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-neutral-500">
                          {fmtAgo(entry.ts)}
                        </span>
                      </button>
                    </Tip>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function fmtAgoShort(iso: string): string {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return ""
  return fmtAgo(ts)
}

function fmtAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

function SaveStatusBadge({
  status,
}: {
  status: "idle" | "dirty" | "saving" | "saved" | "error"
}) {
  const labels = {
    idle: { text: "Synced", cls: "text-neutral-600" },
    dirty: { text: "Unsaved", cls: "text-yellow-500" },
    saving: { text: "Saving…", cls: "text-blue-400 animate-pulse" },
    saved: { text: "Saved", cls: "text-green-500" },
    error: { text: "Save error", cls: "text-red-500" },
  } as const
  const entry = labels[status]
  return (
    <span className={cn("text-[11px] font-medium", entry.cls)}>
      {entry.text}
    </span>
  )
}

// ─── TrackHeader ──────────────────────────────────────────────────────────

const TRACK_COLOR_SWATCHES = [
  "#ec4899",
  "#06b6d4",
  "#eab308",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#ef4444",
  "#3b82f6",
  "#14b8a6",
  "#f43f5e",
  "#84cc16",
  "#8b5cf6",
] as const

// ─── SortableTrackList — dnd-kit ile track reorder wrapper ──────────────

function SortableTrackList({
  tracks,
  onReorder,
  renderItem,
}: {
  tracks: MusicianTrack[]
  onReorder(fromIdx: number, toIdx: number): void
  renderItem(track: MusicianTrack, idx: number): React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Activation constraint: 4px sürükleme sonrası drag başlasın —
      // aksi halde basit tıklama (select) da drag tetikler.
      activationConstraint: { distance: 4 },
    })
  )
  const ids = useMemo(() => tracks.map((t) => t.id), [tracks])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIdx = ids.indexOf(String(active.id))
      const newIdx = ids.indexOf(String(over.id))
      if (oldIdx < 0 || newIdx < 0) return
      onReorder(oldIdx, newIdx)
    },
    [ids, onReorder]
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {tracks.map((track, idx) => (
          <SortableTrackRow key={track.id} id={track.id}>
            {renderItem(track, idx)}
          </SortableTrackRow>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortableTrackRow({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.7 : 1,
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
  }
  // listeners/attributes drag handle'a verilecek — DragHandle context ile
  // alt component'e açıyoruz.
  return (
    <div ref={setNodeRef} style={style}>
      <DragHandleContext.Provider value={{ listeners, attributes, isDragging }}>
        {children}
      </DragHandleContext.Provider>
    </div>
  )
}

interface DragHandleCtx {
  listeners: ReturnType<typeof useSortable>["listeners"] | undefined
  attributes: ReturnType<typeof useSortable>["attributes"]
  isDragging: boolean
}
const DragHandleContext = createContext<DragHandleCtx | null>(null)
function useDragHandle(): DragHandleCtx | null {
  return useContext(DragHandleContext)
}

// ─── GroupHeaderRow — collapse/expand + rename/color/delete ──────────────

function GroupHeaderRow({
  group,
  onToggleCollapse,
  onRename,
  onChangeColor,
  onDelete,
}: {
  group: { id: string; name: string; color: string; collapsed: boolean }
  onToggleCollapse(): void
  onRename(): void
  onChangeColor(color: string): void
  onDelete(): void
}) {
  const [colorOpen, setColorOpen] = useState(false)
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            onClick={onToggleCollapse}
            className="group/grp flex h-7 cursor-pointer items-center gap-2 border-b border-neutral-800 bg-neutral-900/70 ps-1 pe-2 transition hover:bg-neutral-800/70"
            style={{
              boxShadow: `inset 4px 0 0 ${group.color}`,
            }}
          />
        }
      >
        <span className="font-mono text-[10px] text-neutral-500">
          {group.collapsed ? "▶" : "▼"}
        </span>
        <Popover open={colorOpen} onOpenChange={setColorOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="h-3 w-3 shrink-0 rounded-sm transition hover:scale-110"
                style={{ background: group.color }}
                title="Change group color"
              />
            }
          />
          <PopoverContent className="w-40 p-2" align="start">
            <div className="mb-1 text-[9px] tracking-widest text-neutral-500 uppercase">
              Group color
            </div>
            <div className="grid grid-cols-6 gap-1">
              {TRACK_COLOR_SWATCHES.map((c) => (
                <Tip key={c} text={c}>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeColor(c)
                      setColorOpen(false)
                    }}
                    className={cn(
                      "h-5 w-5 rounded transition hover:scale-110",
                      c === group.color && "ring-2 ring-white"
                    )}
                    style={{ background: c }}
                  />
                </Tip>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-bold tracking-widest uppercase"
          style={{ color: group.color }}
        >
          {group.name}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={onRename}>Rename group</ContextMenuItem>
        <ContextMenuItem onClick={() => setColorOpen(true)}>
          Change color…
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleCollapse}>
          {group.collapsed ? "Expand" : "Collapse"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={onDelete}
          className="text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300"
        >
          Delete group
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function TrackHeader({
  track,
  trackHeight,
  headerWidth,
  selected,
  groupColor,
  onSelect,
  onPatch,
  onOpenFx,
  onRemove,
  onDuplicate,
  onExport,
  groups,
  onMoveToGroup,
  onCreateGroupWithTrack,
  onFreezeToggle,
  outputDevices,
  trackOutputId,
  onSetTrackOutput,
  onResizeHeight,
}: {
  track: MusicianTrack
  trackHeight: number
  headerWidth: number
  selected: boolean
  /** Bu track bir gruba bağlıysa grubun rengi — left-edge stripe için. */
  groupColor?: string
  onSelect(): void
  onPatch(patch: Partial<MusicianTrack>): void
  onOpenFx(): void
  onRemove(): void
  onDuplicate(): void
  onExport(format: AudioFormat): void
  groups: Array<{ id: string; name: string; color: string; collapsed: boolean }>
  onMoveToGroup(groupId: string | undefined): void
  onCreateGroupWithTrack(): void
  onFreezeToggle(): void
  /** Alternatif çıkış aygıtları (kebab "Output device" submenüsü). */
  outputDevices: AudioDeviceOption[]
  /** Track'in yönlendirildiği aygıt — null = Master. */
  trackOutputId: string | null
  onSetTrackOutput(deviceId: string | null): void
  onResizeHeight(deltaPx: number): void
}) {
  // Sortable context'ten drag handle listeners — TrackHeader'ın sol kenar
  // grip butonuna bağlanır. Yoksa (örn. SortableTrackList dışında render
  // edilirse) handle render edilmez.
  const dragHandle = useDragHandle()
  const resizeRef = useRef<{ startY: number; lastY: number } | null>(null)
  const handleResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      resizeRef.current = { startY: e.clientY, lastY: e.clientY }
    },
    []
  )
  const handleResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current
      if (!drag) return
      const delta = e.clientY - drag.lastY
      drag.lastY = e.clientY
      if (delta !== 0) onResizeHeight(delta)
    },
    [onResizeHeight]
  )
  const handleResizeUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      resizeRef.current = null
    },
    []
  )
  const nameInputRef = useRef<HTMLInputElement>(null)
  const enabledFxCount = track.effects.filter((e) => e.enabled).length
  const [colorOpen, setColorOpen] = useState(false)
  // 3-mode layout: wide ≥180px tüm controls + pan knob inline; medium
  // 120-180px pan compact; narrow <120px sadece M S FX + volume popover
  const layoutMode: "wide" | "medium" | "narrow" =
    headerWidth >= 180 ? "wide" : headerWidth >= 120 ? "medium" : "narrow"
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            onClick={onSelect}
            className={cn(
              "group relative flex cursor-pointer items-stretch gap-2 border-b border-neutral-800 py-1.5 pe-2 transition",
              selected
                ? "bg-neutral-800/40 ring-1 ring-primary ring-inset"
                : "hover:bg-neutral-900/50"
            )}
            style={{
              height: trackHeight,
              // Bağlı grup varsa sol kenarda kalın renkli stripe
              boxShadow: groupColor ? `inset 4px 0 0 ${groupColor}` : undefined,
              paddingLeft: groupColor ? 6 : undefined,
            }}
          />
        }
      >
        {/* DnD grip handle — sol kenarda 12px, hover'da görünür */}
        {dragHandle && (
          <Tip text="Drag to reorder track">
            <button
              type="button"
              {...dragHandle.attributes}
              {...dragHandle.listeners}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex w-3 shrink-0 items-center justify-center text-neutral-600 transition hover:text-neutral-200",
                dragHandle.isDragging ? "cursor-grabbing" : "cursor-grab"
              )}
            >
              <HugeiconsIcon icon={DragDropVerticalIcon} size={12} />
            </button>
          </Tip>
        )}
        {/* Color stripe + picker */}
        <Popover open={colorOpen} onOpenChange={setColorOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="ms-0 w-1.5 shrink-0 cursor-pointer transition hover:w-2"
                style={{ background: track.color }}
                title="Click to change color"
              />
            }
          />
          <PopoverContent className="w-40 p-2" align="start">
            <div className="mb-1 text-[9px] tracking-widest text-neutral-500 uppercase">
              Track color
            </div>
            <div className="grid grid-cols-6 gap-1">
              {TRACK_COLOR_SWATCHES.map((c) => (
                <Tip key={c} text={c}>
                  <button
                    type="button"
                    onClick={() => {
                      onPatch({ color: c })
                      setColorOpen(false)
                    }}
                    className={cn(
                      "h-5 w-5 rounded transition hover:scale-110",
                      c === track.color && "ring-2 ring-white"
                    )}
                    style={{ background: c }}
                  />
                </Tip>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          {/* Row 1 — name + sağ üst köşede M/S + FX */}
          <div className="flex items-center gap-1.5">
            {track.frozen && (
              <Tip
                text={`Frozen ${fmtAgoShort(track.frozen.frozenAt)} ago — FX bypass, CPU saved. Unfreeze from kebab menu.`}
              >
                <span className="shrink-0 text-[10px] text-cyan-400">❄</span>
              </Tip>
            )}
            {trackOutputId && (
              <Tip text="Routed to an alternate output device (may add slight latency). Change from the track menu.">
                <span className="shrink-0 text-sky-400">
                  <HugeiconsIcon icon={HeadphonesIcon} size={10} />
                </span>
              </Tip>
            )}
            <input
              ref={nameInputRef}
              type="text"
              value={track.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "min-w-0 flex-1 truncate bg-transparent text-xs font-medium outline-none",
                track.frozen ? "text-cyan-200" : "text-neutral-100"
              )}
              title={track.name}
            />
            <Tip text="Mute">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPatch({ muted: !track.muted })
                }}
                className={cn(
                  "h-5 w-5 shrink-0 rounded border text-[8px] font-bold tracking-widest uppercase transition",
                  track.muted
                    ? "border-red-500/60 bg-red-500/20 text-red-300"
                    : "border-neutral-800 text-neutral-500 hover:text-neutral-200"
                )}
              >
                M
              </button>
            </Tip>
            <Tip text="Solo">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPatch({ soloed: !track.soloed })
                }}
                className={cn(
                  "h-5 w-5 shrink-0 rounded border text-[8px] font-bold tracking-widest uppercase transition",
                  track.soloed
                    ? "border-yellow-500/60 bg-yellow-500/20 text-yellow-300"
                    : "border-neutral-800 text-neutral-500 hover:text-neutral-200"
                )}
              >
                S
              </button>
            </Tip>
            <Tip text="Open FX chain editor">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenFx()
                }}
                className={cn(
                  "flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[8px] font-bold tracking-widest uppercase transition",
                  enabledFxCount > 0
                    ? "border-primary/60 bg-primary/20 text-primary"
                    : "border-neutral-800 text-neutral-500 hover:text-neutral-200"
                )}
              >
                FX{enabledFxCount > 0 && ` ${enabledFxCount}`}
              </button>
            </Tip>
            <TrackKebabMenu
              track={track}
              groups={groups}
              onPatch={onPatch}
              onDuplicate={onDuplicate}
              onExport={onExport}
              onRemove={onRemove}
              onFocusName={() => nameInputRef.current?.focus()}
              onChangeColor={() => setColorOpen(true)}
              onMoveToGroup={onMoveToGroup}
              onCreateGroupWithTrack={onCreateGroupWithTrack}
              onFreezeToggle={onFreezeToggle}
              outputDevices={outputDevices}
              trackOutputId={trackOutputId}
              onSetTrackOutput={onSetTrackOutput}
            />
          </div>

          {/* Row 2 — volume slider + pan knob (DJ-style rotary) */}
          {layoutMode !== "narrow" ? (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={track.volume}
                onChange={(e) => onPatch({ volume: Number(e.target.value) })}
                onClick={(e) => e.stopPropagation()}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-emerald-500"
                title={`Volume ${Math.round(track.volume * 100)}%`}
              />
              <CircularPanKnob
                value={track.pan}
                onChange={(v) => onPatch({ pan: v })}
                size={layoutMode === "wide" ? 22 : 18}
              />
              <VuMeter
                read={() => getTrackMeterDb(track.id)}
                orientation="vertical"
                width={4}
                height={layoutMode === "wide" ? 28 : 22}
                segments={layoutMode === "wide" ? 18 : 14}
              />
            </div>
          ) : (
            // Narrow — volume + pan ikisi de popover (alan dar)
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 rounded border border-neutral-800 px-1 py-0.5 font-mono text-[8px] text-neutral-400 hover:text-neutral-100"
                      title={`Volume ${Math.round(track.volume * 100)}%`}
                    >
                      VOL {Math.round(track.volume * 100)}
                    </button>
                  }
                />
                <PopoverContent className="w-40 p-2" align="start">
                  <div className="mb-1 text-[9px] tracking-widest text-neutral-500 uppercase">
                    Volume
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={track.volume}
                    onChange={(e) =>
                      onPatch({ volume: Number(e.target.value) })
                    }
                    className="h-1 w-full cursor-pointer accent-emerald-500"
                  />
                </PopoverContent>
              </Popover>
              <CircularPanKnob
                value={track.pan}
                onChange={(v) => onPatch({ pan: v })}
                size={16}
              />
              <VuMeter
                read={() => getTrackMeterDb(track.id)}
                orientation="vertical"
                width={3}
                height={20}
                segments={12}
              />
            </div>
          )}
        </div>
        {/* Vertical resize handle — alt kenarda 3px drag bandı.
            Tüm tracklerde zoomY global, drag senkron uygular. */}
        <Tip text="Drag vertically to resize all tracks">
          <div
            onPointerDown={handleResizeDown}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeUp}
            onPointerCancel={handleResizeUp}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 z-10 h-1 cursor-row-resize bg-transparent transition hover:bg-primary/40"
          />
        </Tip>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={() => nameInputRef.current?.focus()}>
          Rename
          <ContextMenuShortcut>↵</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setColorOpen(true)}>
          Change color…
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>Duplicate track</ContextMenuItem>
        {/* Right-click context: default formatla çıkar (header dropdown'unun
            seçimi) — kebab menu submenu daha granular. */}
        <ContextMenuItem onClick={() => onExport("wav")}>
          Export as WAV
          <ContextMenuShortcut>↓</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onExport("mp3")}>
          Export as MP3
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onExport("m4a")}
          disabled={!isM4aSupported()}
        >
          Export as M4A
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onPatch({ muted: !track.muted })}>
          {track.muted ? "Unmute" : "Mute"}
          <ContextMenuShortcut>M</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onPatch({ soloed: !track.soloed })}>
          {track.soloed ? "Unsolo" : "Solo"}
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onPatch({ pan: 0 })}>
          Reset pan to center
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* Move to group — kebab menü ile parity */}
        <ContextMenuSub>
          <ContextMenuSubTrigger>Move to group…</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={onCreateGroupWithTrack}>
              <span className="text-primary">+ New group</span>
            </ContextMenuItem>
            {track.groupId && (
              <ContextMenuItem onClick={() => onMoveToGroup(undefined)}>
                <span className="text-muted-foreground">— Ungroup</span>
              </ContextMenuItem>
            )}
            {groups.length === 0 ? (
              <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                No groups yet
              </div>
            ) : (
              groups.map((g) => (
                <ContextMenuItem key={g.id} onClick={() => onMoveToGroup(g.id)}>
                  <span
                    className="me-2 h-2 w-2 rounded-sm"
                    style={{ background: g.color }}
                  />
                  <span className="flex-1">{g.name}</span>
                  {track.groupId === g.id && (
                    <ContextMenuShortcut>✓</ContextMenuShortcut>
                  )}
                </ContextMenuItem>
              ))
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={onFreezeToggle}>
          {track.frozen ? "❄ Unfreeze track" : "❄ Freeze track"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={onRemove}
          className="text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300"
        >
          Delete track
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ─── TrackKebabMenu — sağ üst köşede 3-dot, ContextMenu ile aynı action set
//
// Sağ-tık her zaman çalışıyor ama discoverable değil; kebab butonu UI
// kullanıcısına aynı menüyü açıkça sunar. Popover içinde MenuItem benzeri
// list — shadcn ContextMenu reusable değil bu pozisyonda, manuel render.

function TrackKebabMenu({
  track,
  groups,
  onPatch,
  onDuplicate,
  onExport,
  onRemove,
  onFocusName,
  onChangeColor,
  onMoveToGroup,
  onCreateGroupWithTrack,
  onFreezeToggle,
  outputDevices,
  trackOutputId,
  onSetTrackOutput,
}: {
  track: MusicianTrack
  groups: Array<{ id: string; name: string; color: string; collapsed: boolean }>
  onPatch(patch: Partial<MusicianTrack>): void
  onDuplicate(): void
  onExport(format: AudioFormat): void
  onRemove(): void
  onFocusName(): void
  onChangeColor(): void
  onMoveToGroup(groupId: string | undefined): void
  onCreateGroupWithTrack(): void
  onFreezeToggle(): void
  outputDevices: AudioDeviceOption[]
  trackOutputId: string | null
  onSetTrackOutput(deviceId: string | null): void
}) {
  // Feature-detect — Safari'de submenu hiç görünmez, davranış aynen eski.
  const outputRoutingSupported = isTrackOutputRoutingSupported()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200"
            title="Track menu"
          />
        }
      >
        <HugeiconsIcon icon={MoreVerticalIcon} size={11} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52" align="end">
        <DropdownMenuItem onClick={onFocusName}>Rename</DropdownMenuItem>
        <DropdownMenuItem onClick={onChangeColor}>
          Change color…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
        {/* Export submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Export track…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(["wav", "mp3", "m4a"] as const).map((fmt) => {
              const meta = FORMAT_META[fmt]
              const disabled = fmt === "m4a" && !isM4aSupported()
              return (
                <DropdownMenuItem
                  key={fmt}
                  disabled={disabled}
                  onClick={() => onExport(fmt)}
                >
                  <span>as {meta.label}</span>
                  <DropdownMenuShortcut>.{meta.ext}</DropdownMenuShortcut>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {/* Move to group submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to group…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={onCreateGroupWithTrack}>
              <span className="text-primary">+ New group</span>
            </DropdownMenuItem>
            {track.groupId && (
              <DropdownMenuItem onClick={() => onMoveToGroup(undefined)}>
                <span className="text-muted-foreground">— Ungroup</span>
              </DropdownMenuItem>
            )}
            {groups.length === 0 ? (
              // Base UI: DropdownMenuLabel (Menu.Group.Label) parent
              // DropdownMenuGroup gerektirir; submenu içinde group yok →
              // "MenuGroupContext is missing" crash. Plain div ile ver.
              <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                No groups yet
              </div>
            ) : (
              groups.map((g) => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() => onMoveToGroup(g.id)}
                >
                  <span
                    className="me-2 h-2 w-2 rounded-sm"
                    style={{ background: g.color }}
                  />
                  <span className="flex-1">{g.name}</span>
                  {track.groupId === g.id && (
                    <DropdownMenuShortcut>✓</DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onPatch({ muted: !track.muted })}>
          {track.muted ? "Unmute" : "Mute"}
          <DropdownMenuShortcut>M</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPatch({ soloed: !track.soloed })}>
          {track.soloed ? "Unsolo" : "Solo"}
          <DropdownMenuShortcut>S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPatch({ pan: 0 })}>
          Reset pan
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onFreezeToggle}>
          <span>{track.frozen ? "❄ Unfreeze track" : "❄ Freeze track"}</span>
          {track.frozen && (
            <DropdownMenuShortcut>
              {fmtAgoShort(track.frozen.frozenAt)}
            </DropdownMenuShortcut>
          )}
        </DropdownMenuItem>
        {/* Per-track alternatif çıkış — karaoke: mix hoparlöre, bu track
            kulaklığa. Yalnız setSinkId destekleyen tarayıcılarda görünür. */}
        {outputRoutingSupported && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon icon={HeadphonesIcon} size={11} />
              Output device
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-64 w-56 overflow-y-auto">
              <DropdownMenuItem onClick={() => onSetTrackOutput(null)}>
                <span className="flex-1">Master (default)</span>
                {!trackOutputId && <DropdownMenuShortcut>✓</DropdownMenuShortcut>}
              </DropdownMenuItem>
              {outputDevices.length === 0 ? (
                <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
                  No devices listed — allow access from the speaker icon in
                  the master strip
                </div>
              ) : (
                outputDevices.map((d) => (
                  <DropdownMenuItem
                    key={d.deviceId}
                    onClick={() => onSetTrackOutput(d.deviceId)}
                  >
                    <span className="flex-1 truncate">{d.label}</span>
                    {trackOutputId === d.deviceId && (
                      <DropdownMenuShortcut>✓</DropdownMenuShortcut>
                    )}
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <div className="px-2 py-1 text-[9px] leading-snug text-muted-foreground">
                Alternate outputs may add slight latency vs the master bus
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          Delete track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick(): void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] leading-tight transition",
        danger
          ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
          : "text-neutral-200 hover:bg-neutral-800"
      )}
    >
      {children}
    </button>
  )
}

// ─── CircularPanKnob (DJ-style rotary) ────────────────────────────────────

/**
 * DJ console pan knob — drag dikey (yukarı=sağ, aşağı=sol) ya da
 * yatay (sağ=sağ, sol=sol) iki eksenli; ikisinin toplamı pan delta.
 * Çift tık → center reset. Görsel: dış halka + dönen indikatör çizgisi
 * pan'a göre -135°...+135° açıyla.
 */
function CircularPanKnob({
  value,
  onChange,
  size = 22,
}: {
  value: number
  onChange(next: number): void
  size?: number
}) {
  const dragRef = useRef<{
    startX: number
    startY: number
    startVal: number
  } | null>(null)
  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startVal: value,
      }
    },
    [value]
  )
  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      // 100px hareket = 1.0 pan delta. dx ve -dy birleşik.
      const dx = e.clientX - drag.startX
      const dy = drag.startY - e.clientY
      const delta = (dx + dy) / 100
      const next = Math.max(-1, Math.min(1, drag.startVal + delta))
      onChange(next)
    },
    [onChange]
  )
  const handleUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    dragRef.current = null
  }, [])
  const handleDouble = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      onChange(0)
    },
    [onChange]
  )
  // -1..+1 → -135°..+135°
  const angle = value * 135
  const half = size / 2
  // Indicator line from center to outer edge
  const indicatorY = -half * 0.65
  const isCenter = Math.abs(value) < 0.01
  const tip = isCenter
    ? "Center"
    : value < 0
      ? `L ${Math.round(Math.abs(value) * 100)}`
      : `R ${Math.round(value * 100)}`
  return (
    <Tip text={`Pan: ${tip} — drag to adjust, double-click to center`}>
      <div
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onDoubleClick={handleDouble}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 cursor-ns-resize touch-none select-none"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`-${half} -${half} ${size} ${size}`}
        >
          {/* Outer ring */}
          <circle
            cx={0}
            cy={0}
            r={half - 1}
            fill="#171717"
            stroke="#404040"
            strokeWidth={1}
          />
          {/* Center dot */}
          <circle
            cx={0}
            cy={0}
            r={1.2}
            fill={isCenter ? "#22c55e" : "#737373"}
          />
          {/* L/R tick marks (top of knob = center) */}
          <line
            x1={-half * 0.95}
            y1={half * 0.6}
            x2={-half * 0.75}
            y2={half * 0.5}
            stroke="#525252"
            strokeWidth={0.75}
          />
          <line
            x1={half * 0.95}
            y1={half * 0.6}
            x2={half * 0.75}
            y2={half * 0.5}
            stroke="#525252"
            strokeWidth={0.75}
          />
          {/* Rotating indicator line */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={indicatorY}
            stroke={isCenter ? "#22c55e" : value < 0 ? "#f43f5e" : "#06b6d4"}
            strokeWidth={1.5}
            strokeLinecap="round"
            transform={`rotate(${angle})`}
          />
        </svg>
      </div>
    </Tip>
  )
}

// ─── HeaderResizeHandle ──────────────────────────────────────────────────

/**
 * Track header kolonunu yeniden boyutlandıran dikey divider.
 * Pointer drag → headerWidth; double-click → reset default.
 * Clamp: [TRACK_HEADER_WIDTH_MIN, TRACK_HEADER_WIDTH_MAX].
 */
function HeaderResizeHandle({
  width,
  onResize,
}: {
  width: number
  onResize(next: number): void
}) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      dragRef.current = { startX: e.clientX, startWidth: width }
    },
    [width]
  )
  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const next = drag.startWidth + (e.clientX - drag.startX)
      onResize(
        Math.max(TRACK_HEADER_WIDTH_MIN, Math.min(TRACK_HEADER_WIDTH_MAX, next))
      )
    },
    [onResize]
  )
  const handleUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    dragRef.current = null
  }, [])
  const handleDouble = useCallback(() => {
    onResize(TRACK_HEADER_WIDTH_DEFAULT)
  }, [onResize])
  return (
    <Tip text="Drag to resize — double-click to reset">
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onDoubleClick={handleDouble}
        className="group/divider relative z-10 w-px shrink-0 cursor-col-resize bg-neutral-800 transition hover:bg-pink-500/60"
      >
        <div className="absolute inset-y-0 -right-1.5 -left-1.5" />
      </div>
    </Tip>
  )
}

// ─── TimelinePanel ────────────────────────────────────────────────────────

function TimelinePanel({
  tree,
  totalSec,
  transportSec,
  pxPerSec,
  trackHeight,
  onSeek,
  onZoomX,
  onZoomFit,
  onDropOnTrack,
  onDropFilesOnTrack,
  onRemoveClip,
  onPatchClip,
  onMoveClipToTrack,
  onDuplicateClip,
  onSplitClipAtPlayhead,
  onTapeStopClip,
  onEnterClipEdit,
  loopRegion,
  markers,
  onLoopRegionChange,
  rangeSelection,
  onRangeSelectionChange,
  onToggleLoopFromSelection,
  snapTime,
  onMarkerSeek,
  onMarkerPatch,
  onMarkerRemove,
  selectedClipKeys,
  onClipSelect,
  onBulkMoveByDelta,
  onLaneBackgroundClick,
  autoCrossfade,
  hiddenTrackIds,
  automationMode,
}: {
  tree: StudioMusicianProjectTree
  totalSec: number
  transportSec: number
  pxPerSec: number
  trackHeight: number
  onSeek(s: number): void
  onZoomX(deltaSign: number): void
  /** Fit-to-content: tüm clip'ler tek ekrana sığsın. Viewport genişliği
   *  geçilir; caller pxPerSec hesabını yapar. */
  onZoomFit(viewportPx: number): void
  onDropOnTrack(
    trackId: string,
    e: React.DragEvent<HTMLDivElement>,
    timelineEl: HTMLDivElement
  ): void
  /** Finder/OS dosyaları doğrudan lane'e bırakılınca — local-first import
   *  + bırakılan zaman/track'e klip yerleştirme. */
  onDropFilesOnTrack(
    trackId: string,
    e: React.DragEvent<HTMLDivElement>,
    timelineEl: HTMLDivElement
  ): void
  onRemoveClip(trackId: string, clipId: string): void
  onPatchClip(
    trackId: string,
    clipId: string,
    patch: Partial<MusicianClip>
  ): void
  onMoveClipToTrack(
    fromTrackId: string,
    toTrackId: string,
    clipId: string
  ): void
  onDuplicateClip(trackId: string, clipId: string): void
  /** Clip'i o anki playhead pozisyonunda böl — atSec editor-level
   *  transportSecRef'ten okunur (stable identity, memo dostu). */
  onSplitClipAtPlayhead(trackId: string, clipId: string): void
  onTapeStopClip(trackId: string, clipId: string, durationSec: number): void
  onEnterClipEdit(trackId: string, clipId: string): void
  loopRegion?: { start: number; end: number; enabled: boolean }
  markers: Array<{
    id: string
    time: number
    label: string
    color?: string
  }>
  onLoopRegionChange(
    region: { start: number; end: number; enabled: boolean } | null
  ): void
  /** Ruler drag'iyle seçilen zaman aralığı — saniye cinsinden. */
  rangeSelection: { start: number; end: number } | null
  onRangeSelectionChange(sel: { start: number; end: number } | null): void
  /** Seçim bandına tıklama / L: loop'u seçimden set/clear eder. */
  onToggleLoopFromSelection(): void
  /** Snap ayarına saygılı zaman yuvarlama (snap kapalıysa passthrough). */
  snapTime(sec: number): number
  onMarkerSeek(sec: number): void
  onMarkerPatch(
    id: string,
    patch: Partial<{ time: number; label: string; color: string | undefined }>
  ): void
  onMarkerRemove(id: string): void
  selectedClipKeys: Set<string>
  onClipSelect(
    trackId: string,
    clipId: string,
    mode: "single" | "toggle" | "add"
  ): void
  /** Drag eden anchor için: aynı delta'yı tüm seçili clip'lere uygula.
   *  Anchor sadece kendisi seçili veya selection.size===1 ise false döner;
   *  caller normal patchClip akışına döner. */
  onBulkMoveByDelta(
    anchorTrackId: string,
    anchorClipId: string,
    deltaSec: number
  ): boolean
  onLaneBackgroundClick(): void
  autoCrossfade: boolean
  /** Collapsed grup üyeleri — lane render'dan skip edilir. */
  hiddenTrackIds: Set<string>
  automationMode: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Project genişliğinden daha kısa olsa bile timeline tam viewport'u
  // doldurur — yatayda ortada askıda kalan kısa proje görünümü olmaz.
  const projectWidth = totalSec * pxPerSec
  const totalWidth = Math.max(projectWidth, containerWidth)
  const rulerSecs = Math.ceil(totalWidth / pxPerSec)
  const lanesHeight =
    (tree.tracks.length - hiddenTrackIds.size) * trackHeight

  // ─── Ruler drag = zaman aralığı seçimi ─────────────────────────────────
  // pointerdown anchor kaydeder; 4px eşiği aşınca drag başlar (altında
  // kalan hareket sade click = seek). State SANİYE cinsinden — zoom
  // değişse de aralık doğru ölçeklenir. Snap aktifse kenarlar grid'e oturur.
  const rulerDragRef = useRef<{
    anchorRawSec: number
    startClientX: number
    dragging: boolean
  } | null>(null)
  // Drag sonrası tarayıcının ürettiği click'i yutmak için — yoksa drag
  // bitince seek tetiklenip playhead zıplar.
  const didDragRef = useRef(false)

  const handleRulerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      didDragRef.current = false
      const rect = e.currentTarget.getBoundingClientRect()
      rulerDragRef.current = {
        anchorRawSec: Math.max(0, (e.clientX - rect.left) / pxPerSec),
        startClientX: e.clientX,
        dragging: false,
      }
    },
    [pxPerSec]
  )

  const handleRulerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = rulerDragRef.current
      if (!st || pxPerSec === 0) return
      if (!st.dragging) {
        // 4px eşik — marker/seek tıklamalarıyla çakışmasın
        if (Math.abs(e.clientX - st.startClientX) < 4) return
        st.dragging = true
        didDragRef.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {}
      }
      const rect = e.currentTarget.getBoundingClientRect()
      const raw = Math.max(0, (e.clientX - rect.left) / pxPerSec)
      const a = Math.max(0, snapTime(st.anchorRawSec))
      const b = Math.max(0, snapTime(raw))
      const start = Math.min(a, b)
      const end = Math.max(a, b)
      onRangeSelectionChange(end - start > 0.001 ? { start, end } : null)
    },
    [pxPerSec, snapTime, onRangeSelectionChange]
  )

  const handleRulerPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = rulerDragRef.current
      rulerDragRef.current = null
      if (st?.dragging) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {}
      }
    },
    []
  )

  // ─── Memoized ruler ticks — rAF-frekanslı panel render'ında (playhead)
  // tick sub-tree identity'si sabit kalır, React reconcile'ı atlar. ───────
  const rulerTicks = useMemo(
    () =>
      Array.from({ length: rulerSecs }, (_, i) => i).map((s) => (
        <div
          key={s}
          className="pointer-events-none absolute top-0 h-full"
          style={{ left: s * pxPerSec }}
        >
          <div
            className={cn(
              "absolute top-0 w-px",
              s % 5 === 0 ? "h-full bg-neutral-700" : "h-1.5 bg-neutral-800"
            )}
          />
          {s % 5 === 0 && (
            <div
              className={cn(
                "absolute top-1 ms-1 font-mono text-[9px]",
                s >= totalSec ? "text-neutral-700" : "text-neutral-500"
              )}
            >
              {s}s
            </div>
          )}
        </div>
      )),
    [rulerSecs, pxPerSec, totalSec]
  )

  // ─── Memoized marker flags — markers/zoom değişmedikçe sabit. ──────────
  const markerFlags = useMemo(
    () =>
      markers.map((m) => (
        <Tip
          key={m.id}
          text={`${m.label} @ ${m.time.toFixed(2)}s — click seek, dbl-click rename, right-click delete`}
        >
          <div
            className="group/mark absolute top-0 z-20 flex h-full items-start"
            style={{
              left: m.time * pxPerSec,
              transform: "translateX(-2px)",
            }}
            onClick={(e) => {
              e.stopPropagation()
              onMarkerSeek(m.time)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              void (async () => {
                const next = await promptInput({
                  title: "Rename marker",
                  label: "Marker label",
                  defaultValue: m.label,
                  confirmText: "Rename",
                })
                if (next !== null && next.trim() !== "") {
                  onMarkerPatch(m.id, { label: next.trim() })
                }
              })()
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void (async () => {
                const ok = await confirm({
                  title: `Delete marker "${m.label}"?`,
                  description: "The marker flag will be removed from the ruler.",
                  confirmText: "Delete",
                  destructive: true,
                })
                if (ok) onMarkerRemove(m.id)
              })()
            }}
          >
            <div
              className="h-3 w-3 cursor-pointer transition group-hover/mark:scale-125"
              style={{
                background: m.color ?? "#eab308",
                clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)",
              }}
            />
            <span
              className="ms-1 hidden truncate font-mono text-[9px] text-neutral-300 group-hover/mark:inline"
              style={{ maxWidth: 80 }}
            >
              {m.label}
            </span>
          </div>
        </Tip>
      )),
    [markers, pxPerSec, onMarkerSeek, onMarkerPatch, onMarkerRemove]
  )

  return (
    <div className="relative flex-1 overflow-hidden bg-neutral-950">
      {/* Fit-to-content — scroll container'ın DIŞINDA, viewport sağ-üstünde
          absolute sabit. Eskiden scroll içinde float:right + sticky top idi →
          yatay scroll'da timeline'la birlikte kayıyordu. */}
      <button
        type="button"
        onClick={() => onZoomFit(containerWidth)}
        className="absolute right-2 top-1 z-30 flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-neutral-300 shadow-lg backdrop-blur transition hover:bg-neutral-800 hover:text-emerald-300"
        title="Fit timeline — all clips in one view"
      >
        Fit
      </button>
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto"
        onWheel={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return
          e.preventDefault()
          onZoomX(e.deltaY)
        }}
      >
      <div style={{ width: totalWidth }}>
        {/* Ruler — click = seek, drag = zaman aralığı seçimi */}
        <div
          className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur"
          style={{ height: RULER_HEIGHT, width: totalWidth }}
          onPointerDown={handleRulerPointerDown}
          onPointerMove={handleRulerPointerMove}
          onPointerUp={handleRulerPointerUp}
          onPointerCancel={handleRulerPointerUp}
          onClick={(e) => {
            // Drag bittiğinde üretilen click'i yut — seek yok
            if (didDragRef.current) {
              didDragRef.current = false
              return
            }
            const rect = e.currentTarget.getBoundingClientRect()
            const sec = (e.clientX - rect.left) / pxPerSec
            onSeek(Math.max(0, sec))
            // Sade tık mevcut aralık seçimini temizler (DAW standardı)
            if (rangeSelection) onRangeSelectionChange(null)
          }}
        >
          {/* Tick line + label her saniyenin başında. Klavuz çizgisi
              (border-l) ve label görsel olarak tek nokta — kullanıcı
              tıkladığı x = indicator'ın gittiği saniye. */}
          {rulerTicks}
          {/* Zaman aralığı seçim bandı — tıklama loop toggle (L ile aynı).
              Loop aktifken LoopRegionOverlay (z-30) üstünü kapatır. */}
          {rangeSelection && (
            <Tip text="Time selection — click to toggle loop (L). Drag ruler to reselect, Esc to clear">
              <div
                className="absolute top-0 z-[15] h-full cursor-pointer border-x border-sky-400/70 bg-sky-400/20 transition-colors hover:bg-sky-400/30"
                style={{
                  left: rangeSelection.start * pxPerSec,
                  width: Math.max(
                    2,
                    (rangeSelection.end - rangeSelection.start) * pxPerSec
                  ),
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (didDragRef.current) {
                    didDragRef.current = false
                    return
                  }
                  onToggleLoopFromSelection()
                }}
              />
            </Tip>
          )}
          {/* Marker flags — ruler üst kenarında küçük üçgen + label */}
          {markerFlags}
          {/* Loop region overlay — ruler boyunca kuşak + sürüklenebilir
              start/end handle'ları. Sadece enabled iken görünür. */}
          {loopRegion && loopRegion.enabled && (
            <LoopRegionOverlay
              region={loopRegion}
              pxPerSec={pxPerSec}
              snapTime={snapTime}
              onChange={onLoopRegionChange}
            />
          )}
        </div>

        {/* Track lanes — collapsed grup üyeleri gizli (hiddenTrackIds) */}
        {tree.tracks
          .filter((track) => !hiddenTrackIds.has(track.id))
          .map((track) => (
            <TrackLane
              key={track.id}
              track={track}
              totalWidth={totalWidth}
              pxPerSec={pxPerSec}
              trackHeight={trackHeight}
              transportSec={transportSec}
              onDropOnTrack={onDropOnTrack}
              onDropFilesOnTrack={onDropFilesOnTrack}
              onRemoveClip={onRemoveClip}
              onPatchClip={onPatchClip}
              onMoveClipToTrack={onMoveClipToTrack}
              onDuplicateClip={onDuplicateClip}
              onSplitClipAtPlayhead={onSplitClipAtPlayhead}
              onTapeStopClip={onTapeStopClip}
              onEnterClipEdit={onEnterClipEdit}
              selectedClipKeys={selectedClipKeys}
              onClipSelect={onClipSelect}
              onBulkMoveByDelta={onBulkMoveByDelta}
              onLaneBackgroundClick={onLaneBackgroundClick}
              autoCrossfade={autoCrossfade}
              automationMode={automationMode}
            />
          ))}

        {/* Zaman aralığı seçimi — timeline gövdesinde soluk overlay
            (loop bandından ayrı renk; yalnız görsel, pointer geçirmez). */}
        {rangeSelection && (
          <div
            className="pointer-events-none absolute z-[9]"
            style={{
              left: rangeSelection.start * pxPerSec,
              width: Math.max(
                2,
                (rangeSelection.end - rangeSelection.start) * pxPerSec
              ),
              top: RULER_HEIGHT,
              height: lanesHeight,
              background: "rgba(56,189,248,0.07)",
              borderLeft: "1px dashed rgba(56,189,248,0.4)",
              borderRight: "1px dashed rgba(56,189,248,0.4)",
            }}
          />
        )}
        {/* Loop region body band — track'lerin üzerine yarı saydam strip;
            visual sınırlandırma için (audio Tone.Transport.loop ile zaten
            döner). Ruler bölümündeki overlay kullanıcıya draggable, bu
            yalnız visual hint. */}
        {loopRegion && loopRegion.enabled && (
          <div
            className="pointer-events-none absolute z-10"
            style={{
              left: loopRegion.start * pxPerSec,
              width: Math.max(
                2,
                (loopRegion.end - loopRegion.start) * pxPerSec
              ),
              top: RULER_HEIGHT,
              height: lanesHeight,
              background:
                "linear-gradient(180deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)",
              borderLeft: "1px dashed rgba(245,158,11,0.5)",
              borderRight: "1px dashed rgba(245,158,11,0.5)",
            }}
          />
        )}
        {/* Playhead — abs positioned, follows transportSec */}
        <div
          className="pointer-events-none absolute top-0 z-20 w-px bg-red-500"
          style={{
            left: transportSec * pxPerSec,
            height: lanesHeight + RULER_HEIGHT,
          }}
        >
          <div className="absolute -top-1 -left-1 h-2 w-2 rotate-45 bg-red-500" />
        </div>
      </div>
      </div>
    </div>
  )
}

// ─── LoopRegionOverlay — ruler içinde sürüklenebilir loop region ───────
//
// Kenar handle'ları = resize (snap'e oturur), gövde = taşı, çift tık =
// loop'u tamamen kaldır. State saniye cinsinden geldiği için zoom
// değişiminde px hesapları render'da otomatik doğru ölçeklenir.

function LoopRegionOverlay({
  region,
  pxPerSec,
  snapTime,
  onChange,
}: {
  region: { start: number; end: number; enabled: boolean }
  pxPerSec: number
  /** Snap ayarına saygılı zaman yuvarlama (snap kapalıysa passthrough). */
  snapTime(sec: number): number
  onChange(next: { start: number; end: number; enabled: boolean } | null): void
}) {
  const dragRef = useRef<{
    mode: "body" | "start" | "end"
    startX: number
    startStart: number
    startEnd: number
    moved: boolean
  } | null>(null)

  const onDown = useCallback(
    (mode: "body" | "start" | "end") =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        e.stopPropagation()
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {}
        dragRef.current = {
          mode,
          startX: e.clientX,
          startStart: region.start,
          startEnd: region.end,
          moved: false,
        }
      },
    [region.start, region.end]
  )
  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || pxPerSec === 0) return
      // 2px eşik — çift tık arasındaki mikro jitter loop'u kaydırmasın
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < 2) return
      drag.moved = true
      const deltaSec = (e.clientX - drag.startX) / pxPerSec
      if (drag.mode === "body") {
        const len = drag.startEnd - drag.startStart
        const nextStart = Math.max(0, snapTime(drag.startStart + deltaSec))
        onChange({
          start: nextStart,
          end: nextStart + len,
          enabled: true,
        })
      } else if (drag.mode === "start") {
        const nextStart = Math.max(
          0,
          Math.min(drag.startEnd - 0.05, snapTime(drag.startStart + deltaSec))
        )
        onChange({ start: nextStart, end: drag.startEnd, enabled: true })
      } else if (drag.mode === "end") {
        const nextEnd = Math.max(
          drag.startStart + 0.05,
          snapTime(drag.startEnd + deltaSec)
        )
        onChange({ start: drag.startStart, end: nextEnd, enabled: true })
      }
    },
    [pxPerSec, snapTime, onChange]
  )
  const onUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    dragRef.current = null
  }, [])

  const left = region.start * pxPerSec
  const width = Math.max(4, (region.end - region.start) * pxPerSec)
  return (
    <div
      className="absolute top-0 z-30 h-full"
      style={{ left, width }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        // Çift tık = loop'u kaldır (DAW standardı)
        e.stopPropagation()
        onChange(null)
      }}
    >
      <Tip
        text={`Loop: ${region.start.toFixed(2)}s → ${region.end.toFixed(2)}s — drag to move, double-click to remove`}
      >
        <div
          onPointerDown={onDown("body")}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute inset-0 cursor-grab bg-amber-500/30 active:cursor-grabbing"
          style={{
            borderTop: "2px solid rgb(245,158,11)",
            borderBottom: "1px solid rgba(245,158,11,0.4)",
          }}
        />
      </Tip>
      <Tip text="Drag to set loop start">
        <div
          onPointerDown={onDown("start")}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-amber-400"
        />
      </Tip>
      <Tip text="Drag to set loop end">
        <div
          onPointerDown={onDown("end")}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-amber-400"
        />
      </Tip>
    </div>
  )
}

/**
 * CrossfadeOverlapVisual — TrackLane içinde overlap eden clip pair'leri
 * için yarı saydam X-shape SVG. Her overlap zone'unda iki çapraz çizgi:
 *   - Outgoing clip'in fade-out eğrisi (sol → sağ azalır)
 *   - Incoming clip'in fade-in eğrisi (sol → sağ artar)
 * Kullanıcı görsel olarak "şurada otomatik geçiş var" görür.
 *
 * memo: TrackLane playhead (rAF) yüzünden her frame render olur; clips/zoom
 * değişmedikçe bu SVG hesabı + render'ı atlanır.
 */
const CrossfadeOverlapVisual = memo(function CrossfadeOverlapVisual({
  clips,
  pxPerSec,
  color,
}: {
  clips: MusicianClip[]
  pxPerSec: number
  color: string
}) {
  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => a.startTime - b.startTime),
    [clips]
  )
  const overlaps: Array<{ start: number; end: number; key: string }> = []
  for (let i = 0; i < sortedClips.length - 1; i++) {
    const a = sortedClips[i]!
    const b = sortedClips[i + 1]!
    const aEnd = a.startTime + a.duration
    if (aEnd > b.startTime) {
      overlaps.push({
        start: b.startTime,
        end: Math.min(aEnd, b.startTime + b.duration),
        key: `${a.id}-${b.id}`,
      })
    }
  }
  if (overlaps.length === 0) return null
  return (
    <>
      {overlaps.map((ov) => {
        const left = ov.start * pxPerSec
        const width = Math.max(2, (ov.end - ov.start) * pxPerSec)
        return (
          <svg
            key={ov.key}
            className="pointer-events-none absolute top-1 z-[6] h-[calc(100%-8px)]"
            style={{ left, width }}
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            {/* Outgoing fade-out — sol üstten sağ alta */}
            <line
              x1={0}
              y1={5}
              x2={100}
              y2={95}
              stroke={color}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              opacity={0.7}
            />
            {/* Incoming fade-in — sol alttan sağ üste */}
            <line
              x1={0}
              y1={95}
              x2={100}
              y2={5}
              stroke={color}
              strokeWidth={1.2}
              strokeDasharray="3 2"
              opacity={0.7}
            />
            {/* X intersect highlight */}
            <circle cx={50} cy={50} r={1.5} fill={color} opacity={0.9} />
          </svg>
        )
      })}
    </>
  )
})

function TrackLane({
  track,
  totalWidth,
  pxPerSec,
  trackHeight,
  transportSec,
  onDropOnTrack,
  onDropFilesOnTrack,
  onRemoveClip,
  onPatchClip,
  onMoveClipToTrack,
  onDuplicateClip,
  onSplitClipAtPlayhead,
  onTapeStopClip,
  onEnterClipEdit,
  selectedClipKeys,
  onClipSelect,
  onBulkMoveByDelta,
  onLaneBackgroundClick,
  automationMode,
  autoCrossfade,
}: {
  track: MusicianTrack
  totalWidth: number
  pxPerSec: number
  trackHeight: number
  transportSec: number
  // Callback'ler editor-level useCallback'lerdir (trackId parametreli) ve
  // curry'lenmeden ClipBlock'a geçirilir — memo(ClipBlock) ancak identity
  // stable prop'larla işe yarar (aksi halde her rAF frame'inde yeni inline
  // lambda üretilir ve memo bail-out hiç gerçekleşmezdi).
  onDropOnTrack(
    trackId: string,
    e: React.DragEvent<HTMLDivElement>,
    timelineEl: HTMLDivElement
  ): void
  /** Finder/OS dosyaları — local-first import + klip yerleştirme. */
  onDropFilesOnTrack(
    trackId: string,
    e: React.DragEvent<HTMLDivElement>,
    timelineEl: HTMLDivElement
  ): void
  onRemoveClip(trackId: string, clipId: string): void
  onPatchClip(
    trackId: string,
    clipId: string,
    patch: Partial<MusicianClip>
  ): void
  onMoveClipToTrack(
    fromTrackId: string,
    toTrackId: string,
    clipId: string
  ): void
  onDuplicateClip(trackId: string, clipId: string): void
  onSplitClipAtPlayhead(trackId: string, clipId: string): void
  onTapeStopClip(trackId: string, clipId: string, durationSec: number): void
  onEnterClipEdit(trackId: string, clipId: string): void
  selectedClipKeys: Set<string>
  onClipSelect(
    trackId: string,
    clipId: string,
    mode: "single" | "toggle" | "add"
  ): void
  onBulkMoveByDelta(
    anchorTrackId: string,
    anchorClipId: string,
    deltaSec: number
  ): boolean
  onLaneBackgroundClick(): void
  autoCrossfade: boolean
  automationMode: boolean
}) {
  const laneRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      ref={laneRef}
      data-track-id={track.id}
      className={cn(
        "relative border-b border-neutral-800 transition",
        dragOver && "bg-cyan-500/10"
      )}
      style={{ height: trackHeight, width: totalWidth }}
      onClick={(e) => {
        // Sade lane background click → seçimi temizle. Clip click event
        // stopPropagation yapıyor, buraya gelmiyor.
        if (e.target === e.currentTarget) onLaneBackgroundClick()
      }}
      onDragOver={(e) => {
        // Library sürüklemesi VEYA OS dosyası (Finder → timeline direkt
        // drop). dataTransfer.types kontrolü dnd-kit ile çakışmaz — dnd-kit
        // PointerSensor kullanır, native HTML5 DnD event'i üretmez.
        if (
          e.dataTransfer.types.includes(LIBRARY_DRAG_MIME) ||
          e.dataTransfer.types.includes("Files")
        ) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        if (!laneRef.current) return
        // OS dosyası → local-first import + yerleştirme
        if (
          e.dataTransfer.types.includes("Files") &&
          e.dataTransfer.files.length > 0
        ) {
          e.preventDefault()
          onDropFilesOnTrack(track.id, e, laneRef.current)
          return
        }
        onDropOnTrack(track.id, e, laneRef.current)
      }}
    >
      {/* Frozen track — orijinal clip'ler + crossfade visual gizli;
          tek bir cyan-tonlu "frozen" bar render edilir, kullanıcıya
          "bu track render edilmiş, edit için unfreeze" feedback'i. */}
      {track.frozen ? (
        <Tip
          text={`Frozen ${fmtAgoShort(track.frozen.frozenAt)} ago — ${track.frozen.duration.toFixed(2)}s rendered. Unfreeze to edit clips.`}
        >
          <div
            className="pointer-events-none absolute top-1 flex h-[calc(100%-8px)] items-center overflow-hidden rounded border border-dashed border-cyan-500/60 bg-cyan-500/10 px-2 text-[10px] text-cyan-300"
            style={{ left: 0, width: track.frozen.duration * pxPerSec }}
          >
            <span className="me-1">❄</span>
            <span className="truncate font-medium">
              Frozen ({track.frozen.duration.toFixed(1)}s)
            </span>
          </div>
        </Tip>
      ) : (
        <>
          {/* Auto-crossfade overlap visual — overlap eden clip pair'lerinde
              X-shape SVG; user'a "burada otomatik geçiş var" visual hint. */}
          {autoCrossfade && (
            <CrossfadeOverlapVisual
              clips={track.clips}
              pxPerSec={pxPerSec}
              color={track.color}
            />
          )}
        </>
      )}
      {!track.frozen &&
        track.clips.map((clip) => (
          <ClipBlock
            key={clip.id}
            clip={clip}
            trackId={track.id}
            color={track.color}
            pxPerSec={pxPerSec}
            // Boolean olarak lane'de hesaplanır — raw transportSec prop'u
            // her rAF frame'inde değişip memo'yu kırardı; bu bayrak yalnız
            // playhead clip sınırlarını geçerken değişir.
            playheadOver={
              transportSec > clip.startTime + 0.05 &&
              transportSec < clip.startTime + clip.duration - 0.05
            }
            selected={selectedClipKeys.has(`${track.id}::${clip.id}`)}
            automationMode={automationMode}
            onClipSelect={onClipSelect}
            onBulkMoveByDelta={onBulkMoveByDelta}
            onRemoveClip={onRemoveClip}
            onPatchClip={onPatchClip}
            onDuplicateClip={onDuplicateClip}
            onSplitAtPlayhead={onSplitClipAtPlayhead}
            onTapeStopClip={onTapeStopClip}
            onEnterClipEdit={onEnterClipEdit}
            onMoveClipToTrack={onMoveClipToTrack}
          />
        ))}
    </div>
  )
}

/**
 * Timeline clip — pointer events ile drag (body) + resize (sağ kenar
 * 6px handle). Drag sırasında startTime, resize'da duration güncellenir.
 * Tüm değişiklikler patchTree → audio engine reschedule (clip remove +
 * yeniden schedule sonraki transport.play'de devreye).
 */
/**
 * Clip mediaId → downsample peaks (Float32Array, 200 nokta) cache.
 * Aynı sample birden çok clip'te kullanılırsa tekrar fetch yok.
 */
const CLIP_PEAKS_CACHE = new Map<string, Float32Array>()
const CLIP_PEAKS_PROMISES = new Map<string, Promise<Float32Array>>()

async function getOrFetchClipPeaks(
  mediaId: string,
  url: string
): Promise<Float32Array> {
  const cached = CLIP_PEAKS_CACHE.get(mediaId)
  if (cached) return cached
  const pending = CLIP_PEAKS_PROMISES.get(mediaId)
  if (pending) return pending
  const p = (async () => {
    const res = await fetch(url)
    const ab = await res.arrayBuffer()
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const ctx = new Ctx()
    const buf = await ctx.decodeAudioData(ab.slice(0))
    const channel = buf.getChannelData(0)
    // 600 sample — WaveSurfer parite, daha hassas bar matrix
    const N = 600
    const peaks = new Float32Array(N)
    const blockSize = Math.max(1, Math.floor(channel.length / N))
    for (let i = 0; i < N; i++) {
      let max = 0
      const start = i * blockSize
      const end = Math.min(channel.length, start + blockSize)
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j] ?? 0)
        if (v > max) max = v
      }
      peaks[i] = max
    }
    void ctx.close()
    CLIP_PEAKS_CACHE.set(mediaId, peaks)
    CLIP_PEAKS_PROMISES.delete(mediaId)
    return peaks
  })().catch((err) => {
    CLIP_PEAKS_PROMISES.delete(mediaId)
    throw err
  })
  CLIP_PEAKS_PROMISES.set(mediaId, p)
  return p
}

/**
 * Peak array'i WaveSurfer benzeri dikey bar matrisine çevir. Her bar
 * tepe noktasından eşit-merkez (üst+alt simetrik) çizilir. SVG path:
 * her bar için ayrı rect — JSX'te map'lenir.
 *
 * @param peaks 0..1 absolute amplitude değerleri
 * @param targetBars hedef bar sayısı (clip width'e göre downsample)
 */
function peaksToBars(
  peaks: Float32Array | null,
  targetBars: number
): Float32Array {
  if (!peaks || peaks.length === 0) return new Float32Array(0)
  if (targetBars <= 0) return new Float32Array(0)
  const out = new Float32Array(targetBars)
  const ratio = peaks.length / targetBars
  for (let i = 0; i < targetBars; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio))
    let max = 0
    for (let j = start; j < end; j++) {
      const v = peaks[j] ?? 0
      if (v > max) max = v
    }
    out[i] = max
  }
  return out
}

const ClipBlock = memo(function ClipBlock({
  clip,
  trackId,
  color,
  pxPerSec,
  playheadOver,
  selected,
  automationMode,
  onClipSelect,
  onBulkMoveByDelta,
  onRemoveClip,
  onPatchClip,
  onDuplicateClip,
  onSplitAtPlayhead,
  onTapeStopClip,
  onEnterClipEdit,
  onMoveClipToTrack,
}: {
  clip: MusicianClip
  trackId: string
  color: string
  pxPerSec: number
  /** Playhead şu an clip'in üstünde mi — "Split at playhead" enable'ı. */
  playheadOver: boolean
  selected: boolean
  automationMode: boolean
  onClipSelect(
    trackId: string,
    clipId: string,
    mode: "single" | "toggle" | "add"
  ): void
  onBulkMoveByDelta(
    anchorTrackId: string,
    anchorClipId: string,
    deltaSec: number
  ): boolean
  onRemoveClip(trackId: string, clipId: string): void
  onPatchClip(
    trackId: string,
    clipId: string,
    patch: Partial<MusicianClip>
  ): void
  onDuplicateClip(trackId: string, clipId: string): void
  onSplitAtPlayhead(trackId: string, clipId: string): void
  onTapeStopClip(trackId: string, clipId: string, durationSec: number): void
  onEnterClipEdit(trackId: string, clipId: string): void
  onMoveClipToTrack(
    fromTrackId: string,
    toTrackId: string,
    clipId: string
  ): void
}) {
  const width = Math.max(40, (clip.duration || 10) * pxPerSec)

  // Lokal thin-wrapper'lar — parent callback'leri trackId/clipId ile bağlar.
  // Parent'tan gelenler stable olduğu için bunlar da clip.id değişmedikçe
  // stable kalır (memo bail-out korunur).
  const onPatch = useCallback(
    (patch: Partial<MusicianClip>) => onPatchClip(trackId, clip.id, patch),
    [onPatchClip, trackId, clip.id]
  )
  const onSelect = useCallback(
    (mode: "single" | "toggle" | "add") => onClipSelect(trackId, clip.id, mode),
    [onClipSelect, trackId, clip.id]
  )
  const onBulkMove = useCallback(
    (deltaSec: number) => onBulkMoveByDelta(trackId, clip.id, deltaSec),
    [onBulkMoveByDelta, trackId, clip.id]
  )
  const onRemove = useCallback(
    () => onRemoveClip(trackId, clip.id),
    [onRemoveClip, trackId, clip.id]
  )
  const onEnterEdit = useCallback(
    () => onEnterClipEdit(trackId, clip.id),
    [onEnterClipEdit, trackId, clip.id]
  )
  const onTapeStop = useCallback(
    (durationSec: number) => onTapeStopClip(trackId, clip.id, durationSec),
    [onTapeStopClip, trackId, clip.id]
  )
  const dragRef = useRef<{
    mode: "move" | "resize" | "fadeIn" | "fadeOut"
    startX: number
    startVal: number
  } | null>(null)
  const [peaks, setPeaks] = useState<Float32Array | null>(
    () => CLIP_PEAKS_CACHE.get(clip.mediaId) ?? null
  )

  useEffect(() => {
    if (peaks) return
    let cancelled = false
    const url = mediaUrl(clip.mediaId)
    getOrFetchClipPeaks(clip.mediaId, url)
      .then((p) => {
        if (!cancelled) setPeaks(p)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clip.mediaId, peaks])

  // WaveSurfer benzeri vertical bar matrix — clip genişliğine göre
  // dinamik downsample. 2px bar + 1px gap → ~3px aralık.
  const bars = useMemo(() => {
    const targetBars = Math.max(20, Math.floor(width / 3))
    return peaksToBars(peaks, targetBars)
  }, [peaks, width])

  // Drag ghost — kullanıcı clip'i taşırken ORIGIN pozisyonda yarı saydam
  // hayalet bırakır, "şuradan aldım, buraya gidiyor" feedback'i.
  const [dragOriginStart, setDragOriginStart] = useState<number | null>(null)

  const handleBodyDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Sadece sol click (resize handle ayrı pointer down handler'a sahip)
      if (e.button !== 0) return
      e.stopPropagation()
      // Selection mantığı — Cmd/Ctrl toggle, Shift add, sade single
      if (e.metaKey || e.ctrlKey) {
        onSelect("toggle")
      } else if (e.shiftKey) {
        onSelect("add")
      } else if (!selected) {
        onSelect("single")
      }
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      dragRef.current = {
        mode: "move",
        startX: e.clientX,
        startVal: clip.startTime,
      }
      lastBulkStartRef.current = clip.startTime
      setDragOriginStart(clip.startTime)
    },
    [clip.startTime, selected, onSelect]
  )

  const handleResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      dragRef.current = {
        mode: "resize",
        startX: e.clientX,
        startVal: clip.duration,
      }
    },
    [clip.duration]
  )

  const lastBulkStartRef = useRef<number>(clip.startTime)
  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const deltaSec = (e.clientX - drag.startX) / pxPerSec
      const maxFade = Math.max(0.05, clip.duration * 0.5)
      if (drag.mode === "move") {
        const newStart = Math.max(0, drag.startVal + deltaSec)
        onPatch({ startTime: newStart })
        // Bulk move — anchor clip patchClip ile zaten güncellendi; aynı
        // delta'yı diğer seçili clip'lere uygula (incremental delta:
        // newStart - lastBulkStart, yoksa tek snap'te biriken farklar
        // toplanır ve clip'ler yarış eder)
        const bulkDelta = newStart - lastBulkStartRef.current
        if (bulkDelta !== 0) {
          const applied = onBulkMove(bulkDelta)
          if (applied) lastBulkStartRef.current = newStart
          else lastBulkStartRef.current = newStart
        }
      } else if (drag.mode === "resize") {
        const newDur = Math.max(0.1, drag.startVal + deltaSec)
        onPatch({ duration: newDur })
      } else if (drag.mode === "fadeIn") {
        const newFade = Math.max(0, Math.min(maxFade, drag.startVal + deltaSec))
        onPatch({ fadeIn: newFade })
      } else if (drag.mode === "fadeOut") {
        const newFade = Math.max(0, Math.min(maxFade, drag.startVal - deltaSec))
        onPatch({ fadeOut: newFade })
      }
    },
    [onPatch, clip.duration, pxPerSec, onBulkMove]
  )

  const handleFadeInDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      dragRef.current = {
        mode: "fadeIn",
        startX: e.clientX,
        startVal: clip.fadeIn,
      }
    },
    [clip.fadeIn]
  )

  const handleFadeOutDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
      dragRef.current = {
        mode: "fadeOut",
        startX: e.clientX,
        startVal: clip.fadeOut,
      }
    },
    [clip.fadeOut]
  )

  const handleUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const wasMove = dragRef.current?.mode === "move"
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      dragRef.current = null
      setDragOriginStart(null)
      if (wasMove) {
        // Cross-track drop tespiti — pointer up ekran koordinatlarından
        // hangi lane'e düştüğünü bul (data-track-id taşıyan en yakın ata).
        const el = document.elementFromPoint(
          e.clientX,
          e.clientY
        ) as HTMLElement | null
        const targetLane = el?.closest(
          "[data-track-id]"
        ) as HTMLElement | null
        const targetId = targetLane?.dataset.trackId
        if (targetId && targetId !== trackId) {
          onMoveClipToTrack(trackId, targetId, clip.id)
        }
      }
    },
    [onMoveClipToTrack, trackId, clip.id]
  )

  const showGhost =
    dragOriginStart !== null &&
    Math.abs(dragOriginStart - clip.startTime) > 0.001
  return (
    <>
      {/* Drag origin ghost — clip taşınırken eski yerinde yarı saydam silüet */}
      {showGhost && (
        <div
          className="pointer-events-none absolute top-1 flex h-[calc(100%-8px)] items-center overflow-hidden rounded border border-dashed text-[10px]"
          style={{
            left: dragOriginStart! * pxPerSec,
            width,
            backgroundColor: `${color}1a`,
            borderColor: `${color}66`,
            opacity: 0.5,
          }}
        >
          <span className="px-1.5 text-neutral-500 italic">
            {clip.label ?? "(clip)"}
          </span>
        </div>
      )}
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={cn(
                "group/clip absolute top-1 flex h-[calc(100%-8px)] cursor-grab touch-none items-center overflow-hidden rounded border text-[10px] select-none active:cursor-grabbing",
                selected &&
                  "ring-2 ring-white/80 ring-offset-1 ring-offset-neutral-950"
              )}
              style={{
                left: clip.startTime * pxPerSec,
                width,
                backgroundColor: `${color}40`,
                borderColor: selected ? "white" : `${color}80`,
                // Drag aktifken hafif glow → DAW pro-feel; selected'da kalıcı
                boxShadow: showGhost
                  ? `0 0 0 1px ${color}, 0 4px 16px ${color}66`
                  : selected
                    ? `0 0 12px ${color}66`
                    : undefined,
                zIndex: showGhost ? 5 : selected ? 3 : undefined,
              }}
              title={`${clip.label ?? "clip"} · ${clip.duration.toFixed(1)}s @ ${clip.startTime.toFixed(2)}s — double-click to trim`}
              onPointerDown={handleBodyDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onEnterEdit()
              }}
            />
          }
        >
          {/* WaveSurfer-tarzı bar matrix — absolute background, label üstte */}
          {bars.length > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              viewBox={`0 0 ${bars.length * 3} 100`}
            >
              {Array.from(bars).map((p, i) => {
                const h = Math.max(1.5, p * 90)
                return (
                  <rect
                    key={i}
                    x={i * 3}
                    y={50 - h / 2}
                    width={2}
                    height={h}
                    fill={color}
                    fillOpacity={0.75}
                  />
                )
              })}
            </svg>
          )}
          <span className="relative z-10 flex min-w-0 items-center gap-1 truncate px-1.5 text-neutral-100">
            <span className="truncate">{clip.label ?? "(clip)"}</span>
            {typeof clip.pitchShift === "number" && clip.pitchShift !== 0 && (
              <span
                className="shrink-0 rounded bg-fuchsia-500/30 px-1 font-mono text-[8px] text-fuchsia-200"
                title={`Pitch ${clip.pitchShift > 0 ? "+" : ""}${clip.pitchShift} st`}
              >
                P{clip.pitchShift > 0 ? "+" : ""}
                {clip.pitchShift}
              </span>
            )}
            {typeof clip.playbackRate === "number" &&
              clip.playbackRate !== 1 && (
                <span
                  className="shrink-0 rounded bg-cyan-500/30 px-1 font-mono text-[8px] text-cyan-200"
                  title={`Time stretch ${clip.playbackRate}×`}
                >
                  T{clip.playbackRate.toFixed(2)}×
                </span>
              )}
            {clip.reverseReverb && (
              <span
                className="shrink-0 rounded bg-fuchsia-500/30 px-1 font-mono text-[8px] text-fuchsia-200"
                title={`Reverse reverb · ${clip.reverseReverb.decay.toFixed(1)}s decay · ${Math.round(clip.reverseReverb.mix * 100)}% mix`}
              >
                REV
              </span>
            )}
          </span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="ms-auto me-1 hidden h-4 w-4 items-center justify-center rounded text-white/70 group-hover/clip:flex hover:bg-red-600 hover:text-white"
            title="Remove clip"
          >
            ×
          </button>
          {/* Clip-level volume automation line — sadece automation edit
          mode'da render edilir (kullanıcı header'dan toggle eder); kapalı
          iken clip drag/select pointer event'leri normal akar. */}
          {automationMode && (
            <ClipAutomationOverlay
              clip={clip}
              pxPerSec={pxPerSec}
              width={width}
              accentColor={color}
              onChange={(points) => onPatch({ gainPoints: points })}
            />
          )}
          {/* Right resize handle — sağ kenarda 6px wide grab area */}
          <div
            onPointerDown={handleResizeDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize bg-transparent hover:bg-white/30"
            title="Drag to resize"
          />
          {/* Fade-in/out visual triangles (clip içeride) */}
          {clip.fadeIn > 0 && (
            <svg
              className="pointer-events-none absolute inset-y-0 left-0 z-10 h-full"
              width={Math.min(width, clip.fadeIn * pxPerSec)}
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <polygon points="0,100 100,0 0,0" fill="rgba(0,0,0,0.55)" />
            </svg>
          )}
          {clip.fadeOut > 0 && (
            <svg
              className="pointer-events-none absolute inset-y-0 right-0 z-10 h-full"
              width={Math.min(width, clip.fadeOut * pxPerSec)}
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <polygon points="0,0 100,100 100,0" fill="rgba(0,0,0,0.55)" />
            </svg>
          )}
          {/* Fade-in handle — sol üst köşede küçük drag tutamağı */}
          <div
            onPointerDown={handleFadeInDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className="absolute top-0 left-0 z-20 h-2.5 w-2.5 cursor-ew-resize rounded-br bg-white/30 hover:bg-white/60"
            title={`Fade in: ${clip.fadeIn.toFixed(2)}s`}
          />
          {/* Fade-out handle — sağ üst köşede */}
          <div
            onPointerDown={handleFadeOutDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className="absolute top-0 right-0 z-20 h-2.5 w-2.5 cursor-ew-resize rounded-bl bg-white/30 hover:bg-white/60"
            title={`Fade out: ${clip.fadeOut.toFixed(2)}s`}
          />
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem onClick={onEnterEdit}>
            Edit clip…
            <ContextMenuShortcut>⏎⏎</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onSplitAtPlayhead(trackId, clip.id)}
            disabled={!playheadOver}
          >
            Split at playhead
            <ContextMenuShortcut>S</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onDuplicateClip(trackId, clip.id)}>
            Duplicate clip
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => onPatch({ fadeIn: 0, fadeOut: 0 })}
            disabled={clip.fadeIn === 0 && clip.fadeOut === 0}
          >
            Reset fades
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onPatch({ gain: 1 })}
            disabled={clip.gain === 1}
          >
            Reset gain
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onPatch({ gainPoints: [] })}
            disabled={!clip.gainPoints || clip.gainPoints.length === 0}
          >
            Clear volume automation
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={async () => {
              const cur = clip.pitchShift ?? 0
              const raw = await promptInput({
                title: "Pitch shift",
                label: "Semitones (-24 to +24, 0 = bypass)",
                defaultValue: cur.toString(),
                confirmText: "Apply",
              })
              if (raw === null) return
              const v = Number(raw)
              if (!Number.isFinite(v) || v < -24 || v > 24) {
                toast.error("Invalid pitch (semitones must be -24..+24)")
                return
              }
              onPatch({ pitchShift: v === 0 ? undefined : v })
            }}
          >
            Pitch shift…
            {typeof clip.pitchShift === "number" && clip.pitchShift !== 0 && (
              <ContextMenuShortcut>
                {clip.pitchShift > 0 ? "+" : ""}
                {clip.pitchShift}st
              </ContextMenuShortcut>
            )}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={async () => {
              const cur = clip.playbackRate ?? 1
              const raw = await promptInput({
                title: "Time stretch",
                label: "Playback rate (1 = normal, 0.5 = half speed, 2 = double)",
                defaultValue: cur.toString(),
                confirmText: "Apply",
              })
              if (raw === null) return
              const v = Number(raw)
              if (!Number.isFinite(v) || v <= 0 || v > 4) {
                toast.error("Invalid rate (must be 0 < rate ≤ 4)")
                return
              }
              onPatch({ playbackRate: v === 1 ? undefined : v })
            }}
          >
            Time stretch…
            {typeof clip.playbackRate === "number" &&
              clip.playbackRate !== 1 && (
                <ContextMenuShortcut>
                  {clip.playbackRate.toFixed(2)}×
                </ContextMenuShortcut>
              )}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() =>
              onPatch({ pitchShift: undefined, playbackRate: undefined })
            }
            disabled={
              (clip.pitchShift === undefined || clip.pitchShift === 0) &&
              (clip.playbackRate === undefined || clip.playbackRate === 1)
            }
          >
            Reset pitch + stretch
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* Reverse Reverb — clip-level non-destructive transform.
            Buffer reverse + Freeverb tail offline render; engine cache eder.
            Re-trigger için aynı params'la set → cache hit (anlık). */}
          <ContextMenuItem
            onClick={async () => {
              const cur = clip.reverseReverb
              // İki adımlı giriş — global input dialog promise-tabanlı
              // olduğu için sıralı await ile zincirlenir.
              const decayRaw = await promptInput({
                title: "Reverse reverb",
                label: "Decay (seconds, 0.5 to 10)",
                defaultValue: (cur?.decay ?? 3).toString(),
                confirmText: "Next",
              })
              if (decayRaw === null) return
              const decay = Number(decayRaw)
              if (!Number.isFinite(decay) || decay < 0.5 || decay > 10) {
                toast.error("Invalid decay (0.5..10 seconds)")
                return
              }
              const mixRaw = await promptInput({
                title: "Reverse reverb",
                label: "Mix (0 = no verb, 1 = full wet)",
                defaultValue: (cur?.mix ?? 0.6).toString(),
                confirmText: "Apply",
              })
              if (mixRaw === null) return
              const mix = Number(mixRaw)
              if (!Number.isFinite(mix) || mix < 0 || mix > 1) {
                toast.error("Invalid mix (0..1)")
                return
              }
              onPatch({ reverseReverb: { decay, mix } })
              toast.success(
                `Reverse reverb · ${decay.toFixed(1)}s decay · ${Math.round(mix * 100)}% mix (rendering…)`
              )
            }}
          >
            Reverse reverb…
            {clip.reverseReverb && (
              <ContextMenuShortcut>
                {clip.reverseReverb.decay.toFixed(1)}s
              </ContextMenuShortcut>
            )}
          </ContextMenuItem>
          {clip.reverseReverb && (
            <ContextMenuItem
              onClick={() => onPatch({ reverseReverb: undefined })}
            >
              Clear reverse reverb
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {/* Tape Stop — transient action (engine-side player.playbackRate
            exponential ramp). 3 hızlı preset; "Custom…" prompt için. */}
          <ContextMenuItem onClick={() => onTapeStop(0.5)}>
            Tape stop · short
            <ContextMenuShortcut>0.5s</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onTapeStop(1)}>
            Tape stop · medium
            <ContextMenuShortcut>1s</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onTapeStop(2)}>
            Tape stop · long
            <ContextMenuShortcut>2s</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={async () => {
              const raw = await promptInput({
                title: "Tape stop",
                label: "Duration (seconds, 0.1 to 5)",
                defaultValue: "1.5",
                confirmText: "Apply",
              })
              if (raw === null) return
              const v = Number(raw)
              if (!Number.isFinite(v) || v < 0.1 || v > 5) {
                toast.error("Invalid duration (0.1..5 seconds)")
                return
              }
              onTapeStop(v)
            }}
          >
            Tape stop · custom…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={onRemove}
            className="text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-300"
          >
            Delete clip
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  )
})

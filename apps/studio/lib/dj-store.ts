"use client"

import { create } from "zustand"
import type {
  StudioDjProjectTree,
  DjDeck as DjDeckTree,
  DjMixer,
  DjQueueItem,
  DjHotcue,
  DjLoop,
  DjRecording,
} from "@workspace/db/models/studio-project-data"

// Bu sabit db model'inde tanımlı (`DEFAULT_MIXER_ID`); ama o modülün
// runtime side-effect'i (getDb) client bundle'a sızdırıyor. Yerel
// duplicate — değer her iki yerde sync tutulur.
const DEFAULT_MIXER_ID = "mixer-default"

/**
 * Boş DJ tree factory — duplicate of `emptyDjTree` in
 * `packages/db/src/models/studio-project-data.ts`. Burada inline çünkü
 * o modül `getDb`'yi runtime import ediyor → Next.js client bundle'a
 * mongodb sızdırır. Type-only re-import güvenli ama factory fn için
 * server-only modülü import edemeyiz.
 */
function emptyDjTree(): StudioDjProjectTree {
  const crossfader = {
    position: 0,
    curve: "smooth" as const,
    aDeck: "A",
    bDeck: "B",
    autoMix: {
      enabled: false,
      fadeSeconds: 16,
      beatSync: true,
      tempoMatch: true,
    },
  }
  const master = { gain: 1.0, limiterCeiling: -0.5, effects: [] }
  return {
    mode: "dj",
    version: 1,
    decks: {
      A: emptyDeck(),
      B: emptyDeck(),
      C: emptyDeck(),
      D: emptyDeck(),
    },
    layout: ["A", "B", DEFAULT_MIXER_ID, "C", "D"],
    mixers: [
      {
        id: DEFAULT_MIXER_ID,
        name: "Main",
        type: "club",
        crossfader,
        master,
      },
    ],
    crossfader, // legacy mirror
    master, // legacy mirror
    playlist: [],
    recordings: [],
    quantize: false,
  }
}

function emptyDeck(): DjDeckTree {
  return {
    loadedMediaId: null,
    bpm: null,
    beatgridOffset: 0,
    pitch: 0,
    sync: false,
    eq: { low: 0, mid: 0, high: 0 },
    filter: { cutoff: 0, resonance: 0.5 },
    gain: 0.85,
    pan: 0,
    hotcues: [],
    loops: [],
    queue: [],
    fx: { type: "none", wet: 0.3 },
    assignedMixerId: DEFAULT_MIXER_ID,
  }
}

/**
 * Eski projeleri yeni schema'ya uyarlayan migration helper.
 * Phase 3+ alanları (queue, fx) eski tree'lerde olmayabilir; partial
 * load'da `.length` / `.find` crash etmesin diye normalize ediyoruz.
 */
function normalizeDjTree(tree: StudioDjProjectTree): StudioDjProjectTree {
  const defaultDeck = emptyDeck()
  const normDeck = (d: DjDeckTree | undefined): DjDeckTree => ({
    ...defaultDeck,
    ...d,
    hotcues: d?.hotcues ?? [],
    loops: d?.loops ?? [],
    queue: d?.queue ?? [],
    fx: d?.fx ?? { type: "none", wet: 0.3 },
    eq: d?.eq ?? { low: 0, mid: 0, high: 0 },
    filter: d?.filter ?? { cutoff: 0, resonance: 0.5 },
    pan: d?.pan ?? 0,
  })
  // Dinamik deck migration:
  //   - Eski iki-deck (A,B) → A,B + C,D placeholder
  //   - layout yoksa default A,B,mixer,C,D (mevcut decks listesi + mixer
  //     ortada)
  const rawDecks = tree.decks ?? {}
  const knownIds = new Set<string>(Object.keys(rawDecks))
  for (const required of ["A", "B", "C", "D"]) knownIds.add(required)
  const decks: Record<string, DjDeckTree> = {}
  for (const id of knownIds) {
    decks[id] = normDeck(rawDecks[id])
  }
  const normalizedCrossfader = {
    position: tree.crossfader?.position ?? 0,
    // curve eksikse "smooth" (constant-power) default — sharp center=0 kill
    // davranışı kullanıcıyı şaşırtmasın
    curve: tree.crossfader?.curve ?? "smooth",
    // aDeck/bDeck — legacy crossfader'da yoksa A/B default. Migration
    // güvenliği için decks içinde olduğundan emin ol; aksi halde
    // mevcut decks'in ilk ikisi.
    aDeck: (() => {
      const cand = tree.crossfader?.aDeck
      if (cand && decks[cand]) return cand
      return Object.keys(decks)[0] ?? "A"
    })(),
    bDeck: (() => {
      const cand = tree.crossfader?.bDeck
      if (cand && decks[cand]) return cand
      return Object.keys(decks)[1] ?? "B"
    })(),
    autoMix: {
      enabled: tree.crossfader?.autoMix?.enabled ?? false,
      fadeSeconds: tree.crossfader?.autoMix?.fadeSeconds ?? 16,
      beatSync: tree.crossfader?.autoMix?.beatSync ?? true,
      tempoMatch: tree.crossfader?.autoMix?.tempoMatch ?? true,
    },
  } as const

  const normalizedMaster = {
    gain: tree.master?.gain ?? 1.0,
    limiterCeiling: tree.master?.limiterCeiling ?? -0.5,
    effects: tree.master?.effects ?? [],
  } as const

  // Multi-mixer normalize: legacy tree'lerde mixers[] yoktu. Tek default
  // mixer kur + her deck'i ona ata. Yeni tree'lerde mevcut mixers
  // korunur ama eksik field'lar default'lardan tamamlanır.
  const rawMixers = Array.isArray(tree.mixers) ? tree.mixers : []
  const mixers =
    rawMixers.length > 0
      ? rawMixers.map((m, idx) => ({
          id: m.id ?? (idx === 0 ? DEFAULT_MIXER_ID : `mixer-${idx + 1}`),
          name: m.name ?? (idx === 0 ? "Main" : `Mixer ${idx + 1}`),
          type: m.type ?? "club",
          crossfader: m.crossfader ?? normalizedCrossfader,
          master: m.master ?? normalizedMaster,
        }))
      : [
          {
            id: DEFAULT_MIXER_ID,
            name: "Main",
            type: "club" as const,
            crossfader: normalizedCrossfader,
            master: normalizedMaster,
          },
        ]
  const firstMixer = mixers[0]!
  const validMixerIds = new Set(mixers.map((m) => m.id))

  // Her deck'in assignedMixerId'sini geçerli bir mixer'a bağla — yoksa ilk
  // mixer'a düşürür (silinmiş mixer referansı dangling olamaz).
  for (const id of Object.keys(decks)) {
    const d = decks[id]
    if (!d) continue
    if (!d.assignedMixerId || !validMixerIds.has(d.assignedMixerId)) {
      d.assignedMixerId = firstMixer.id
    }
  }

  const existingLayout = Array.isArray(tree.layout) ? tree.layout : null
  // Layout — geçerli item'lar: deck id'leri + mixer id'leri. Legacy "mixer"
  // sentinel'i ilk mixer'a remap.
  let layout: string[]
  if (existingLayout && existingLayout.length > 0) {
    layout = existingLayout
      .map((item) => (item === "mixer" ? firstMixer.id : item))
      .filter(
        (item) => validMixerIds.has(item) || decks[item] !== undefined,
      )
    // Eksik deck'leri sona ekle
    for (const id of Object.keys(decks)) {
      if (!layout.includes(id)) layout.push(id)
    }
    // En az ilk mixer layout'ta olmalı — yoksa A,B'den sonra yerleştir
    if (!layout.includes(firstMixer.id)) {
      const idx = Math.min(2, layout.length)
      layout.splice(idx, 0, firstMixer.id)
    }
  } else {
    const orderedDecks = Object.keys(decks).sort()
    layout = [...orderedDecks]
    const idx = Math.min(2, layout.length)
    layout.splice(idx, 0, firstMixer.id)
  }

  return {
    ...tree,
    decks,
    layout,
    mixers,
    // Backward-compat aynalar (mevcut store ve UI hâlâ tree.crossfader /
    // tree.master okuyor; ileride deprecate edilecek).
    crossfader: firstMixer.crossfader,
    master: firstMixer.master,
    playlist: tree.playlist ?? [],
    quantize: tree.quantize ?? false,
    recordings: tree.recordings ?? [],
  }
}

/**
 * DJ Editor runtime state (Zustand).
 *
 * Persisted (DB'ye yansır):  `tree` — DjProjectTree (decks, crossfader, master).
 * Volatile (runtime only):    `transport` — her deck'in playhead/isPlaying/duration.
 *
 * Save: tree değişikliklerinde debounced 3sn PUT /tree. Optimistic concurrency
 * `revision` ile — caller son bildiği revision'ı gönderir, conflict'te bir refetch.
 *
 * Audio engine bu store'a bağlanır; UI da bu store'dan okur. Tek truth source.
 */

/** DeckId artık string — dinamik deck setup'ında kullanıcı A,B,C,D + N
 *  ekleyebilir. Sabit union yerine string + runtime validation. */
export type DeckId = string

/** Standart deck etiket'leri — Z'ye kadar 26 deck destekli. */
export const ALL_DECK_LETTERS = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M",
  "N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
] as const

/** Backward-compat — eski DECK_IDS sabit referansı (default A,B,C,D).
 *  Yeni kod yerine `useDjStore((s) => s.tree.layout)` ile dinamik
 *  liste almalı; bu sabit sadece migration sırasında kullanılır. */
export const DECK_IDS: readonly DeckId[] = ["A", "B", "C", "D"]

/** Deck palette — 12 farklı CDJ-3000 LED rengi. Yeni deck eklendiğinde
 *  ALL_DECK_LETTERS index'i % 12 ile bir renk atanır (stable). */
const PALETTE: Array<{
  hex: string
  bg: string
  wave: string
  progress: string
  text: string
}> = [
  { hex: "#ec4899", bg: "bg-pink-500", wave: "#f472b6", progress: "#ec4899", text: "text-pink-500" },     // pink
  { hex: "#06b6d4", bg: "bg-cyan-500", wave: "#22d3ee", progress: "#06b6d4", text: "text-cyan-500" },     // cyan
  { hex: "#eab308", bg: "bg-yellow-500", wave: "#facc15", progress: "#eab308", text: "text-yellow-500" }, // yellow
  { hex: "#22c55e", bg: "bg-green-500", wave: "#4ade80", progress: "#22c55e", text: "text-green-500" },   // green
  { hex: "#f97316", bg: "bg-orange-500", wave: "#fb923c", progress: "#f97316", text: "text-orange-500" },// orange
  { hex: "#a855f7", bg: "bg-purple-500", wave: "#c084fc", progress: "#a855f7", text: "text-purple-500" },// purple
  { hex: "#ef4444", bg: "bg-red-500", wave: "#f87171", progress: "#ef4444", text: "text-red-500" },      // red
  { hex: "#3b82f6", bg: "bg-blue-500", wave: "#60a5fa", progress: "#3b82f6", text: "text-blue-500" },    // blue
  { hex: "#14b8a6", bg: "bg-teal-500", wave: "#2dd4bf", progress: "#14b8a6", text: "text-teal-500" },    // teal
  { hex: "#f43f5e", bg: "bg-rose-500", wave: "#fb7185", progress: "#f43f5e", text: "text-rose-500" },    // rose
  { hex: "#84cc16", bg: "bg-lime-500", wave: "#a3e635", progress: "#84cc16", text: "text-lime-500" },    // lime
  { hex: "#8b5cf6", bg: "bg-violet-500", wave: "#a78bfa", progress: "#8b5cf6", text: "text-violet-500" },// violet
]

/** Per-deck palette — id'nin ALL_DECK_LETTERS index'ine göre stable. */
export function getDeckAccent(deckId: DeckId): (typeof PALETTE)[number] {
  const idx = ALL_DECK_LETTERS.indexOf(
    deckId as (typeof ALL_DECK_LETTERS)[number],
  )
  const safe = idx >= 0 ? idx : 0
  return PALETTE[safe % PALETTE.length]
}

/** Geriye uyumluluk — eski kodda DECK_ACCENTS[deckId] erişimi vardı;
 *  artık Proxy'siz, getDeckAccent dönüşümüyle aynı sonuç. */
export const DECK_ACCENTS = new Proxy({} as Record<DeckId, (typeof PALETTE)[number]>, {
  get(_target, prop: string) {
    return getDeckAccent(prop)
  },
})

/**
 * Sync partner — basit varsayılan: ALL_DECK_LETTERS sırasında bir
 * sonraki deck (Z'den sonra A'ya wrap). Mevcut UI buna fallback
 * olarak ihtiyaç duyuyor; dj-actions.syncDeckAuto zaten BPM'i olan
 * herhangi başka deck'i bulup kullanır.
 */
export function getSyncPartner(deckId: DeckId): DeckId {
  const idx = ALL_DECK_LETTERS.indexOf(
    deckId as (typeof ALL_DECK_LETTERS)[number],
  )
  if (idx < 0) return "A"
  return ALL_DECK_LETTERS[(idx + 1) % ALL_DECK_LETTERS.length]
}

/** Sonraki kullanılmamış deck harfi — addDeck için. Hepsi doluysa null. */
export function nextDeckLetter(usedIds: Iterable<string>): DeckId | null {
  const used = new Set(usedIds)
  for (const letter of ALL_DECK_LETTERS) {
    if (!used.has(letter)) return letter
  }
  return null
}

/** layout'tan deck id'lerini filtrele (tüm mixer id'leri çıkar).
 *  Mixer id'leri "mixer-" prefix'i ile başlar ("mixer-default",
 *  "mixer-2", ...); legacy "mixer" sentinel'i de hâlâ filtrelenir. */
export function getDeckIdsFromLayout(layout: string[]): DeckId[] {
  return layout.filter(
    (item) => item !== "mixer" && !item.startsWith("mixer-"),
  )
}

export interface DeckRuntime {
  /** Çalan medianın yüklü buffer'ı var mı (audio engine ready). */
  loaded: boolean
  /** Saniye cinsinden çalma pozisyonu. UI raf-aligned (rAF) okur. */
  position: number
  /** Toplam süre — saniye. Buffer load'undan sonra dolar. */
  duration: number
  /** Aktif çalıyor mu. */
  isPlaying: boolean
  /** Async load sırasında progress bar göstermek için. */
  loading: boolean
  /** Load fail ise hata mesajı. */
  error: string | null
  /** Downsample edilmiş peak envelope (-1..1, mono, ~512 sample).
   *  Multi-deck overview için WaveSurfer ready'de yazılır. null = yok. */
  peaks: number[] | null
}

const initialDeckRuntime: DeckRuntime = {
  loaded: false,
  position: 0,
  duration: 0,
  isPlaying: false,
  loading: false,
  error: null,
  peaks: null,
}

/** 9 hotcue slot için default renkler (3x3 grid, CDJ tarzı vivid). */
export const HOTCUE_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
] as const

export const HOTCUE_COUNT = HOTCUE_COLORS.length

export interface DjStoreState {
  // ── Project metadata ──────────────────────────────────────────────────
  projectId: string
  companySlug: string
  /** Server tree revision — concurrency için. */
  revision: number

  // ── Persistent tree (saved on changes) ────────────────────────────────
  tree: StudioDjProjectTree

  // ── Volatile runtime ──────────────────────────────────────────────────
  transport: Record<DeckId, DeckRuntime>
  /** En son pointer-down yapılan deck — global keyboard shortcut'larda
   *  "focused deck"i bilmek için (örn. Shift+Space sadece focused'i toggle).
   *  Sayfa yenilenince null. */
  focusedDeck: DeckId | null

  // ── Save state ────────────────────────────────────────────────────────
  saveStatus: "idle" | "dirty" | "saving" | "saved" | "error"
  saveError: string | null

  // ── Mutations ─────────────────────────────────────────────────────────

  /** Initial hydration — server'dan gelen tree + revision'la doldur. */
  init(input: {
    projectId: string
    companySlug: string
    tree: StudioDjProjectTree | null
    revision: number
  }): void

  /** Tree patch. mutator fn(state.tree) içinde mutasyonu yap; immer benzeri
   *  pattern istemediğim için manuel shallow clone yapıyoruz — DJ tree
   *  küçük, tekrar create maliyeti sıfır. */
  patchTree(mutator: (tree: StudioDjProjectTree) => StudioDjProjectTree): void

  /** Deck'e medya yükle — backend cdn URL ile audio engine'ı tetiklemiş olan
   *  caller bu fonksiyonu çağırır. Tree update + transport reset. */
  loadDeck(
    deck: DeckId,
    input: { mediaId: string; label?: string; bpm?: number | null },
  ): void

  /** Deck'i temizle (eject). */
  ejectDeck(deck: DeckId): void

  /** Yeni deck ekle — sonraki kullanılmamış harf alır, layout sonuna eklenir.
   *  Tüm 26 harf doluysa null döner. */
  addDeck(): DeckId | null
  /** Deck'i tamamen kaldır — tree.decks'ten + layout'tan. Audio engine
   *  ayrı `disposeDeck` ile temizlenmeli. Son 2 deck korunur. */
  removeDeck(deck: DeckId): void
  /** Layout sıralamasını set et — DND sortable container'dan gelir. */
  setLayout(layout: string[]): void

  // ── Multi-mixer actions ─────────────────────────────────────────────────
  /** Yeni mixer ekle — sonraki kullanılmamış id (`mixer-N`), default
   *  crossfader + master gain. Layout sonuna yerleştirilir. Yeni mixer id
   *  döner. */
  addMixer(input?: { name?: string; type?: DjMixer["type"] }): string
  /** Mixer'ı kaldır — assigned tüm deck'ler ilk kalan mixer'a re-assign
   *  edilir; layout'tan çıkarılır. Son mixer korunur (no-op). */
  removeMixer(mixerId: string): void
  /** Mixer ismini güncelle. */
  renameMixer(mixerId: string, name: string): void
  /** Deck'i belirtilen mixer'a re-assign et — engine route da güncellenir.
   *  Geçerli mixer id zorunlu; aksi halde no-op. */
  assignDeckToMixer(deckId: DeckId, mixerId: string): void
  /** Tek mixer'ın crossfader patch'i — position/curve/aDeck/bDeck/autoMix. */
  patchMixerCrossfader(
    mixerId: string,
    patch: Partial<StudioDjProjectTree["crossfader"]>,
  ): void
  /** Tek mixer'ın master gain'ini güncelle (linear 0..2). */
  setMixerMasterGain(mixerId: string, gain: number): void

  /** Per-deck queue — drag-drop reorder + add/remove + sonraki çalanı çıkar. */
  enqueueToDeck(deck: DeckId, item: Omit<DjQueueItem, "id">): void
  removeFromQueue(deck: DeckId, queueId: string): void
  reorderQueue(deck: DeckId, fromIdx: number, toIdx: number): void
  /** Auto-next: track end'inde çağırılır — queue'nun ilk item'ını çalan
   *  yapar, queue'dan çıkar. Boşsa hiçbir şey yapmaz, false döner. */
  advanceQueue(deck: DeckId): { mediaId: string; label: string; bpm: number | null } | null

  /** Hotcue: pozisyon set/clear; slot 1..8. position verilmezse current
   *  transport pozisyonu kaydedilir. */
  setHotcue(deck: DeckId, slot: number, opts?: { position?: number; label?: string; color?: string }): void
  clearHotcue(deck: DeckId, slot: number): void

  /** Loop in/out aktivasyon. setLoop({start, end, enabled}) — null clears. */
  setLoop(deck: DeckId, loop: { start: number; end: number; enabled?: boolean } | null): void
  /** Loop aktif mi flag — pozisyon korunur. */
  toggleLoop(deck: DeckId, enabled?: boolean): void

  /** Recordings — append/remove/rename. Append upload sonrası media doc'tan
   *  gelen mediaId ile. */
  appendRecording(rec: Omit<DjRecording, "id">): DjRecording
  removeRecording(id: string): void
  renameRecording(id: string, label: string): void

  /** Runtime patches — audio engine ↔ store senkron. */
  setRuntime(deck: DeckId, patch: Partial<DeckRuntime>): void

  /** Focus track — global keyboard shortcut'larda hangi deck'in
   *  "etkin pencere" olduğunu bilmek için. */
  setFocusedDeck(deck: DeckId | null): void

  // ── Save (debounced + optimistic concurrency) ─────────────────────────
  saveNow(): Promise<void>
  /** Save schedule — sonraki 3sn içinde 1 kez fire. */
  scheduleSave(): void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Tree save'i — 409 (revision conflict) durumunda server'ın bildiği
 * revision'a göre tek seferlik retry yapar. Bizim use case'imiz tek
 * kullanıcı + birden çok background patchTree (örn. BPM analiz
 * tamamlanması) → local revision kaybolur. Conflict'te server'ı
 * "doğru kaynak" kabul edip local revision'ı güncelle + retry.
 *
 * `attempt` 0 = ilk deneme, 1 = retry. Retry de fail ederse error
 * mesajı kullanıcıya gösterilir.
 */
async function saveTreeInternal(attempt: number): Promise<void> {
  const store = useDjStore.getState()
  const { projectId, companySlug, tree, revision, saveStatus } = store
  if (!projectId) return
  if (saveStatus === "saving" && attempt === 0) return
  useDjStore.setState({ saveStatus: "saving", saveError: null })
  try {
    const res = await fetch(
      `/api/companies/${companySlug}/studio/projects/${projectId}/tree`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree, expectedRevision: revision }),
      },
    )
    if (res.status === 409) {
      const err = await res.json().catch(() => null)
      const msg = err?.error ?? ""
      // Sunucu mesajı: "Revision conflict — expected X, server at Y"
      const match = /server at (\d+)/.exec(msg)
      if (match && attempt === 0) {
        const serverRev = parseInt(match[1] ?? "0", 10)
        // Local revision'ı server'a göre güncelle + tek seferlik retry
        useDjStore.setState({ revision: serverRev })
        await saveTreeInternal(1)
        return
      }
      useDjStore.setState({
        saveStatus: "error",
        saveError: msg || "Revision conflict — refresh ya da tekrar dene.",
      })
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(err?.error ?? `HTTP ${res.status}`)
    }
    const json = await res.json()
    useDjStore.setState({
      revision: json.data?.revision ?? revision + 1,
      saveStatus: "saved",
      saveError: null,
    })
  } catch (e) {
    useDjStore.setState({
      saveStatus: "error",
      saveError: e instanceof Error ? e.message : "Save failed",
    })
  }
}

export const useDjStore = create<DjStoreState>((set, get) => ({
  projectId: "",
  companySlug: "",
  revision: 0,
  tree: emptyDjTree(),
  transport: {
    A: { ...initialDeckRuntime },
    B: { ...initialDeckRuntime },
    C: { ...initialDeckRuntime },
    D: { ...initialDeckRuntime },
  },
  focusedDeck: null,
  saveStatus: "idle",
  saveError: null,

  init({ projectId, companySlug, tree, revision }) {
    // Eski projelerde queue/fx vs. yok — load anında normalize ediyoruz.
    const normalized = tree ? normalizeDjTree(tree) : emptyDjTree()
    // Transport state'i tüm decks key'leri için fresh oluştur (legacy A,B
    // veya dinamik N).
    const transport: Record<DeckId, DeckRuntime> = {}
    for (const id of Object.keys(normalized.decks)) {
      transport[id] = { ...initialDeckRuntime }
    }
    set({
      projectId,
      companySlug,
      tree: normalized,
      revision,
      transport,
      saveStatus: "idle",
      saveError: null,
    })
  },

  patchTree(mutator) {
    const current = get().tree
    const next = mutator(current)
    set({ tree: next, saveStatus: "dirty" })
    get().scheduleSave()
  },

  loadDeck(deckId, input) {
    get().patchTree((tree) => {
      const deck = tree.decks[deckId]
      const updatedDeck: DjDeckTree = {
        ...deck,
        loadedMediaId: input.mediaId,
        loadedLabel: input.label,
        bpm: input.bpm ?? null,
        beatgridOffset: 0,
        hotcues: [],
        loops: [],
      }
      return { ...tree, decks: { ...tree.decks, [deckId]: updatedDeck } }
    })
    // Reset runtime; engine load tamamlanınca setRuntime ile dolduracak
    set((s) => ({
      transport: {
        ...s.transport,
        [deckId]: { ...initialDeckRuntime, loading: true },
      },
    }))
  },

  ejectDeck(deckId) {
    get().patchTree((tree) => {
      const updatedDeck: DjDeckTree = {
        ...tree.decks[deckId],
        loadedMediaId: null,
        loadedLabel: undefined,
        bpm: null,
        beatgridOffset: 0,
        hotcues: [],
        loops: [],
        // queue eject sırasında korunur — kullanıcı sıraya atmıştı.
      }
      return { ...tree, decks: { ...tree.decks, [deckId]: updatedDeck } }
    })
    set((s) => ({
      transport: {
        ...s.transport,
        [deckId]: { ...initialDeckRuntime },
      },
    }))
  },

  enqueueToDeck(deckId, item) {
    get().patchTree((tree) => {
      const deck = tree.decks[deckId]
      const queueItem: DjQueueItem = {
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...item,
      }
      return {
        ...tree,
        decks: {
          ...tree.decks,
          [deckId]: { ...deck, queue: [...deck.queue, queueItem] },
        },
      }
    })
  },

  removeFromQueue(deckId, queueId) {
    get().patchTree((tree) => ({
      ...tree,
      decks: {
        ...tree.decks,
        [deckId]: {
          ...tree.decks[deckId],
          queue: tree.decks[deckId].queue.filter((q) => q.id !== queueId),
        },
      },
    }))
  },

  reorderQueue(deckId, fromIdx, toIdx) {
    get().patchTree((tree) => {
      const deck = tree.decks[deckId]
      const next = [...deck.queue]
      const [moved] = next.splice(fromIdx, 1)
      if (moved) next.splice(toIdx, 0, moved)
      return {
        ...tree,
        decks: { ...tree.decks, [deckId]: { ...deck, queue: next } },
      }
    })
  },

  advanceQueue(deckId) {
    const deck = get().tree.decks[deckId]
    const next = deck.queue[0]
    if (!next) return null
    // Tree update: queue'dan çıkar + loadedMediaId set
    get().patchTree((tree) => ({
      ...tree,
      decks: {
        ...tree.decks,
        [deckId]: {
          ...tree.decks[deckId],
          loadedMediaId: next.mediaId,
          loadedLabel: next.label,
          bpm: next.bpm,
          beatgridOffset: 0,
          hotcues: [],
          loops: [],
          queue: tree.decks[deckId].queue.slice(1),
        },
      },
    }))
    set((s) => ({
      transport: {
        ...s.transport,
        [deckId]: { ...initialDeckRuntime, loading: true },
      },
    }))
    return { mediaId: next.mediaId, label: next.label, bpm: next.bpm }
  },

  setHotcue(deckId, slot, opts = {}) {
    const state = get()
    const position = opts.position ?? state.transport[deckId].position
    state.patchTree((tree) => {
      const deck = tree.decks[deckId]
      // Aynı slot varsa replace, yoksa ekle
      const filtered = deck.hotcues.filter((h) => h.slot !== slot)
      const existing = deck.hotcues.find((h) => h.slot === slot)
      const next: DjHotcue = {
        slot,
        position,
        label: opts.label ?? existing?.label,
        color: opts.color ?? existing?.color ?? HOTCUE_COLORS[(slot - 1) % HOTCUE_COLORS.length],
      }
      return {
        ...tree,
        decks: {
          ...tree.decks,
          [deckId]: {
            ...deck,
            hotcues: [...filtered, next].sort((a, b) => a.slot - b.slot),
          },
        },
      }
    })
  },

  clearHotcue(deckId, slot) {
    get().patchTree((tree) => ({
      ...tree,
      decks: {
        ...tree.decks,
        [deckId]: {
          ...tree.decks[deckId],
          hotcues: tree.decks[deckId].hotcues.filter((h) => h.slot !== slot),
        },
      },
    }))
  },

  setLoop(deckId, loop) {
    get().patchTree((tree) => {
      const deck = tree.decks[deckId]
      if (loop === null) {
        // Clear → tüm aktif loop'ları kapat
        return {
          ...tree,
          decks: {
            ...tree.decks,
            [deckId]: {
              ...deck,
              loops: deck.loops.map((l) => ({ ...l, enabled: false })),
            },
          },
        }
      }
      // Tek aktif loop policy — yeni set'lenen aktif olur, diğerleri off
      const newLoop: DjLoop = {
        id: `loop_${Date.now()}`,
        start: loop.start,
        end: loop.end,
        enabled: loop.enabled ?? true,
      }
      return {
        ...tree,
        decks: {
          ...tree.decks,
          [deckId]: {
            ...deck,
            loops: [newLoop, ...deck.loops.slice(0, 4).map((l) => ({ ...l, enabled: false }))],
          },
        },
      }
    })
  },

  toggleLoop(deckId, enabled) {
    get().patchTree((tree) => {
      const deck = tree.decks[deckId]
      const first = deck.loops[0]
      if (!first) return tree
      const next = enabled ?? !first.enabled
      return {
        ...tree,
        decks: {
          ...tree.decks,
          [deckId]: {
            ...deck,
            loops: [{ ...first, enabled: next }, ...deck.loops.slice(1)],
          },
        },
      }
    })
  },

  appendRecording(rec) {
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const full: DjRecording = { id, ...rec }
    get().patchTree((tree) => ({
      ...tree,
      recordings: [full, ...tree.recordings],
    }))
    return full
  },

  removeRecording(id) {
    get().patchTree((tree) => ({
      ...tree,
      recordings: tree.recordings.filter((r) => r.id !== id),
    }))
  },

  renameRecording(id, label) {
    get().patchTree((tree) => ({
      ...tree,
      recordings: tree.recordings.map((r) =>
        r.id === id ? { ...r, label } : r,
      ),
    }))
  },

  setRuntime(deckId, patch) {
    set((s) => ({
      transport: {
        ...s.transport,
        [deckId]: { ...s.transport[deckId], ...patch },
      },
    }))
  },

  setFocusedDeck(deck) {
    set({ focusedDeck: deck })
  },

  addDeck() {
    const state = get()
    const id = nextDeckLetter(Object.keys(state.tree.decks))
    if (!id) return null
    // Tree + transport her ikisine de yeni deck'i ekle.
    state.patchTree((tree) => ({
      ...tree,
      decks: { ...tree.decks, [id]: emptyDeck() },
      layout: [...tree.layout, id],
    }))
    set((s) => ({
      transport: {
        ...s.transport,
        [id]: { ...initialDeckRuntime },
      },
    }))
    return id
  },

  removeDeck(deckId) {
    const state = get()
    const remainingDeckCount = Object.keys(state.tree.decks).filter(
      (k) => k !== deckId,
    ).length
    if (remainingDeckCount < 2) {
      // Minimum 2 deck zorunlu — crossfader semantik bir partner
      return
    }
    state.patchTree((tree) => {
      const { [deckId]: _removed, ...restDecks } = tree.decks
      void _removed
      return {
        ...tree,
        decks: restDecks,
        layout: tree.layout.filter((item) => item !== deckId),
      }
    })
    set((s) => {
      const { [deckId]: _t, ...restTransport } = s.transport
      void _t
      return {
        transport: restTransport,
        focusedDeck: s.focusedDeck === deckId ? null : s.focusedDeck,
      }
    })
  },

  setLayout(layout) {
    get().patchTree((tree) => ({ ...tree, layout }))
  },

  // ── Multi-mixer implementations ─────────────────────────────────────────

  addMixer(input) {
    const tree = get().tree
    // En küçük kullanılmamış index'i bul. "mixer-default" zaten varsa
    // mixer-2'den başla; aksi halde mixer-2 (1 hep "default").
    const usedIds = new Set(tree.mixers.map((m) => m.id))
    let idx = 2
    let nextId = `mixer-${idx}`
    while (usedIds.has(nextId)) {
      idx++
      nextId = `mixer-${idx}`
    }
    const newMixer: DjMixer = {
      id: nextId,
      name: input?.name ?? `Mixer ${idx}`,
      type: input?.type ?? "club",
      crossfader: {
        position: 0,
        curve: "smooth",
        // Yeni mixer crossfader'ı varsayılan ilk-iki deck'le başlasın;
        // kullanıcı sonra istediğine assign edebilir.
        aDeck: Object.keys(tree.decks)[0] ?? "A",
        bDeck: Object.keys(tree.decks)[1] ?? "B",
        autoMix: {
          enabled: false,
          fadeSeconds: 16,
          beatSync: true,
          tempoMatch: true,
        },
      },
      master: { gain: 1.0, limiterCeiling: -0.5, effects: [] },
    }
    get().patchTree((t) => ({
      ...t,
      mixers: [...t.mixers, newMixer],
      // Layout sonuna ekle — kullanıcı DND ile yer değiştirebilir.
      layout: [...t.layout, newMixer.id],
    }))
    return nextId
  },

  removeMixer(mixerId) {
    const tree = get().tree
    if (tree.mixers.length <= 1) return // son mixer korunur
    const remaining = tree.mixers.filter((m) => m.id !== mixerId)
    const fallbackId = remaining[0]!.id
    get().patchTree((t) => {
      // Bu mixer'a assigned tüm deck'leri ilk kalan mixer'a kaydır.
      const decks: typeof t.decks = {}
      for (const id of Object.keys(t.decks)) {
        const d = t.decks[id]
        if (!d) continue
        decks[id] = {
          ...d,
          assignedMixerId:
            d.assignedMixerId === mixerId ? fallbackId : d.assignedMixerId,
        }
      }
      const firstMixer = remaining[0]!
      return {
        ...t,
        decks,
        mixers: remaining,
        layout: t.layout.filter((entry) => entry !== mixerId),
        // Legacy mirrors update — ilk kalan mixer'a göre.
        crossfader: firstMixer.crossfader,
        master: firstMixer.master,
      }
    })
  },

  renameMixer(mixerId, name) {
    const next = name.trim()
    if (!next || next.length > 60) return
    get().patchTree((t) => ({
      ...t,
      mixers: t.mixers.map((m) =>
        m.id === mixerId ? { ...m, name: next } : m,
      ),
    }))
  },

  assignDeckToMixer(deckId, mixerId) {
    const tree = get().tree
    if (!tree.mixers.some((m) => m.id === mixerId)) return
    if (!tree.decks[deckId]) return
    get().patchTree((t) => ({
      ...t,
      decks: {
        ...t.decks,
        [deckId]: { ...t.decks[deckId]!, assignedMixerId: mixerId },
      },
    }))
  },

  patchMixerCrossfader(mixerId, patch) {
    get().patchTree((t) => {
      const mixers = t.mixers.map((m) =>
        m.id === mixerId
          ? { ...m, crossfader: { ...m.crossfader, ...patch } }
          : m,
      )
      const first = mixers[0]!
      return {
        ...t,
        mixers,
        // Legacy mirror sync — ilk mixer'ın crossfader'ı tree.crossfader.
        crossfader: first.crossfader,
      }
    })
  },

  setMixerMasterGain(mixerId, gain) {
    const clamped = Math.max(0, Math.min(2, gain))
    get().patchTree((t) => {
      const mixers = t.mixers.map((m) =>
        m.id === mixerId
          ? { ...m, master: { ...m.master, gain: clamped } }
          : m,
      )
      const first = mixers[0]!
      return { ...t, mixers, master: first.master }
    })
  },

  scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void get().saveNow()
    }, 3000)
  },

  async saveNow() {
    await saveTreeInternal(0)
  },
}))

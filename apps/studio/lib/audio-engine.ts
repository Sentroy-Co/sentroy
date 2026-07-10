"use client"

import * as Tone from "tone"
import type { DeckId } from "./dj-store"

/**
 * Sentroy Studio audio engine — Phase 2: full DJ signal chain.
 *
 *   Player A  →  deckGain A  →  crossfaderGain A  ┐
 *                                                  ├→  masterGain → Limiter → Destination
 *   Player B  →  deckGain B  →  crossfaderGain B  ┘
 *
 * **Browser-only** — lazy-init pattern; SSR import güvenli.
 *
 * Crossfader matematiği:
 *   - linear: A=1-t, B=t (klasik, ortada toplam=1)
 *   - smooth (constant-power): A=cos(tπ/2), B=sin(tπ/2)
 *     (ortada her ikisi ~0.707 → algılanan ses gücü sabit)
 *   - sharp (club kill): t<0.5 sadece A azalır, t>0.5 sadece B yükselir;
 *     ortada her ikisi 0 (kill the middle)
 *
 * AudioContext başlatma: `ensureAudioContextStarted()` user gesture
 * içinden çağrılmalı (Tone.start()).
 */

export type CrossfaderCurve = "linear" | "smooth" | "sharp"

interface DeckHandle {
  /** Tone.GrainPlayer — Player'ın aksine playbackRate'i pitch'ten bağımsız
   *  değiştirebilir (granular synthesis). Pitch fader ±16% tempo değişimi
   *  için kullanılır — DJ standard "varispeed without pitch change". */
  player: Tone.GrainPlayer | null
  /** Player çıkışını gate'ler — scratch active iken ramp 0, normal iken 1.
   *  Player → grainGate → deckGain. */
  grainGate: Tone.Gain
  /** ScratchNode çıkışını gate'ler — paralel branch (ScratchNode →
   *  scratchGate → deckGain). Scratch aktifken ramp 1, kapalıyken 0. */
  scratchGate: Tone.Gain
  /** AudioWorkletNode — sample-level buffer reader; pozitif/negatif rate
   *  destekler (true reverse scratch). Lazy oluşur (ilk setScratchActive). */
  scratchNode: AudioWorkletNode | null
  /** Worklet'e gönderilen buffer kopyaları (per-channel Float32). */
  bufferChannels: Float32Array[] | null
  /** Buffer'ın orijinal sample rate'i (output AudioContext SR'den farklı
   *  olabilir; worklet'te buffer-to-output oran hesabında kullanılır). */
  bufferSampleRate: number
  /** Scratch mode aktif mi? endScratch ile false. */
  scratchActive: boolean
  /** Main-thread simulasyonu: lastScratchUpdate'tan beri kat edilen mesafe
   *  scratchHeadSec'e eklenir; worklet'ten asenkron read beklemek yerine. */
  scratchHeadSec: number
  scratchRate: number
  lastScratchUpdateMs: number | null
  /** Deck volume (kullanıcı slider). */
  deckGain: Tone.Gain
  /** Stereo pan — -1 (sol) ... +1 (sağ). Default 0 (center). */
  panner: Tone.Panner
  /** Per-deck VU meter — channel strip görseli için. Deck gain çıkışından
   *  fanlanır (post-gain ölçüm, kullanıcının duyduğu seviye). */
  meter: Tone.Meter
  /** 3-band EQ — kullanıcı slider'ları -1..+1 (-1=kill, 0=neutral, +1=+6dB). */
  eq: Tone.EQ3
  /** CDJ-style combined filter — cutoff -1..+1; sign type'ı belirler. */
  filter: Tone.Filter
  /** Dinamik FX slot — type değişince swap'lanır. null = bypass (filter →
   *  crossfaderGain doğrudan bağlı). */
  fxNode: Tone.ToneAudioNode | null
  /** Current FX type — render karşılaştırması için. */
  fxType: string
  /** Crossfader'ın hesapladığı gain. setCrossfader pos değişince güncellenir. */
  crossfaderGain: Tone.Gain
  loadedMediaId: string | null
  playStartContextTime: number | null
  playStartOffset: number
  /** Pitch fader değeri — playbackRate set'lenir, position hesabı için saklanır. */
  pitch: number
  /** Aktif loop bilgisi — getDeckPosition'da head'i loop aralığına modulo
   *  almak için. Tone.GrainPlayer loop'u sample-accurate yapar; UI'nin
   *  position göstergesi engine'in `loopStart..loopEnd` arasında dönen
   *  pos'unu görmesi için burada da tutuyoruz. null = loop bypass. */
  loop: { start: number; end: number } | null
}

interface EngineGraph {
  /** Dinamik deck Map'i — addDeck/removeDeck ile değişir. UI tarafı
   *  store.tree.layout listesindeki id'leri ensureDeck ile lazy create
   *  eder; removeDeck audio kaynaklarını dispose eder. */
  decks: Record<string, DeckHandle>
  /**
   * Multi-mixer collection — her mixer kendi master + limiter + crossfader
   * state'ine sahip. Default mixer ("mixer-default") init sırasında kurulur;
   * UI'dan addMixer ile yeni mixer ID'leri eklenir. Deck'ler
   * `DjDeck.assignedMixerId` ile hangi mixer'a route olduğunu söyler;
   * engine `assignDeckToMixer` ile crossfaderGain'i hedef mixer.master'a
   * yeniden bağlar.
   *
   * Backward-compat: `masterGain` / `limiter` / `crossfader` (root-level
   * field'lar) default mixer'ın handle alias'ları — eski API'ler hâlâ
   * çalışır.
   */
  mixers: Map<string, MixerHandle>
  // ── Legacy default-mixer aliases (mixers.get("mixer-default") shortcuts) ──
  masterGain: Tone.Gain
  /** Master FX slot — masterGain → masterFxNode? → limiter. Type "none"
   *  bypass: masterGain doğrudan limiter'a. Pioneer DJM-900 master FX. */
  masterFxNode: Tone.ToneAudioNode | null
  masterFxType: string
  limiter: Tone.Limiter
  /** Master out VU meter — limiter sonrası (clipping görmek için ideal nokta). */
  masterMeter: Tone.Meter
  /** Current crossfader state — re-applied when curve/position changes.
   *  aDeck/bDeck Pioneer DJM "assign" switch'ine eşdeğer — kullanıcı
   *  hangi deck'in A tarafında, hangisinin B tarafında olduğunu seçer.
   *  Default "A"/"B", auto-mix sırasında from/to ile override edilir. */
  crossfader: {
    position: number
    curve: CrossfaderCurve
    aDeck: string
    bDeck: string
  }
}

/**
 * Tek mixer'ın audio handle'ı. Tone.Gain master + Tone.Limiter + Tone.Meter
 * + opsiyonel master FX node. Chain: masterGain → (fxNode?) → limiter →
 * toDestination + masterMeter (passive tap).
 */
interface MixerHandle {
  id: string
  masterGain: Tone.Gain
  masterFxNode: Tone.ToneAudioNode | null
  masterFxType: string
  limiter: Tone.Limiter
  masterMeter: Tone.Meter
  crossfader: {
    position: number
    curve: CrossfaderCurve
    aDeck: string
    bDeck: string
  }
}

const DEFAULT_MIXER_ID = "mixer-default"

let graph: EngineGraph | null = null

function getGraph(): EngineGraph {
  if (typeof window === "undefined") {
    throw new Error("audio-engine: browser-only (SSR import detected)")
  }
  if (!graph) {
    // Build chain bottom-up: master → limiter → destination
    const limiter = new Tone.Limiter(-0.5).toDestination()
    // Master VU meter — limiter sonrası dinler. Hem ses destination'a
    // gider hem meter analiz; meter sadece passive (output yok).
    const masterMeter = new Tone.Meter({ smoothing: 0.85 })
    limiter.connect(masterMeter)
    const masterGain = new Tone.Gain(1.0).connect(limiter)

    const makeDeck = (): DeckHandle => {
      // Chain bottom-up: crossfader → master, sonra deck → eq → filter →
      // (fxNode? →) crossfader. fxNode bypass'ta direkt filter →
      // crossfader; setDeckFx ile dinamik insert/dispose.
      const crossfaderGain = new Tone.Gain(0.707).connect(masterGain)
      // Filter default: lowpass 22kHz = essentially bypass
      const filter = new Tone.Filter({
        type: "lowpass",
        frequency: 22000,
        Q: 1,
      }).connect(crossfaderGain)
      const eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 }).connect(filter)
      // Stereo panner — deckGain ile eq arasında. Sağ/sol balance.
      const panner = new Tone.Panner(0).connect(eq)
      const deckGain = new Tone.Gain(0.85).connect(panner)
      // VU meter — deckGain'i fan-out (panner'a gider + meter'a paralel).
      // Tone.Meter sadece dinler, çıkış vermez (passive analyzer).
      const meter = new Tone.Meter({ smoothing: 0.85 })
      deckGain.connect(meter)
      // Parallel sources into deckGain: GrainPlayer (normal) + ScratchNode
      // (live scrub). Gate'ler swap olur.
      const grainGate = new Tone.Gain(1).connect(deckGain)
      const scratchGate = new Tone.Gain(0).connect(deckGain)
      return {
        player: null,
        grainGate,
        scratchGate,
        scratchNode: null,
        bufferChannels: null,
        bufferSampleRate: 44100,
        scratchActive: false,
        scratchHeadSec: 0,
        scratchRate: 0,
        lastScratchUpdateMs: null,
        deckGain,
        panner,
        meter,
        eq,
        filter,
        fxNode: null,
        fxType: "none",
        crossfaderGain,
        loadedMediaId: null,
        playStartContextTime: null,
        playStartOffset: 0,
        pitch: 0,
        loop: null,
      }
    }

    // Default mixer handle — root-level masterGain/limiter/crossfader
    // alias'ları bu handle'a işaret eder (backward compat).
    const defaultMixerCrossfader = {
      position: 0,
      curve: "smooth" as CrossfaderCurve,
      aDeck: "A",
      bDeck: "B",
    }
    const defaultMixerHandle: MixerHandle = {
      id: DEFAULT_MIXER_ID,
      masterGain,
      masterFxNode: null,
      masterFxType: "none",
      limiter,
      masterMeter,
      crossfader: defaultMixerCrossfader,
    }
    const mixers = new Map<string, MixerHandle>()
    mixers.set(DEFAULT_MIXER_ID, defaultMixerHandle)

    graph = {
      // Dinamik deck graph — default 4 (A,B,C,D); ensureDeck ile lazy
      // create. "A" ve "B" crossfader-controlled, diğerleri sabit 0.707
      // ("Thru"). v2'de per-channel assign.
      decks: {
        A: makeDeck(),
        B: makeDeck(),
        C: makeDeck(),
        D: makeDeck(),
      },
      mixers,
      // Legacy aliases — defaultMixerHandle'ın aynı nesne referansları.
      // Eski API'ler (setMasterVolume, setCrossfader vb.) bu field'ları
      // okur; mixer-aware yeni API mixers.get(id) ile erişir.
      masterGain,
      masterFxNode: null,
      masterFxType: "none",
      limiter,
      masterMeter,
      crossfader: defaultMixerCrossfader,
    }
  }
  return graph
}

/**
 * Mixer handle'ını garanti eder. Yoksa yeni Tone.Gain master + Tone.Limiter
 * + Tone.Meter zinciri yaratır → toDestination'a paralel route eder. Web
 * Audio destination zaten implicit fan-in mixer — birden çok node'un
 * toDestination()'i Web Audio'da otomatik karışır.
 *
 * UI'dan store.addMixer çağrıldığında, ilk deck assignment veya crossfader
 * mutation engine'i tetiklediğinde lazy create olur.
 */
function ensureMixerHandle(mixerId: string): MixerHandle {
  const g = getGraph()
  const existing = g.mixers.get(mixerId)
  if (existing) return existing
  // Yeni mixer chain: masterGain → limiter → toDestination()
  // + masterMeter passive tap.
  const limiter = new Tone.Limiter(-0.5).toDestination()
  const masterMeter = new Tone.Meter({ smoothing: 0.85 })
  limiter.connect(masterMeter)
  const masterGain = new Tone.Gain(1.0).connect(limiter)
  const handle: MixerHandle = {
    id: mixerId,
    masterGain,
    masterFxNode: null,
    masterFxType: "none",
    limiter,
    masterMeter,
    crossfader: {
      position: 0,
      curve: "smooth",
      aDeck: "A",
      bDeck: "B",
    },
  }
  g.mixers.set(mixerId, handle)
  return handle
}

/**
 * Deck'in crossfader gain çıkışını hedef mixer'ın masterGain'ine taşı.
 * Önce mevcut tüm bağlantılarını disconnect, sonra hedef master'a
 * connect. UI store.assignDeckToMixer'dan sonra engine sync'i.
 *
 * No-op: deck yoksa veya hedef mixer henüz ensure edilmemişse silent return.
 */
export function assignDeckToMixerEngine(
  deckId: DeckId,
  mixerId: string,
): void {
  if (typeof window === "undefined") return
  const g = getGraph()
  const deck = g.decks[deckId]
  if (!deck) return
  const mixer = ensureMixerHandle(mixerId)
  try {
    deck.crossfaderGain.disconnect()
  } catch {}
  try {
    deck.crossfaderGain.connect(mixer.masterGain)
  } catch (err) {
    console.warn("[audio-engine] assignDeckToMixerEngine failed", err)
  }
}

/**
 * Mixer kaldırma — Tone node'larını dispose. Caller önce assigned tüm
 * deck'leri başka mixer'a re-route etmiş olmalı (store.removeMixer bu
 * sırayı korur).
 */
export function disposeMixer(mixerId: string): void {
  if (typeof window === "undefined") return
  if (mixerId === DEFAULT_MIXER_ID) return // default mixer korunur
  const g = getGraph()
  const mixer = g.mixers.get(mixerId)
  if (!mixer) return
  try {
    mixer.masterMeter.disconnect()
    mixer.masterMeter.dispose()
  } catch {}
  if (mixer.masterFxNode) {
    try {
      mixer.masterFxNode.disconnect()
      mixer.masterFxNode.dispose()
    } catch {}
  }
  try {
    mixer.limiter.disconnect()
    mixer.limiter.dispose()
  } catch {}
  try {
    mixer.masterGain.disconnect()
    mixer.masterGain.dispose()
  } catch {}
  g.mixers.delete(mixerId)
}

/**
 * Mixer crossfader pozisyonu / curve / aDeck / bDeck patch — store
 * mutation engine'i tetikler. Mevcut `setCrossfader` (legacy, default
 * mixer'a delegate) bunu sarar.
 */
export function setMixerCrossfader(
  mixerId: string,
  input: {
    position?: number
    curve?: CrossfaderCurve
    aDeck?: string
    bDeck?: string
  },
): void {
  if (typeof window === "undefined") return
  const mixer = ensureMixerHandle(mixerId)
  if (typeof input.position === "number") {
    mixer.crossfader.position = Math.max(-1, Math.min(1, input.position))
  }
  if (input.curve) mixer.crossfader.curve = input.curve
  if (input.aDeck) mixer.crossfader.aDeck = input.aDeck
  if (input.bDeck) mixer.crossfader.bDeck = input.bDeck
  // Default mixer ise root crossfader alias'ını da güncelle (legacy
  // setCrossfader hâlâ root'tan okur).
  if (mixerId === DEFAULT_MIXER_ID) {
    const g = getGraph()
    g.crossfader = mixer.crossfader
  }
  applyMixerCrossfader(mixer)
}

/** Mixer'ın master gain'ini ramp et (linear 0..2). */
export function setMixerMasterGain(mixerId: string, linear: number): void {
  if (typeof window === "undefined") return
  const mixer = ensureMixerHandle(mixerId)
  const clamped = Math.max(0, Math.min(2, linear))
  mixer.masterGain.gain.rampTo(clamped, 0.05)
}

/**
 * Belirtilen mixer'a assigned tüm deck'lerin crossfaderGain'ini
 * mixer.crossfader.aDeck/bDeck/position/curve'a göre yeniden hesap.
 * Diğer mixer'lara assigned deck'ler etkilenmez.
 */
function applyMixerCrossfader(mixer: MixerHandle): void {
  const g = getGraph()
  for (const [deckId, deck] of Object.entries(g.decks)) {
    // Sadece bu mixer'a assigned deck'leri hesapla — basit approximation
    // için: connection target'ı kontrol etmek zor; biz dj-store deck
    // mutation'ları sırasında zaten assignDeckToMixerEngine'i çağırdık.
    // Burada her deck için bu mixer'ın crossfader pozisyonuna göre gain
    // hesapla, ama uygulamayı yalnızca o mixer'a route edilmiş deck'lere
    // yapacağız. assignedMixerId kontrolü engine state'inde yok; bu
    // yüzden bu helper sadece DEFAULT mixer için tam çalışır (legacy).
    // Multi-mixer için store action engine helper'ı per-deck çağırır.
    const gainValue = computeCrossfaderGain(
      deckId,
      mixer.crossfader.position,
      mixer.crossfader.curve,
      mixer.crossfader.aDeck,
      mixer.crossfader.bDeck,
    )
    deck.crossfaderGain.gain.rampTo(gainValue, 0.02)
  }
}

/** Mevcut crossfader gain compute — A/B/Thru ekonomisi. */
function computeCrossfaderGain(
  deckId: string,
  position: number,
  curve: CrossfaderCurve,
  aDeck: string,
  bDeck: string,
): number {
  if (deckId !== aDeck && deckId !== bDeck) return 0.707 // Thru
  // Eğri compute (mevcut setCrossfader logic'iyle aynı)
  const isA = deckId === aDeck
  // position -1 (full A) .. 0 (center) .. +1 (full B)
  const p = position
  switch (curve) {
    case "linear": {
      const aGain = isA ? 1 - Math.max(0, (p + 1) / 2) : 0
      const bGain = isA ? 0 : Math.max(0, (p + 1) / 2)
      return isA ? aGain : bGain
    }
    case "sharp": {
      // Center kill — A kill at +0.1, B kill at -0.1
      if (isA) return p >= 0.1 ? 0 : p < -0.9 ? 1 : (0.1 - p) / 1.0
      return p <= -0.1 ? 0 : p > 0.9 ? 1 : (p + 0.1) / 1.0
    }
    case "smooth":
    default: {
      // Constant-power: cos/sin ile
      const t = (p + 1) / 2 // 0..1
      return isA ? Math.cos((t * Math.PI) / 2) : Math.sin((t * Math.PI) / 2)
    }
  }
}

/**
 * Belirtilen deck id için handle'ın varlığını garanti eder; yoksa
 * lazy create eder. UI tarafı her zaman bu fonksiyonu çağırmak zorunda
 * değil — store mutations önce çalışır, ama loadDeck/playDeck gibi
 * helper'lar deck handle'a dokunmadan önce buradan geçer.
 */
function ensureDeckHandle(deckId: DeckId): DeckHandle {
  const g = getGraph()
  if (!g.decks[deckId]) {
    g.decks[deckId] = makeDeckLazy()
  }
  return g.decks[deckId]
}

/** makeDeck() kapsayıcı içindeki fabrikayı dışarıya açan thin wrapper —
 *  graph zaten init'liyse aynı build sequence'i tekrarlar. */
function makeDeckLazy(): DeckHandle {
  // graph zaten oluşmuş olmalı (caller getGraph().decks[id] üzerinde
  // çalışıyor). Yeni handle için aynı parametre setiyle bottom-up build.
  const g = getGraph()
  const crossfaderGain = new Tone.Gain(0.707).connect(g.masterGain)
  const filter = new Tone.Filter({
    type: "lowpass",
    frequency: 22000,
    Q: 1,
  }).connect(crossfaderGain)
  const eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 }).connect(filter)
  const panner = new Tone.Panner(0).connect(eq)
  const deckGain = new Tone.Gain(0.85).connect(panner)
  const meter = new Tone.Meter({ smoothing: 0.85 })
  deckGain.connect(meter)
  const grainGate = new Tone.Gain(1).connect(deckGain)
  const scratchGate = new Tone.Gain(0).connect(deckGain)
  return {
    player: null,
    grainGate,
    scratchGate,
    scratchNode: null,
    bufferChannels: null,
    bufferSampleRate: 44100,
    scratchActive: false,
    scratchHeadSec: 0,
    scratchRate: 0,
    lastScratchUpdateMs: null,
    deckGain,
    panner,
    meter,
    eq,
    filter,
    fxNode: null,
    fxType: "none",
    crossfaderGain,
    loadedMediaId: null,
    playStartContextTime: null,
    playStartOffset: 0,
    pitch: 0,
    loop: null,
  }
}

/**
 * UI'dan addDeck → tree.decks[id] eklendiğinde çağrılır. Lazy alternatif
 * (engine her zaman yeni id için handle yaratır). Var olan handle dokunulmaz.
 */
export function ensureDeck(deckId: DeckId): void {
  if (typeof window === "undefined") return
  ensureDeckHandle(deckId)
}

/**
 * UI'dan removeDeck → audio kaynaklarını tamamen dispose et. Player +
 * eq/filter/fx node'ları kapatılır, decks Map'inden silinir. Sonra
 * çağrılırsa ensureDeck ile yeni handle oluşur (boş deck).
 */
export function disposeDeck(deckId: DeckId): void {
  if (typeof window === "undefined") return
  const g = getGraph()
  const handle = g.decks[deckId]
  if (!handle) return
  // Player + scratch dispose
  if (handle.player) {
    try { handle.player.stop() } catch {}
    handle.player.dispose()
  }
  if (handle.scratchNode) {
    try {
      handle.scratchNode.port.postMessage({ type: "active", active: false })
      handle.scratchNode.disconnect()
    } catch {}
  }
  if (handle.fxNode) {
    try { handle.fxNode.disconnect() } catch {}
    handle.fxNode.dispose()
  }
  // Tone chain — sırayla dispose
  for (const node of [handle.deckGain, handle.panner, handle.eq, handle.filter, handle.crossfaderGain, handle.grainGate, handle.scratchGate, handle.meter]) {
    try { node.disconnect() } catch {}
    try { node.dispose() } catch {}
  }
  delete g.decks[deckId]
}

let acStartPromise: Promise<void> | null = null

export function ensureAudioContextStarted(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (!acStartPromise) {
    acStartPromise = Tone.start()
  }
  return acStartPromise
}

// ─── Deck load / transport ─────────────────────────────────────────────

export interface LoadDeckOpts {
  mediaId: string
  url: string
  onLoaded?(info: { duration: number; sampleRate: number; channels: number }): void
  onError?(err: Error): void
}

export async function loadDeck(
  deckId: DeckId,
  opts: LoadDeckOpts,
): Promise<void> {
  const handle = getGraph().decks[deckId]
  if (handle.loadedMediaId === opts.mediaId && handle.player?.loaded) return

  if (handle.player) {
    try {
      handle.player.stop()
    } catch {}
    handle.player.dispose()
    handle.player = null
  }
  handle.loadedMediaId = null
  handle.playStartContextTime = null
  handle.playStartOffset = 0

  try {
    // GrainPlayer — playbackRate'i pitch'ten ayırır (varispeed without
    // pitch change). DJ standard. Grain size + overlap defaults uygun.
    const player = new Tone.GrainPlayer({
      url: opts.url,
      loop: false,
      grainSize: 0.1,
      overlap: 0.05,
      playbackRate: 1 + handle.pitch,
      detune: 0,
    }).connect(handle.grainGate)
    handle.player = player
    await Tone.loaded()
    handle.loadedMediaId = opts.mediaId
    // Worklet için buffer kopyala (transfer list kullanmıyoruz; GrainPlayer
    // hala kendi buffer'ına ihtiyaç duyuyor — .slice() ile kopya).
    const native = player.buffer.get() as AudioBuffer | undefined
    if (native) {
      const chans: Float32Array[] = []
      for (let c = 0; c < native.numberOfChannels; c++) {
        chans.push(new Float32Array(native.getChannelData(c)))
      }
      handle.bufferChannels = chans
      handle.bufferSampleRate = native.sampleRate
      if (handle.scratchNode) postBufferToScratchNode(handle)
    }
    opts.onLoaded?.({
      duration: player.buffer.duration,
      sampleRate: player.buffer.sampleRate,
      channels: player.buffer.numberOfChannels,
    })
  } catch (err) {
    if (handle.player) {
      handle.player.dispose()
      handle.player = null
    }
    handle.loadedMediaId = null
    opts.onError?.(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}

export function ejectDeck(deckId: DeckId): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  if (handle.player) {
    try {
      handle.player.stop()
    } catch {}
    handle.player.dispose()
    handle.player = null
  }
  if (handle.scratchActive && handle.scratchNode) {
    handle.scratchNode.port.postMessage({ type: "active", active: false })
  }
  handle.scratchActive = false
  handle.scratchRate = 0
  handle.scratchHeadSec = 0
  handle.lastScratchUpdateMs = null
  handle.bufferChannels = null
  handle.grainGate.gain.value = 1
  handle.scratchGate.gain.value = 0
  handle.loadedMediaId = null
  handle.playStartContextTime = null
  handle.playStartOffset = 0
}

export function playDeck(deckId: DeckId, fromSeconds = 0): void {
  const handle = getGraph().decks[deckId]
  if (!handle.player || !handle.player.loaded) return
  try {
    handle.player.stop()
  } catch {}
  handle.player.start(undefined, fromSeconds)
  handle.playStartContextTime = Tone.now()
  handle.playStartOffset = fromSeconds
}

export function pauseDeck(deckId: DeckId): number {
  const handle = getGraph().decks[deckId]
  if (!handle.player) return 0
  const position = getDeckPosition(deckId)
  try {
    handle.player.stop()
  } catch {}
  handle.playStartContextTime = null
  handle.playStartOffset = position
  return position
}

export function seekDeck(deckId: DeckId, seconds: number, isPlaying: boolean): void {
  const handle = getGraph().decks[deckId]
  if (!handle.player) return
  handle.playStartOffset = seconds
  if (isPlaying) {
    try {
      handle.player.stop()
    } catch {}
    handle.player.start(undefined, seconds)
    handle.playStartContextTime = Tone.now()
  } else {
    handle.playStartContextTime = null
  }
}

export function getDeckPosition(deckId: DeckId): number {
  if (typeof window === "undefined") return 0
  const handle = getGraph().decks[deckId]
  if (!handle.player) return 0
  if (handle.playStartContextTime === null) return handle.playStartOffset
  const elapsed = Tone.now() - handle.playStartContextTime
  // Pitch fader playbackRate'i etkiler → wall-clock zamanda kat edilen
  // mesafe (1+pitch)*elapsed kadar.
  let pos = handle.playStartOffset + elapsed * (1 + handle.pitch)
  // Loop aktifse Tone.GrainPlayer loopEnd'e ulaşınca loopStart'a
  // sample-accurate sıçrar — UI'nın aynısını görmesi için head'i
  // loopStart..loopEnd aralığına modulo al. playStartOffset loop dışında
  // (önce) ise, ilk geçişten sonra modulo devreye girer.
  if (handle.loop) {
    const { start: ls, end: le } = handle.loop
    const loopLen = le - ls
    if (loopLen > 0 && pos > le) {
      const overshoot = (pos - ls) % loopLen
      pos = ls + overshoot
    }
  }
  const duration = handle.player.buffer?.duration ?? 0
  return Math.min(Math.max(pos, 0), duration)
}

export function setDeckVolume(deckId: DeckId, linear: number): void {
  if (typeof window === "undefined") return
  const clamped = Math.max(0, Math.min(1, linear))
  getGraph().decks[deckId].deckGain.gain.rampTo(clamped, 0.05)
}

/** Stereo pan — -1 (full sol) ... 0 (center) ... +1 (full sağ). */
export function setDeckPan(deckId: DeckId, pan: number): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  if (!handle) return
  const clamped = Math.max(-1, Math.min(1, pan))
  handle.panner.pan.rampTo(clamped, 0.05)
}

/**
 * Pitch fader — ±16% tempo değişimi (pitch sabit; GrainPlayer granular
 * stretch). 0 = nominal, 0.08 = +8% tempo (BPM artar), -0.16 = -16%.
 */
export function setDeckPitch(deckId: DeckId, pitch: number): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  const clamped = Math.max(-0.5, Math.min(0.5, pitch))
  // Position snapshot — playbackRate değişikliği wall-clock'tan kopuk
  if (handle.playStartContextTime !== null) {
    const nowPos = getDeckPosition(deckId)
    handle.playStartOffset = nowPos
    handle.playStartContextTime = Tone.now()
  }
  handle.pitch = clamped
  if (handle.player) {
    handle.player.playbackRate = 1 + clamped
  }
}

// ─── Scratch (AudioWorklet, true reverse) ───────────────────────────────

/**
 * Scratch sub-system — AudioWorklet sample-level buffer reader.
 *
 * Vinyl scratch'ın iki temel davranışı:
 *   1. Pozitif rate → ileri çalar (durdurulmuş bile olsa head ilerler).
 *   2. Negatif rate → GERÇEK ters çalma (sample buffer geriye okunur,
 *      "wikiwiki" sesi). Tone.GrainPlayer bunu desteklemez; bu yüzden
 *      AudioWorklet ile sample-by-sample interpolation kullandık.
 *
 * Routing (per-deck):
 *   GrainPlayer  → grainGate ──┐
 *                              ├→ deckGain → eq → filter → ...
 *   ScratchNode  → scratchGate ┘
 *
 * setScratchActive(deckId, true, isPlayingContext)
 *   - Worklet'i (lazy) yükle, ScratchNode'u kur.
 *   - GrainPlayer'ı stop et + grainGate 0, scratchGate 1.
 *   - Worklet'e current position'ı `startSeconds` ile gönder.
 *
 * setScratchRate(deckId, rate)
 *   - Worklet'e signed rate gönderir. rate=1 = nominal forward;
 *     rate=-1 = reverse; rate=0 = freeze (silent).
 *   - Main thread'te de head'i simulate eder (worklet'ten poll
 *     beklemeyiz; latency düşük olur).
 *
 * setScratchActive(deckId, false, isPlayingContext)
 *   - Worklet'in son head pozisyonunu (main-thread simulasyon) GrainPlayer'a
 *     `start(undefined, pos)` ile transfer eder.
 *   - grainGate 1, scratchGate 0.
 */

let scratchWorkletReady: Promise<void> | null = null
const WORKLET_PATH = "/audio-worklets/scratch-processor.js"

export async function preloadScratchWorklet(): Promise<void> {
  await ensureScratchWorkletReady()
}

async function ensureScratchWorkletReady(): Promise<void> {
  if (typeof window === "undefined") return
  if (scratchWorkletReady) return scratchWorkletReady
  scratchWorkletReady = (async () => {
    await ensureAudioContextStarted()
    const ctx = Tone.getContext().rawContext as AudioContext
    try {
      await ctx.audioWorklet.addModule(WORKLET_PATH)
    } catch (err) {
      scratchWorkletReady = null
      console.error("[audio-engine] scratch worklet load failed", err)
      throw err
    }
  })()
  return scratchWorkletReady
}

function postBufferToScratchNode(handle: DeckHandle): void {
  if (!handle.scratchNode || !handle.bufferChannels) return
  handle.scratchNode.port.postMessage({
    type: "buffer",
    channels: handle.bufferChannels,
    sampleRate: handle.bufferSampleRate,
    startSeconds: handle.playStartOffset,
  })
}

async function ensureScratchNode(deckId: DeckId): Promise<AudioWorkletNode | null> {
  if (typeof window === "undefined") return null
  await ensureScratchWorkletReady()
  const handle = getGraph().decks[deckId]
  if (handle.scratchNode) return handle.scratchNode
  const ctx = Tone.getContext().rawContext as AudioContext
  const node = new AudioWorkletNode(ctx, "scratch-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  // Worklet (native AudioWorkletNode) → scratchGate (Tone.Gain). Tone'un
  // static connect helper'ı native ↔ Tone interop'unu yönetir.
  Tone.connect(node, handle.scratchGate)
  handle.scratchNode = node
  if (handle.bufferChannels) postBufferToScratchNode(handle)
  return node
}

/**
 * Scratch mode'u aç/kapa. Açarken GrainPlayer susturulur + worklet aktif
 * olur; kapatırken son scratch head pozisyonundan GrainPlayer (varsa)
 * yeniden başlar.
 *
 * `isPlayingContext` — kapatma sırasında GrainPlayer'ı resume edip
 *   etmeyeceğimizi söyler. Kullanıcı pause modundayken scratch yapıyorsa
 *   false; play sırasında scratch yapıyorsa true geçilmeli.
 */
export function setScratchActive(
  deckId: DeckId,
  active: boolean,
  isPlayingContext: boolean,
): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  if (!handle.player || !handle.player.loaded) return

  if (active) {
    if (handle.scratchActive) return
    // Position snapshot — burada dondur, scratch sonrası buradan resume
    const nowPos = getDeckPosition(deckId)
    handle.playStartOffset = nowPos
    handle.playStartContextTime = null
    handle.scratchHeadSec = nowPos
    handle.scratchRate = 0
    handle.lastScratchUpdateMs = performance.now()
    // scratchActive SYNC olarak hemen set — kullanıcı çok kısa drag yapıp
    // bırakırsa (down → up çok hızlı), worklet init'i beklemeden
    // setScratchActive(false) doğru cleanup yapsın.
    handle.scratchActive = true

    // ÖNEMLİ: GrainPlayer'ı şimdi durdurma + gate'leri swap etme. Worklet
    // hazırlanırken (ilk açılışta ~100-500ms) GrainPlayer susarsa kullanıcı
    // sessizlik duyar → scratch hissi kaybolur. Bunun yerine:
    //   1. GrainPlayer çalmaya devam (rate kontrolü preliminary scratch
    //      hissi verir) — playbackRate'i 0'a çekiyoruz (freeze hissi)
    //   2. Worklet hazır olunca gate swap + ScratchNode'a aktive ol komutu
    if (handle.player) {
      try {
        handle.player.playbackRate = 0.001 // near-zero = freeze, sessizleştir
      } catch {}
    }

    // Worklet hazırlığı arka planda. Hazır olunca gate swap + active komut.
    ensureScratchNode(deckId)
      .then((node) => {
        if (!node) return
        if (!handle.scratchActive) return
        // Buffer yoksa loadDeck'in postunu kaçırılmış olabilir — yeniden
        // post et (idempotent).
        if (handle.bufferChannels) postBufferToScratchNode(handle)
        // Şimdi GrainPlayer'ı tam durdur (worklet sesi devralacak)
        try {
          handle.player?.stop()
        } catch {}
        handle.grainGate.gain.rampTo(0, 0.005)
        handle.scratchGate.gain.rampTo(1, 0.005)
        node.port.postMessage({
          type: "active",
          active: true,
          startSeconds: handle.scratchHeadSec,
        })
        // Aradaki rate update'leri kaçırmamak için son komutu da gönder
        node.port.postMessage({ type: "rate", rate: handle.scratchRate })
      })
      .catch((err) => {
        console.error("[audio-engine] scratch node init failed", err)
      })
  } else {
    if (!handle.scratchActive) return
    // Main-thread simulasyondaki final head'i clamp et
    advanceScratchHead(handle)
    const duration = handle.player?.buffer?.duration ?? 0
    const finalPos = Math.max(
      0,
      Math.min(handle.scratchHeadSec, Math.max(0, duration - 0.05)),
    )
    handle.scratchActive = false
    handle.scratchRate = 0
    handle.lastScratchUpdateMs = null

    if (handle.scratchNode) {
      handle.scratchNode.port.postMessage({ type: "active", active: false })
    }
    handle.grainGate.gain.rampTo(1, 0.005)
    handle.scratchGate.gain.rampTo(0, 0.005)

    handle.playStartOffset = finalPos
    if (isPlayingContext && handle.player) {
      // Tone.GrainPlayer stop→start sırasında "Start time must be strictly
      // greater than previous start time" hatası verebilir — explicit
      // try/catch + Tone.now()+0.01 ile bir sonraki audio frame'e
      // schedule et ki scheduler conflict olmasın.
      try {
        handle.player.stop()
      } catch {}
      // Pitch sıfırlama: scratch sırasında setScratchRate preliminary
      // mode'da GrainPlayer.playbackRate'i değiştirmiş olabilir.
      try {
        handle.player.playbackRate = 1 + handle.pitch
      } catch {}
      const startAt = Tone.now() + 0.01
      try {
        handle.player.start(startAt, finalPos)
        handle.playStartContextTime = startAt
      } catch (err) {
        console.error("[audio-engine] scratch resume start failed", err)
        // Fallback — bir frame sonra dene
        setTimeout(() => {
          try {
            handle.player?.start(undefined, finalPos)
            handle.playStartContextTime = Tone.now()
          } catch (e2) {
            console.error("[audio-engine] scratch resume retry failed", e2)
          }
        }, 30)
      }
    } else {
      // Resume yok — playbackRate'i normale döndür yine de (gelecek play
      // doğru rate'le başlasın).
      if (handle.player) {
        try {
          handle.player.playbackRate = 1 + handle.pitch
        } catch {}
      }
      handle.playStartContextTime = null
    }
  }
}

function advanceScratchHead(handle: DeckHandle): void {
  const now = performance.now()
  if (handle.lastScratchUpdateMs !== null) {
    const dt = (now - handle.lastScratchUpdateMs) / 1000
    const duration = handle.player?.buffer?.duration ?? 0
    handle.scratchHeadSec = Math.max(
      0,
      Math.min(handle.scratchHeadSec + handle.scratchRate * dt, Math.max(0, duration - 0.001)),
    )
  }
  handle.lastScratchUpdateMs = now
}

/**
 * Scratch rate (signed). Aktif scratch sırasında her pointer hareketinde
 * çağrılır. Pozitif = ileri, negatif = TERS, 0 = freeze (silent).
 *
 * Worklet'e mesaj postalanır + main-thread head simulasyonu güncellenir.
 * Worklet hazır değilse (ilk açılış) main-thread head ilerlemeye devam,
 * GrainPlayer.playbackRate ile preliminary scratch hissi verilir;
 * worklet hazır olunca son rate ScratchNode'a post edilir.
 */
export function setScratchRate(deckId: DeckId, rate: number): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  if (!handle?.scratchActive) return
  const clamped = Math.max(-4, Math.min(4, rate))
  advanceScratchHead(handle)
  handle.scratchRate = clamped
  if (handle.scratchNode) {
    handle.scratchNode.port.postMessage({ type: "rate", rate: clamped })
  } else if (handle.player) {
    // Worklet hazır değil → GrainPlayer'ı approximation olarak kullan.
    // Negatif rate desteklenmediği için 0..4 aralığına clamp; reverse
    // scratch hissi geçici olarak forward'a düşer (worklet hazır olunca
    // tam destek devreye girer).
    try {
      handle.player.playbackRate = Math.max(0.001, Math.abs(clamped))
    } catch {}
  }
}

/** Eski API — scratch aktifken UI'dan rate set etmeye eşdeğer kısa yol. */
export function endScratch(deckId: DeckId): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  if (!handle.scratchActive) return
  // Kullanıcının açtığı playState'i buradan bilemeyiz; setScratchActive
  // 2-parametre versiyonu çağrılmalı. Default: play durumunu çağıran
  // tarafa bırak; bu yardımcı reverse-compat amaçlı duruyor.
  void setScratchActive(deckId, false, true)
}

/**
 * Smooth pitch ramp — auto-mix tempo-match için. `durationSec` saniye
 * boyunca current pitch'ten target'a interpolate eder (linear). Her tick'te
 * setDeckPitch çağırarak position snapshot'ı korur.
 *
 * Döner: cleanup function (animasyonu iptal eder).
 */
export function rampDeckPitch(
  deckId: DeckId,
  targetPitch: number,
  durationSec: number,
  onUpdate?: (pitch: number) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined
  const handle = getGraph().decks[deckId]
  const startPitch = handle.pitch
  const startTime = performance.now()
  const durationMs = durationSec * 1000
  let cancelled = false
  let rafId: number

  function tick() {
    if (cancelled) return
    const elapsed = performance.now() - startTime
    const t = Math.min(elapsed / durationMs, 1)
    const newPitch = startPitch + (targetPitch - startPitch) * t
    setDeckPitch(deckId, newPitch)
    onUpdate?.(newPitch)
    if (t < 1) {
      rafId = requestAnimationFrame(tick)
    }
  }
  rafId = requestAnimationFrame(tick)

  return () => {
    cancelled = true
    if (rafId) cancelAnimationFrame(rafId)
  }
}

export function isDeckLoaded(deckId: DeckId): boolean {
  if (typeof window === "undefined") return false
  return getGraph().decks[deckId].player?.loaded ?? false
}

export function getDeckDuration(deckId: DeckId): number {
  if (typeof window === "undefined") return 0
  return getGraph().decks[deckId].player?.buffer?.duration ?? 0
}

/**
 * Deck'in mevcut player buffer'ından [startSec, endSec] aralığını çıkarıp
 * yeni bir AudioBuffer döner. Loop sample export / clip transfer için.
 *
 * Sample-accurate slice — sourceRate üzerinden hesaplanır. Multi-channel
 * (stereo) destekli — her kanal ayrı kopyalanır.
 *
 * Hata durumları:
 *   - deck yok → null
 *   - player yüklü değil veya buffer yok → null
 *   - range invalid (start >= end veya start < 0 veya end > duration) → null
 */
export function extractDeckBufferSlice(
  deckId: DeckId,
  startSec: number,
  endSec: number,
): AudioBuffer | null {
  if (typeof window === "undefined") return null
  const handle = getGraph().decks[deckId]
  if (!handle?.player) return null
  const srcBuf = handle.player.buffer.get() as AudioBuffer | undefined
  if (!srcBuf) return null
  const sr = srcBuf.sampleRate
  const startSample = Math.max(0, Math.floor(startSec * sr))
  const endSample = Math.min(srcBuf.length, Math.floor(endSec * sr))
  if (endSample <= startSample) return null
  const sliceLen = endSample - startSample
  const ctx = Tone.getContext().rawContext as BaseAudioContext
  const out = ctx.createBuffer(srcBuf.numberOfChannels, sliceLen, sr)
  for (let c = 0; c < srcBuf.numberOfChannels; c++) {
    const src = srcBuf.getChannelData(c)
    const dst = out.getChannelData(c)
    for (let i = 0; i < sliceLen; i++) {
      dst[i] = src[startSample + i] ?? 0
    }
  }
  return out
}

// ─── Crossfader ────────────────────────────────────────────────────────

/**
 * Crossfader pozisyonu + eğrisi. position: -1 (full A) ... 0 (center) ... +1 (full B).
 * Eğer caller sadece position değiştiriyorsa curve mevcut değer ile devam eder.
 */
export function setCrossfader(input: {
  position?: number
  curve?: CrossfaderCurve
  aDeck?: string
  bDeck?: string
}): void {
  if (typeof window === "undefined") return
  const g = getGraph()
  if (typeof input.position === "number") {
    g.crossfader.position = Math.max(-1, Math.min(1, input.position))
  }
  if (input.curve) g.crossfader.curve = input.curve
  if (input.aDeck) g.crossfader.aDeck = input.aDeck
  if (input.bDeck) g.crossfader.bDeck = input.bDeck

  const [a, b] = crossfaderGains(g.crossfader.position, g.crossfader.curve)
  // Smooth ramp — instant switch ses pumping/click yapar.
  // Pioneer DJM "assign switch" davranışı: kullanıcının atadığı aDeck/
  // bDeck crossfader-controlled, diğerleri "Thru" (0.707 constant).
  // Auto-mix sırasında from→to deck'leri override eder.
  const { aDeck, bDeck } = g.crossfader
  for (const [id, handle] of Object.entries(g.decks)) {
    if (id === aDeck) {
      handle.crossfaderGain.gain.rampTo(a, 0.05)
    } else if (id === bDeck) {
      handle.crossfaderGain.gain.rampTo(b, 0.05)
    } else {
      handle.crossfaderGain.gain.rampTo(0.707, 0.05)
    }
  }
}

function crossfaderGains(
  position: number,
  curve: CrossfaderCurve,
): [number, number] {
  const t = (position + 1) / 2 // 0..1, 0=A 1=B
  switch (curve) {
    case "linear":
      return [1 - t, t]
    case "smooth": {
      // Constant-power — perceived loudness sabit, müzik miksinde standart
      const a = Math.cos((t * Math.PI) / 2)
      const b = Math.sin((t * Math.PI) / 2)
      return [a, b]
    }
    case "sharp": {
      // Club kill — center'da her iki taraf da kapanır; cut-style mixing
      // Pivot: 0..0.5 sadece A varyalı, 0.5..1 sadece B varyalı (overlap dar)
      const a = Math.max(0, Math.min(1, 1 - t * 2))
      const b = Math.max(0, Math.min(1, t * 2 - 1))
      // Smooth corners ile sert geçiş yapma; sqrt ile yumuşat
      return [Math.sqrt(a), Math.sqrt(b)]
    }
  }
}

// ─── Master ────────────────────────────────────────────────────────────

/** Master output linear gain (0..2). 1.0 = nominal, 2.0 = +6dB boost. */
export function setMasterGain(linear: number): void {
  if (typeof window === "undefined") return
  const clamped = Math.max(0, Math.min(2, linear))
  getGraph().masterGain.gain.rampTo(clamped, 0.05)
}

/**
 * VU meter okuma — dBFS (-Infinity..0; tipik kullanım -60..0). UI rAF
 * loop'unda 30Hz okur, segment LED'lere map eder.
 * Tone.Meter mono — multi-channel ise channels=1 ile constructor; varsa
 * `getValue()` number döner, yoksa number[] (stereo split).
 */
export function getMasterMeterDb(): number {
  if (typeof window === "undefined") return -Infinity
  const val = getGraph().masterMeter.getValue()
  return typeof val === "number" ? val : (val[0] ?? -Infinity)
}

export function getDeckMeterDb(deckId: DeckId): number {
  if (typeof window === "undefined") return -Infinity
  const handle = getGraph().decks[deckId]
  if (!handle) return -Infinity
  const val = handle.meter.getValue()
  return typeof val === "number" ? val : (val[0] ?? -Infinity)
}

/** Master limiter threshold (dBFS, -3..0). Lower = harder limiting. */
export function setMasterLimiter(thresholdDb: number): void {
  if (typeof window === "undefined") return
  const clamped = Math.max(-3, Math.min(0, thresholdDb))
  getGraph().limiter.threshold.value = clamped
}

/**
 * Master FX slot — masterGain → [masterFxNode?] → limiter. Pioneer
 * DJM-900 master FX davranışı: type değiştirilirse mevcut node dispose
 * + yeni node insert. type === "none" bypass: doğrudan limiter.
 *
 * Wet (0..1) — type aynı kalırsa rampTo edilir, type değişirse yeni
 * node oluşturulurken initial wet olarak set edilir.
 */
export function setMasterFx(type: string, wet: number): void {
  if (typeof window === "undefined") return
  const g = getGraph()
  const w = Math.max(0, Math.min(1, wet))

  // Aynı type ise sadece wet update
  if (g.masterFxType === type) {
    if (g.masterFxNode && hasWet(g.masterFxNode)) {
      g.masterFxNode.wet.rampTo(w, 0.05)
    }
    return
  }

  // Disconnect mevcut zinciri
  try {
    g.masterGain.disconnect()
  } catch {}
  if (g.masterFxNode) {
    try {
      g.masterFxNode.disconnect()
    } catch {}
    g.masterFxNode.dispose()
    g.masterFxNode = null
  }

  g.masterFxType = type

  if (type === "none") {
    g.masterGain.connect(g.limiter)
    return
  }

  const fx = createFxNode(type, w)
  if (!fx) {
    g.masterGain.connect(g.limiter)
    return
  }
  g.masterFxNode = fx
  g.masterGain.connect(fx).connect(g.limiter)
}

// ─── EQ / Filter / FX ────────────────────────────────────────────────────

/**
 * 3-band EQ — each -1..+1.
 *   -1 = -∞ (kill, -40dB)
 *    0 = neutral (0dB)
 *   +1 = +6dB boost
 */
export function setDeckEq(
  deckId: DeckId,
  eq: { low?: number; mid?: number; high?: number },
): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  if (eq.low !== undefined) handle.eq.low.rampTo(scaleEq(eq.low), 0.03)
  if (eq.mid !== undefined) handle.eq.mid.rampTo(scaleEq(eq.mid), 0.03)
  if (eq.high !== undefined) handle.eq.high.rampTo(scaleEq(eq.high), 0.03)
}

function scaleEq(v: number): number {
  const clamped = Math.max(-1, Math.min(1, v))
  if (clamped <= -0.99) return -40 // kill
  if (clamped < 0) return clamped * 24 // -24dB at -1
  return clamped * 6 // +6dB at +1
}

/**
 * Combined HP/LP filter knob.
 *   -1..0  → high-pass, frequency sweeps 5000Hz (-1, fully closed)
 *            down to 20Hz (0, bypass)
 *    0     → effectively bypass (lowpass @ 22kHz)
 *    0..+1 → low-pass, frequency sweeps 22000Hz (0, bypass)
 *            down to 200Hz (+1, fully closed)
 *
 * Resonance: 0..1 → Q 0.7..15
 */
export function setDeckFilter(
  deckId: DeckId,
  cutoff: number,
  resonance = 0.5,
): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  const c = Math.max(-1, Math.min(1, cutoff))
  const q = 0.7 + Math.max(0, Math.min(1, resonance)) * 14
  handle.filter.Q.value = q
  if (c <= 0.02 && c >= -0.02) {
    // Bypass — lowpass 22k tam açık
    handle.filter.type = "lowpass"
    handle.filter.frequency.rampTo(22000, 0.05)
  } else if (c < 0) {
    // High-pass — sol taraf
    handle.filter.type = "highpass"
    const freq = lerpExp(20, 5000, -c)
    handle.filter.frequency.rampTo(freq, 0.05)
  } else {
    handle.filter.type = "lowpass"
    const freq = lerpExp(22000, 200, c)
    handle.filter.frequency.rampTo(freq, 0.05)
  }
}

/** Exponential lerp — daha doğal filter sweep hissi (logarithmic kulağa
 *  uyumlu). */
function lerpExp(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  const logFrom = Math.log(from)
  const logTo = Math.log(to)
  return Math.exp(logFrom + (logTo - logFrom) * clamped)
}

/**
 * Per-deck FX slot — type değişimi mevcut node'u dispose + yenisini
 * insert eder (filter → fx → crossfaderGain).
 *
 * Type "none" → fxNode yok, filter doğrudan crossfaderGain'a bağlı.
 * Wet: 0..1, FX'in `.wet` parametresinden geçer.
 */
export function setDeckFx(
  deckId: DeckId,
  type: string,
  wet: number,
): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]

  // Type aynıysa sadece wet update
  if (handle.fxType === type) {
    if (handle.fxNode && hasWet(handle.fxNode)) {
      handle.fxNode.wet.rampTo(Math.max(0, Math.min(1, wet)), 0.05)
    }
    return
  }

  // Disconnect filter (mevcut routing)
  try {
    handle.filter.disconnect()
  } catch {}
  if (handle.fxNode) {
    try {
      handle.fxNode.disconnect()
    } catch {}
    handle.fxNode.dispose()
    handle.fxNode = null
  }

  handle.fxType = type

  if (type === "none") {
    handle.filter.connect(handle.crossfaderGain)
    return
  }

  const fx = createFxNode(type, wet)
  if (!fx) {
    handle.filter.connect(handle.crossfaderGain)
    return
  }
  handle.fxNode = fx
  handle.filter.connect(fx).connect(handle.crossfaderGain)
}

function hasWet(node: Tone.ToneAudioNode): node is Tone.ToneAudioNode & {
  wet: Tone.Param<"normalRange">
} {
  return "wet" in node && (node as { wet?: unknown }).wet !== undefined
}

function createFxNode(type: string, wet: number): Tone.ToneAudioNode | null {
  const w = Math.max(0, Math.min(1, wet))
  switch (type) {
    case "echo":
      // PingPongDelay — feedback 0.5 (daha duyulur kuyruk), wet sliderı
      // dry/wet karışımı kontrol eder.
      return new Tone.PingPongDelay({
        delayTime: "8n",
        feedback: 0.5,
        wet: w,
      })
    case "reverb":
      // Tone.Reverb async IR generation; ses çıkana kadar pass-through
      // olur (kullanıcı "wet duyulmuyor" sanır). Freeverb algorithmic
      // ve anlık; daha dramatic için roomSize yüksek + dampening orta.
      return new Tone.Freeverb({
        roomSize: 0.85,
        dampening: 3000,
        wet: w,
      })
    case "phaser":
      return new Tone.Phaser({
        frequency: 0.8,
        octaves: 4,
        baseFrequency: 350,
        Q: 8,
        wet: w,
      })
    case "bitcrusher": {
      // BitCrusher 3-bit daha agresif (4-bit fark zor duyulur)
      const bc = new Tone.BitCrusher(3)
      bc.wet.value = w
      return bc
    }
    case "filterSweep":
      return new Tone.AutoFilter({
        frequency: 0.5,
        baseFrequency: 200,
        octaves: 5,
        wet: w,
      }).start()
    default:
      return null
  }
}

// ─── Hotcues + Loops ─────────────────────────────────────────────────────

/**
 * Loop set + enable. start/end saniye cinsinden, start < end.
 * enabled=true → Tone GrainPlayer'ın loop attribute'u açılır, currently
 * playing ise loop'a girer.
 *
 * **Önemli:** Tone GrainPlayer loop'a girince loopStart/loopEnd değişikliği
 * sample-accurate apply olur; ama playback offset hesabı (getDeckPosition)
 * loopEnd'e ulaşınca loopStart'a sıçradığını bilmiyor — UI position lineer
 * artıyor görünür. Workaround: rAF tick'inde `pos > loopEnd` ise
 * playStartOffset'i adjust et (basit modulo benzeri).
 */
export function setDeckLoop(
  deckId: DeckId,
  loop: { start: number; end: number; enabled: boolean } | null,
): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  if (!handle.player) return
  if (loop === null || !loop.enabled) {
    // Loop-off: audio loop'larken linear head ileri kaçmıştı (getDeckPosition
    // modulo ile in-loop pozisyonu gösterir ama playStartOffset lineer). Loop'u
    // kapatınca head o ileri pozisyona sıçrayıp anlamsız ses kayması yaratıyordu.
    // Fix: kapatmadan ÖNCE mevcut in-loop pozisyonu al, kapat, oradan ileri
    // seek et → DJ mantığında loop'tan çıkış (bulunulan noktadan devam).
    const wasLooping = handle.loop !== null
    const playing = handle.playStartContextTime !== null
    if (wasLooping && playing) {
      const pos = getDeckPosition(deckId)
      handle.player.loop = false
      handle.loop = null
      seekDeck(deckId, pos, true)
    } else {
      handle.player.loop = false
      handle.loop = null
    }
    return
  }
  const start = Math.max(0, loop.start)
  const end = Math.max(start + 0.01, loop.end)
  handle.player.loopStart = start
  handle.player.loopEnd = end
  handle.player.loop = true
  // UI position hesabı için handle'da da sakla (getDeckPosition modulo).
  handle.loop = { start, end }
}

// ─── Live recording (master output → MediaRecorder) ─────────────────────

let mediaRecorder: MediaRecorder | null = null
let recordingChunks: Blob[] = []
let recordingDest: MediaStreamAudioDestinationNode | null = null
let recordingMimeType: string = ""

function pickRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/aac",
  ]
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c
    } catch {
      /* noop */
    }
  }
  return ""
}

/**
 * Live recording başlat — master limiter çıktısı MediaStreamDestination'a
 * tee'lenir, MediaRecorder o stream'i kaydeder. Stream destination zaten
 * varsa yeniden bağlanmaz (multiple start/stop'a güvenli).
 */
export async function startRecording(): Promise<void> {
  if (typeof window === "undefined") return
  await ensureAudioContextStarted()

  const ctx = Tone.getContext().rawContext as AudioContext

  if (!recordingDest) {
    recordingDest = ctx.createMediaStreamDestination()
    // Tee: limiter → destination (speakers, zaten bağlı) + recordingDest
    // Tone limiter .connect(rawNode) destekler.
    try {
      ;(getGraph().limiter as unknown as { connect: (n: AudioNode) => void }).connect(
        recordingDest,
      )
    } catch (err) {
      console.warn("[studio/rec] limiter→recordingDest connect failed", err)
    }
  }

  recordingMimeType = pickRecordingMimeType()
  recordingChunks = []
  mediaRecorder = new MediaRecorder(
    recordingDest.stream,
    recordingMimeType ? { mimeType: recordingMimeType } : undefined,
  )
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordingChunks.push(e.data)
  }
  mediaRecorder.start(1000) // 1sn chunk'lar — uzun set'lerde memory büyür ama OK
}

export function isRecording(): boolean {
  return mediaRecorder?.state === "recording"
}

export interface RecordingResult {
  blob: Blob
  mimeType: string
  /** Önerilen file extension — .webm / .mp4 / .ogg. */
  extension: string
}

export async function stopRecording(): Promise<RecordingResult | null> {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return null
  return new Promise((resolve) => {
    const mr = mediaRecorder!
    mr.onstop = () => {
      const blob = new Blob(recordingChunks, {
        type: recordingMimeType || mr.mimeType || "audio/webm",
      })
      const mime = blob.type || "audio/webm"
      const extension = mime.includes("webm")
        ? "webm"
        : mime.includes("mp4")
          ? "mp4"
          : mime.includes("ogg")
            ? "ogg"
            : mime.includes("aac")
              ? "aac"
              : "bin"
      mediaRecorder = null
      recordingChunks = []
      resolve({ blob, mimeType: mime, extension })
    }
    mr.stop()
  })
}

/** Hot cue jump — verilen pozisyona seek. Çalıyor durumda kalır. */
export function jumpDeckTo(
  deckId: DeckId,
  position: number,
  isPlaying: boolean,
): void {
  if (typeof window === "undefined") return
  const handle = getGraph().decks[deckId]
  if (!handle.player) return
  handle.playStartOffset = position
  if (isPlaying) {
    try {
      handle.player.stop()
    } catch {}
    handle.player.start(undefined, position)
    handle.playStartContextTime = Tone.now()
  } else {
    handle.playStartContextTime = null
  }
}

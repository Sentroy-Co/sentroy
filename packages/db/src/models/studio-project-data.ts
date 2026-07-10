import { getDb } from "../client"
import { toId } from "./_helpers"

const COLLECTION = "studio_project_data"

/**
 * Sentroy Studio — proje ağaç verisi. `studio_projects` metadata'sından
 * ayrı tutuluyor (dashboard list query'leri ağır JSON yüklemesin diye).
 *
 * **Mode'a göre discriminated union.** DJ projeler ve Musician projeler
 * çok farklı şekiller — tek schema'da zorlama union yerine açık ayrım.
 * v1 sadece "dj" shipping; "musician" v2.
 *
 * Auto-save her 3 saniyede tüm tree'yi replace eder; küçük JSON write
 * Mongo için ucuz. Optimistic concurrency için `revision` counter.
 */
export interface StudioProjectData {
  id: string
  /** FK → studio_projects.id (1-to-1). Indexed unique. */
  projectId: string
  /** Project tree format version — mode başına bağımsız. */
  version: number
  /** Tüm DAW/DJ ağacı. */
  tree: StudioProjectTree
  /** Optimistic concurrency için revision counter — her save +1. Client
   *  son bildiği revision'ı gönderir, mismatch'te 409. */
  revision: number
  updatedAt: Date
}

/** Mode-discriminated proje ağacı. */
export type StudioProjectTree = StudioDjProjectTree | StudioMusicianProjectTree

// ─── DJ mode (v1 — shipping) ─────────────────────────────────────────────

/**
 * DJ project — sol/sağ deck, crossfader, master FX, playlist, recordings.
 *
 * Workflow: kullanıcı sample'larını upload eder → playlist'e ekler →
 * deck'e yükler → çalar, mix yapar → record butonuyla tüm master out'u
 * yakalar → kayıt bucket'a düşer.
 */
/**
 * Dinamik deck setup — kullanıcı istediği sayıda deck ekleyebilir (default
 * A,B,C,D, +N up to Z). Crossfader v1'de yalnızca "A" ve "B" id'lerini
 * etkiler; kullanıcı bu iki deck'i silerse crossfader bypass olur.
 * v2'de per-channel crossfader assign switch.
 *
 * Tip artık geniş bir union/alias: kullanıcı tanımlı deck id'ler runtime
 * string'tir; modele bir alias olarak `string` koyuyoruz (kontrolü `decks`
 * record'undaki anahtarlar yapar).
 */
export type DjDeckId = string

export interface StudioDjProjectTree {
  mode: "dj"
  version: 1
  /** Dinamik deck koleksiyonu — A,B,C,D default; kullanıcı ekler/siler.
   *  Audio engine lazy create — burada olan her deck için handle var. */
  decks: Record<DjDeckId, DjDeck>
  /**
   * Yatay layout sırası — sortable item id'leri. Deck id'leri ("A","B",...)
   * + mixer id'leri ("mixer-default", "mixer-1", ...). Legacy projelerde
   * "mixer" sentinel'i tek mixer'a karşılık gelirdi — runtime normalizer
   * bunu `mixers[0].id` ile değiştirir.
   */
  layout: string[]
  /**
   * Multi-mixer collection — gerçek DJ donanımında DJM-V10 / Allen&Heath
   * Xone kümeleri için. Her mixer kendi crossfader + master out'una sahip;
   * her deck `assignedMixerId` ile bir mixer'a route edilir. Master signal
   * flow:
   *   deck.channelGain → mixer.master → mixer.limiter ───┐
   *   ...                                                  ├→ rootMaster → destination
   *   deck.channelGain → otherMixer.master → ...limiter ───┘
   *
   * Default tek mixer ("Main") ile gelir; emptyDjTree() bunu kurar.
   */
  mixers: DjMixer[]
  /**
   * @deprecated mixers[0].crossfader. Eski tree'lerde standalone alandı;
   *   schema'da backward-compat için tutulur ama runtime normalize ile
   *   mixers[0]'a yansıtılır. Yeni kod mixers[i].crossfader kullansın.
   */
  crossfader: DjCrossfader
  /** @deprecated mixers[0].master. Yukarıdaki ile aynı pattern. */
  master: {
    gain: number
    limiterCeiling: number
    effects: DjEffect[]
  }
  /** Playlist queue — kullanıcının deck'e yüklediği / yükleyebileceği track listesi.
   *  Drag-drop ile sıralanabilir; deck loading bu listeden seçim. */
  playlist: DjPlaylistItem[]
  /** Kayıtlı set listesi — her recording bucket'a yüklenir, burası referans tutar.
   *  Dashboard'da "Recorded sets" tab'ında görünür. */
  recordings: DjRecording[]
  /** Quantize on/off — aktifken setHotcue, setLoop, jumpDeckTo işlemleri
   *  en yakın downbeat'e snap eder (deck.bpm + beatgridOffset gerekir).
   *  Default false (kullanıcı serbest). */
  quantize?: boolean
}

/**
 * Tek bir DJ mixer instance'ı. Her mixer bağımsız:
 *   - crossfader (kendi aDeck/bDeck assign'ı)
 *   - master out (gain + limiter + FX chain)
 *   - assigned deck'ler (DjDeck.assignedMixerId üzerinden)
 *
 * Tek bir tree birden çok mixer barındırabilir — battle mixer + booth
 * mixer split kullanım, ya da redundant recording mixer kurulumları.
 * Submix cascade (mixer → mixer) v2'de planlı; v1'de tüm mixer master'lar
 * paralel rootMaster'a karışır.
 */
export interface DjMixer {
  /** Unique id — "mixer-default", "mixer-1", `mixer-${Math.random().toString(36).slice(2,8)}`. */
  id: string
  /** Display name — UI'da card header. Kullanıcı düzenleyebilir. */
  name: string
  /** Görsel hint — UI style variant. Audio'ya etkisi yok. */
  type: "club" | "battle" | "rotary"
  crossfader: DjCrossfader
  master: {
    gain: number
    limiterCeiling: number
    effects: DjEffect[]
  }
}

export interface DjDeck {
  /** Deck'e yüklü track — null = boş deck. */
  loadedMediaId: string | null
  /** Display label — orijinal dosya adı, kullanıcı override edebilir. */
  loadedLabel?: string
  /** Hesaplanan BPM (essentia.js cache'inden gelir, manuel override mümkün). */
  bpm: number | null
  /** İlk downbeat offset — saniye. Beat grid hizalama için. */
  beatgridOffset: number
  /** Pitch fader — semitones cinsinden değil oran (-0.16..+0.16 = ±16%
   *  tempo). 0 = nominal. UI'da hem oran hem BPM göstereceğiz. */
  pitch: number
  /** Sync deck'e bağlı mı (otomatik BPM eşleştirme aktif mi). */
  sync: boolean
  /** 3-band EQ — her biri -1..+1 (-1 = kill, +1 = +6dB boost). */
  eq: {
    low: number
    mid: number
    high: number
  }
  /** Combined HP/LP filter (CDJ tarzı tek knob). cutoff -1..+1 (negatif HP,
   *  pozitif LP, 0 = bypass), resonance 0..1. */
  filter: {
    cutoff: number
    resonance: number
  }
  /** Deck volume — 0..1. */
  gain: number
  /** Stereo pan — -1 (full left) ... 0 (center) ... +1 (full right).
   *  Default 0. Pioneer DJM-V10 "Balance" knob davranışı. */
  pan?: number
  /** Hot cue point'ler — 8 slot. */
  hotcues: DjHotcue[]
  /** Aktif loop bölgeleri — start/end saniye. */
  loops: DjLoop[]
  /** Per-deck queue (kullanıcının bu deck için sıraya koyduğu parçalar).
   *  Track end'inde otomatik bir sonraki çalar. Kullanıcı dnd-kit ile sıralar. */
  queue: DjQueueItem[]
  /** Tek FX slot — deck signal chain'inin sonunda. type="none" → bypass. */
  fx?: DjDeckFx
  /**
   * Deck'in route edildiği mixer'ın id'si. undefined = ilk mixer (default).
   * Multi-mixer kurulumda kullanıcı assignment'ı değiştirir; engine
   * channelGain'i hedef mixer'ın master'ına yeniden bağlar.
   */
  assignedMixerId?: string
}

export type DjDeckFxType =
  | "none"
  | "echo"
  | "reverb"
  | "phaser"
  | "bitcrusher"
  | "filterSweep"

export interface DjDeckFx {
  type: DjDeckFxType
  /** Dry/wet mix — 0 (full dry) .. 1 (full wet). */
  wet: number
}

export interface DjQueueItem {
  id: string
  mediaId: string
  /** Display label — orijinal dosya adı. */
  label: string
  /** Cache — BPM/key analizi (UI rozeti). */
  bpm: number | null
  key: string | null
}

export interface DjHotcue {
  /** Slot 1..8 (UI'da renkli pad). */
  slot: number
  /** Cue noktası — saniye. Pad'e basınca buradan başlar. */
  position: number
  /** Opsiyonel etiket — "Drop", "Verse", "Chorus". */
  label?: string
  /** Hex color. */
  color?: string
  /**
   * Loop hotcue — undefined ise normal cue (yalnızca jump). Defined ise
   * pad'e basınca jump + loop aktive olur (start=position, end=loopEnd).
   * CDJ-3000 "loop save to pad" pattern'i. Save action: aktif loop'u
   * `saveActiveLoopToPad(slot)` ile.
   */
  loopEnd?: number
}

export interface DjLoop {
  id: string
  start: number
  end: number
  /** Aktif çalınıyor mu (UI button). */
  enabled: boolean
}

export interface DjCrossfader {
  /** -1 (full A) ... +1 (full B), 0 = merkez (her iki deck %100). */
  position: number
  /** Karışım eğrisi — linear pure cross, smooth = constant-power, sharp = club EQ-style. */
  curve: "linear" | "smooth" | "sharp"
  /** A tarafına atanan deck id (Pioneer DJM "assign A switch"). Default "A". */
  aDeck: string
  /** B tarafına atanan deck id (Pioneer DJM "assign B switch"). Default "B". */
  bDeck: string
  /** Auto-mix — otomatik beat-aware geçiş. */
  autoMix: {
    enabled: boolean
    /** Geçiş süresi — saniye (default 16). */
    fadeSeconds: number
    /** Beat-sync — true ise geçiş kalan beats'e oturtulur (örn. 32-bar transition). */
    beatSync: boolean
    /** Tempo ramp — outgoing deck'i incoming'in BPM'ine doğru hızlandır/yavaşlat.
     *  Apple Music kalite geçiş için önerilen davranış. */
    tempoMatch: boolean
  }
}

export interface DjEffect {
  id: string
  /** Effect type — "echo", "reverb", "filter", "phaser", "flanger", "bitcrusher". */
  type: string
  enabled: boolean
  /** 0..1 dry/wet. */
  wet: number
  /** Type'a göre param map. */
  params: Record<string, number | string | boolean>
}

export interface DjPlaylistItem {
  id: string
  mediaId: string
  /** Display label. */
  label: string
  /** Cache — BPM/key analiz sonucu (UI'da renkli badge). */
  bpm: number | null
  key: string | null
  /** Eklenme zamanı — sıralama için. */
  addedAt: string
}

export interface DjRecording {
  id: string
  /** Saved kayıt — bucket'a upload edilen WAV/MP3 dosyasının Sentroy mediaId'si. */
  mediaId: string
  /** Display label (kullanıcı editlenebilir). */
  label: string
  /** Süre — saniye. */
  durationSec: number
  /** Format — "wav" / "mp3". */
  format: "wav" | "mp3"
  /** Recorded sample rate. */
  sampleRate: number
  recordedAt: string
}

// ─── Musician mode (v2 — placeholder) ────────────────────────────────────

/**
 * Musician/DAW project — tracks, clips, effects, automation.
 * **v2 epic. Schema şimdi yer-tutucu.** Editor şu an "Musician mode coming
 * soon" gösteriyor; v1'de bu shape ile project create edilmesin diye API
 * tarafında zorlama yok ama UI'da mod seçimi sadece DJ.
 */
export interface StudioMusicianProjectTree {
  mode: "musician"
  version: 1
  master: {
    volume: number
    pan: number
    effects: MusicianEffect[]
  }
  tracks: MusicianTrack[]
  buses?: MusicianBus[]
  automation?: MusicianAutomationLane[]
  /**
   * Transport loop bölgesi — `enabled=true` iken Tone.Transport `start`/`end`
   * arasında döner. Yoksa veya enabled=false ise normal lineer playback.
   */
  loopRegion?: {
    start: number
    end: number
    enabled: boolean
  }
  /**
   * Timeline marker'ları (cue point). Sıraya göre sortable, pure UI —
   * audio'ya etkisi yok ama transport seek + visual bookmark.
   * Color opsiyonel; track color palette'inden bir değer.
   */
  markers?: Array<{
    id: string
    time: number
    label: string
    color?: string
  }>
  /**
   * Track grupları (folder). Her grup birden çok track'i içerebilir; track
   * grup üyeliği `MusicianTrack.groupId` ile. Group order tree.groups dizi
   * sırasıyla. Collapsed grup track'leri UI'da gizler (audio etkilenmez —
   * grup pure UI organization).
   */
  groups?: Array<{
    id: string
    name: string
    color: string
    collapsed: boolean
  }>
}

export interface MusicianTrack {
  id: string
  name: string
  color: string
  muted: boolean
  soloed: boolean
  volume: number
  pan: number
  clips: MusicianClip[]
  effects: MusicianEffect[]
  sends?: { busId: string; level: number }[]
  /** Bağlı olduğu grup id'si (tree.groups[i].id). undefined = ungrouped. */
  groupId?: string
  /**
   * Track frozen ise FX chain offline render edilip tek bir sample olarak
   * cache'lenmiş demektir; playback sırasında orijinal clip'ler + FX chain
   * bypass edilir, sadece bu render kullanılır (CPU tasarrufu).
   *
   * Unfreeze ile orijinal data restore edilir (clips + effects schema'dan
   * silinmedi, sadece bypass'lanır). Aynı mediaId tekrar kullanılabilir.
   */
  frozen?: {
    /** Storage'da cache edilmiş frozen WAV'ın mediaId'si. */
    mediaId: string
    /** Frozen render uzunluğu (saniye). */
    duration: number
    /** ISO timestamp — kullanıcıya "Frozen 5min ago" göstermek için. */
    frozenAt: string
  }
}

export interface MusicianClip {
  id: string
  mediaId: string
  source: "user-bucket" | "sentroy-curated"
  startTime: number
  duration: number
  offset: number
  gain: number
  fadeIn: number
  fadeOut: number
  label?: string
  /**
   * Per-clip volume automation envelope. Time clip-relative (0..duration),
   * value gain multiplier (0..1.5). En az 2 nokta varsa engine bunları
   * `Tone.Param.linearRampToValueAtTime` ile schedule eder; yoksa veya
   * tek nokta varsa flat `gain` field'ı kullanılır (backward compat).
   *
   * UI: ClipBlock üzerinde yatay otomasyon çizgisi olarak render edilir;
   * click → add point, drag → move, double-click → remove.
   */
  gainPoints?: Array<{ time: number; value: number }>
  /**
   * Playback rate — 1 = normal, 0.5 = half speed (yarı tempo), 2 = double.
   * Tone.Player.playbackRate'a doğrudan bağlanır. Time-stretch için
   * (tempo değişir, pitch de değişir; orijinal sample re-pitch).
   *
   * NOT: Time-stretch sırasında clip'in görsel duration'ı schema'da aynı
   * kalır; gerçek play süresi sourceDuration / playbackRate olur. Render
   * sırasında effectiveDuration = duration * playbackRate (kullanıcı clip
   * uzunluğunu kontrol eder, sample kompresyon/genişleme adapter).
   */
  playbackRate?: number
  /**
   * Pitch shift — semitone cinsinden (-24..+24). Player → Tone.PitchShift
   * üzerinden geçirilir; sample tempo'su sabit, sadece pitch değişir.
   * 0 = bypass.
   */
  pitchShift?: number
  /**
   * Reverse Reverb — clip'in audio buffer'ı tersine çevrilip Freeverb tail
   * eklenerek offline render edilir; sonuç buffer player'a yüklenir. Vokal
   * swell / build-up etkisi.
   *
   * Render Engine-side cache'lenir (mediaId + decay + mix key'iyle); ilk
   * load'da expensive (~ N sn render), sonra anlık. Engine `scheduleClip`
   * içinde await edilir; render bitene kadar clip ses çıkarmaz.
   */
  reverseReverb?: {
    /** Reverb tail decay (saniye, 0.5..10). */
    decay: number
    /** Reverb wet mix (0..1). 0 = sadece reverse (verb yok). */
    mix: number
  }
}

export interface MusicianEffect {
  id: string
  type: string
  enabled: boolean
  wet?: number
  params: Record<string, number | string | boolean>
}

export interface MusicianBus {
  id: string
  name: string
  effects: MusicianEffect[]
  volume: number
  pan: number
}

export interface MusicianAutomationLane {
  id: string
  paramPath: string
  points: { time: number; value: number; curve?: "linear" | "exponential" }[]
}

// ─── Boş tree factory'leri ───────────────────────────────────────────────

export const DEFAULT_MIXER_ID = "mixer-default"

function defaultCrossfader(): DjCrossfader {
  return {
    position: 0,
    curve: "smooth",
    aDeck: "A",
    bDeck: "B",
    autoMix: {
      enabled: false,
      fadeSeconds: 16,
      beatSync: true,
      tempoMatch: true,
    },
  }
}

function defaultMaster(): { gain: number; limiterCeiling: number; effects: DjEffect[] } {
  return { gain: 1.0, limiterCeiling: -0.5, effects: [] }
}

export function emptyDjTree(): StudioDjProjectTree {
  const xf = defaultCrossfader()
  const master = defaultMaster()
  return {
    mode: "dj",
    version: 1,
    decks: {
      A: emptyDjDeck(),
      B: emptyDjDeck(),
      C: emptyDjDeck(),
      D: emptyDjDeck(),
    },
    layout: ["A", "B", DEFAULT_MIXER_ID, "C", "D"],
    mixers: [
      {
        id: DEFAULT_MIXER_ID,
        name: "Main",
        type: "club",
        crossfader: xf,
        master,
      },
    ],
    // Backward-compat aynaları — eski kod hâlâ tree.crossfader / tree.master
    // okuyabilir. Yeni kod mixers[0]'ı kaynak alır.
    crossfader: xf,
    master,
    playlist: [],
    recordings: [],
  }
}

/**
 * Legacy tree normalize — eski projelerde mixers[] / assignedMixerId yoktu.
 * Load sırasında çağrılır; mevcut crossfader + master'ı tek default
 * mixer'a sığdırır + her deck'i o mixer'a atar + "mixer" sentinel'ini
 * DEFAULT_MIXER_ID'ye günceller.
 *
 * Idempotent — zaten normalize edilmiş tree'yi tekrar çağırınca shape
 * değişmez.
 */
export function normalizeDjTree(tree: StudioDjProjectTree): StudioDjProjectTree {
  // Legacy 1: mixers eksik veya boş → tek default mixer kur.
  if (!Array.isArray(tree.mixers) || tree.mixers.length === 0) {
    tree.mixers = [
      {
        id: DEFAULT_MIXER_ID,
        name: "Main",
        type: "club",
        crossfader: tree.crossfader ?? defaultCrossfader(),
        master: tree.master ?? defaultMaster(),
      },
    ]
  }
  // Legacy 2: deprecated crossfader/master field'larını mixers[0] ile
  //   sync tut (eski okumalar bozulmasın).
  const first = tree.mixers[0]!
  tree.crossfader = first.crossfader
  tree.master = first.master
  // Legacy 3: layout'taki "mixer" sentinel → ilk mixer id'si.
  tree.layout = tree.layout.map((entry) =>
    entry === "mixer" ? first.id : entry,
  )
  // Legacy 4: her deck için assignedMixerId default = ilk mixer.
  for (const deckId of Object.keys(tree.decks)) {
    const deck = tree.decks[deckId]
    if (!deck) continue
    if (
      !deck.assignedMixerId ||
      !tree.mixers.some((m) => m.id === deck.assignedMixerId)
    ) {
      deck.assignedMixerId = first.id
    }
  }
  return tree
}

function emptyDjDeck(): DjDeck {
  return {
    loadedMediaId: null,
    bpm: null,
    beatgridOffset: 0,
    pitch: 0,
    sync: false,
    eq: { low: 0, mid: 0, high: 0 },
    filter: { cutoff: 0, resonance: 0.5 },
    gain: 0.85,
    hotcues: [],
    loops: [],
    queue: [],
    fx: { type: "none", wet: 0.3 },
  }
}

/**
 * Boş musician tree factory — 2 default track ("Audio 1", "Audio 2")
 * ile başlar; kullanıcı sonra ekler/siler.
 */
export function emptyMusicianTree(): StudioMusicianProjectTree {
  return {
    mode: "musician",
    version: 1,
    master: { volume: 1.0, pan: 0, effects: [] },
    tracks: [
      makeEmptyTrack("track-1", "Audio 1", "#ec4899"),
      makeEmptyTrack("track-2", "Audio 2", "#06b6d4"),
    ],
    buses: [],
    automation: [],
  }
}

function makeEmptyTrack(
  id: string,
  name: string,
  color: string,
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

// ─── Queries ─────────────────────────────────────────────────────────────

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByProject(
  projectId: string,
): Promise<StudioProjectData | null> {
  const c = await col()
  const doc = await c.findOne({ projectId })
  return doc ? toId(doc) : null
}

export async function upsert(
  projectId: string,
  tree: StudioProjectTree,
  expectedRevision?: number,
): Promise<
  { ok: true; data: StudioProjectData } | { ok: false; conflict: number }
> {
  const c = await col()
  const now = new Date()
  const existing = await c.findOne({ projectId })
  if (
    existing &&
    expectedRevision !== undefined &&
    existing.revision !== expectedRevision
  ) {
    return { ok: false, conflict: existing.revision }
  }
  const newRevision = existing ? existing.revision + 1 : 1
  const doc = {
    projectId,
    version: tree.version,
    tree,
    revision: newRevision,
    updatedAt: now,
  }
  if (existing) {
    await c.updateOne({ projectId }, { $set: doc })
    return { ok: true, data: { id: existing._id.toString(), ...doc } }
  }
  const result = await c.insertOne(doc)
  return { ok: true, data: { id: result.insertedId.toString(), ...doc } }
}

export async function removeByProject(projectId: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ projectId })
  return result.deletedCount > 0
}

export async function ensureIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ projectId: 1 }, { unique: true })
}

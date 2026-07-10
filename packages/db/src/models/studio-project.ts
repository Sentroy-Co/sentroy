import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "studio_projects"

/**
 * Sentroy Studio — DAW project metadata. Asıl proje ağacı (tracks, clips,
 * effects, automation) `studio_project_data` koleksiyonunda; burada
 * dashboard list query'lerini hızlandıran hafif alanlar.
 *
 * Per-company. Project'in audio asset'leri kullanıcının kendi storage
 * bucket'ında (`sentroy-studio` auto-provisioned). Quota: tek limit
 * storage limiti — proje sayısı / track sayısı kısıtsız.
 */
export type StudioProjectMode = "dj" | "musician"

/**
 * Karaoke playback render stilleri. Her stil farklı tipografi + animation
 * + active-line treatment. LyricsSidebar style picker'da 6 thumbnail.
 */
export type KaraokeStyle =
  | "classic"
  | "neon"
  | "typewriter"
  | "slide"
  | "vinyl"
  | "modern"

/**
 * Bir lyrics versiyonu — kullanıcı melodiye 1+ alternatif söz yazabilir
 * (verse iteration, dil varyantı, vs.). Editor sağ sidebar'da tabs ile.
 */
export interface LyricsVersion {
  id: string
  /** Kısa isim — "Draft v1", "Turkish", "Bridge alt", vb. */
  title: string
  /** Söz metni — multiline plain text. Markdown render edilmez şu an;
   *  satırlar olduğu gibi gösterilir (verse breaks kullanıcıya). */
  content: string
  /**
   * Karaoke timing — kullanıcı şarkı çalarken Space tap'le her kelimenin
   * başlangıç zamanını kaydeder. Tüm word'ler içerikten tokenize edilir
   * (whitespace split + boş line preserve), her word için optional startMs.
   * Henüz tap'lenmemiş word'ler `startMs === null`.
   *
   * SRT export line-grouped (lineIdx ile gruplar; cue = line, start = ilk
   * word.startMs, end = sonraki line'ın ilk word.startMs veya totalMs).
   */
  timing?: {
    /**
     * Line-level cue array. Her satır kendi {startMs, endMs} taşır —
     * Space hold pattern: keydown'da startMs, keyup'ta endMs. SRT export
     * direkt bu shape'i cue'lara map eder (overlap yok).
     */
    lines: Array<{
      text: string
      /** Source line index (asWritten chunking için orijinal paragraf
       *  satırına izleyici); perCount chunking'de basitçe sıralı. */
      sourceLineIdx: number
      startMs: number | null
      endMs: number | null
    }>
    /**
     * Chunking modu — kullanıcı sözleri SRT-friendly cue'lara nasıl böler:
     *   - "asWritten": content'teki satır kırılmaları korunur (paragraph)
     *   - "perCount": her N kelime bir cue (chunkSize)
     */
    chunkMode: "asWritten" | "perCount"
    /** perCount modu için N (1..10). asWritten modunda ignore. */
    chunkSize: number
    /** Karaoke playback rendering stili. */
    style: KaraokeStyle
    totalMs: number
    recordedAt: Date
  }
  createdAt: Date
  updatedAt: Date
}

export interface StudioProject {
  id: string
  companyId: string
  /** Proje modu — v1'de sadece "dj". "musician" v2 epic (full DAW). UI/editor
   *  bu field'a göre branch eder; aynı dashboard listesi her ikisini de gösterir. */
  mode: StudioProjectMode
  title: string
  /** Kullanıcının kendi adlandırdığı kısa açıklama / proje notu. */
  description: string | null
  /** Tempo — BPM. DJ mode'da master tempo (sync hedefi); Musician mode'da
   *  grid + snap için. Default 120. */
  bpm: number
  /** Beats per bar / note value (4/4, 3/4, 6/8 vb.) — [numerator, denom].
   *  DJ mode'da çoğunlukla 4/4; Musician mode'da değişebilir. */
  timeSignature: [number, number]
  /** Çıktı sample rate. 44100 / 48000 / 96000. */
  sampleRate: 44100 | 48000 | 96000
  /** Müzikal anahtar (C, C#, D, D#, E, F, F#, G, G#, A, A#, B). Opsiyonel —
   *  set edilmemişse UI'da "Key —". Composer'lara guide. */
  musicalKey?: string
  /** major / minor — gam türü. */
  musicalScale?: "major" | "minor"
  /**
   * Lyrics — birden çok alternatif söz versiyonu. Her version bağımsız
   * (title + content). Musician için: melodiye uyacak farklı söz drafts.
   * Editor sağ sidebar'da version tabs ile.
   */
  lyrics?: LyricsVersion[]
  /** Hesaplanan toplam proje uzunluğu — saniye. DJ mode'da kayıt + playlist
   *  süreleri toplamı; Musician mode'da en sondaki clip'in end time'ı. */
  duration: number
  /** Kapak görseli — Sentroy media ID (opsiyonel). Yoksa generated cover. */
  coverMediaId: string | null
  /** Proje görünür mi (paylaşıma) — şu an sadece flag, share Phase 12'de. */
  isPublic: boolean
  /** Share slug — public link için (`studio.sentroy.com/p/{slug}`). v2 epic. */
  shareSlug: string | null
  /** Kullanıcının silme aksiyonu — soft delete (90 gün sonra hard cleanup).
   *  Tasarımda undelete UX'i için reserved. */
  deletedAt: Date | null
  createdBy: string
  createdAt: Date
  /** Son save zamanı — auto-save her 3 saniyede touch ediliyor. */
  lastEditedAt: Date
  lastEditedBy: string
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findById(id: string): Promise<StudioProject | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id), deletedAt: null })
  return doc ? toId(doc) : null
}

export async function findByCompany(
  companyId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<StudioProject[]> {
  const c = await col()
  const filter: Record<string, unknown> = { companyId }
  if (!opts.includeDeleted) filter.deletedAt = null
  const docs = await c
    .find(filter)
    .sort({ lastEditedAt: -1 })
    .toArray()
  return docs.map(toId)
}

export async function create(input: {
  companyId: string
  mode?: StudioProjectMode
  title: string
  description?: string | null
  bpm?: number
  timeSignature?: [number, number]
  sampleRate?: 44100 | 48000 | 96000
  createdBy: string
}): Promise<StudioProject> {
  const c = await col()
  const now = new Date()
  const doc = {
    companyId: input.companyId,
    mode: input.mode ?? ("dj" as const),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    bpm: input.bpm ?? 120,
    timeSignature: input.timeSignature ?? ([4, 4] as [number, number]),
    sampleRate: input.sampleRate ?? (48000 as const),
    duration: 0,
    coverMediaId: null,
    isPublic: false,
    shareSlug: null,
    deletedAt: null,
    createdBy: input.createdBy,
    createdAt: now,
    lastEditedAt: now,
    lastEditedBy: input.createdBy,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<
      StudioProject,
      | "title"
      | "description"
      | "bpm"
      | "timeSignature"
      | "sampleRate"
      | "duration"
      | "coverMediaId"
      | "isPublic"
    >
  > & { lastEditedBy: string },
): Promise<StudioProject | null> {
  const c = await col()
  const now = new Date()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id), deletedAt: null },
    { $set: { ...patch, lastEditedAt: now } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

/**
 * Soft delete. Hard delete 90 gün sonra cron job ile (v2).
 * Aynı zamanda `studio_project_data` doc'unu da soft-mark eder.
 */
export async function softDelete(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { deletedAt: new Date() } },
  )
  return result.modifiedCount > 0
}

/** Auto-save touch — sadece lastEditedAt günceller, tree değişmez. */
export async function touch(
  id: string,
  userId: string,
): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { lastEditedAt: new Date(), lastEditedBy: userId } },
  )
}

export async function ensureIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, lastEditedAt: -1 })
  await c.createIndex({ companyId: 1, mode: 1, lastEditedAt: -1 })
  await c.createIndex({ deletedAt: 1 })
  // shareSlug — Phase 12'de public link için unique sparse
  await c.createIndex(
    { shareSlug: 1 },
    { unique: true, sparse: true },
  )
}

import { getDb } from "../client"
import { toId } from "./_helpers"

const COLLECTION = "studio_audio_analysis"

/**
 * Audio dosyası analiz cache'i — bir dosya birden çok projede kullanılabilir,
 * her açılışta tekrar BPM/key detect etmek pahalı. Browser-side essentia.js
 * sonuçlarını burada saklıyoruz; sonraki "import"larda hazır.
 *
 * Key = mediaId (Sentroy storage media). Bir mediaId silinince burası da
 * cleanup edilir (storage delete handler'ında).
 */
export interface StudioAudioAnalysis {
  id: string
  mediaId: string
  /** Kullanıcı bucket'ındaki dosya hash'i (sha-256, dosya değişirse cache invalidate). */
  fileHash: string | null
  /** Hesaplanan BPM (essentia.js BeatTrackerDegara). null = analiz fail. */
  bpm: number | null
  /** Beat pozisyonları — saniye. UI'da grid alignment için. */
  beats: number[]
  /** Müzikal key (C / C# / D / ...). */
  key: string | null
  /** Major / minor / unknown. */
  scale: "major" | "minor" | "unknown" | null
  /** Çalma süresi — saniye. */
  duration: number
  /** Compact peak data — waveform render için. Min/max her N sample'da bir.
   *  Format: Float32 base64. v1'de 256 sample/peak (≈90s @ 22kHz). */
  peaks: string | null
  /** Source sample rate. */
  sampleRate: number
  /** Kanal sayısı (1 mono / 2 stereo). */
  channels: number
  analyzedAt: Date
  /** Hangi engine analiz etti:
   *   - `essentia-js` — browser-side, kullanıcı in-flight upload yapıyorsa
   *   - `server-ffmpeg-autocorr` — storage-api-server upload zamanında
   *     ffmpeg + spectral-energy onset autocorrelation (varsayılan)
   *   - `python-librosa` / `manual` — rezerve. */
  engine:
    | "essentia-js"
    | "server-ffmpeg-autocorr"
    | "python-librosa"
    | "manual"
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByMedia(
  mediaId: string,
): Promise<StudioAudioAnalysis | null> {
  const c = await col()
  const doc = await c.findOne({ mediaId })
  return doc ? toId(doc) : null
}

export async function upsert(input: {
  mediaId: string
  fileHash?: string | null
  bpm: number | null
  beats: number[]
  key: string | null
  scale: "major" | "minor" | "unknown" | null
  duration: number
  peaks: string | null
  sampleRate: number
  channels: number
  engine: StudioAudioAnalysis["engine"]
}): Promise<StudioAudioAnalysis> {
  const c = await col()
  const now = new Date()
  const doc = {
    mediaId: input.mediaId,
    fileHash: input.fileHash ?? null,
    bpm: input.bpm,
    beats: input.beats,
    key: input.key,
    scale: input.scale,
    duration: input.duration,
    peaks: input.peaks,
    sampleRate: input.sampleRate,
    channels: input.channels,
    analyzedAt: now,
    engine: input.engine,
  }
  await c.updateOne(
    { mediaId: input.mediaId },
    { $set: doc },
    { upsert: true },
  )
  const saved = await c.findOne({ mediaId: input.mediaId })
  return toId(saved!)
}

export async function removeByMedia(mediaId: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ mediaId })
  return result.deletedCount > 0
}

export async function ensureIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ mediaId: 1 }, { unique: true })
}

/**
 * Audio clip peak downsample utility — Studio'da clip preview, master
 * timeline mini-waveform vb. yerlerde tek bir cache üzerinden çalışılır.
 *
 * Workflow:
 *   1. `getOrFetchClipPeaks(mediaId, url)` — fetch + decode + downsample.
 *      Aynı mediaId için ikinci çağrı cache'ten direkt döner.
 *   2. `peaksToBars(peaks, targetBars)` — render context'in genişliğine
 *      göre downsample edilmiş 0..1 amplitude array'i üretir.
 *   3. `aggregateTimelinePeaks` — multiple track + clip'i ortak bir
 *      timeline grid'ine projekte eder (master mini-waveform için).
 */

const PEAKS_N = 600
const CACHE = new Map<string, Float32Array>()
const PENDING = new Map<string, Promise<Float32Array>>()

export async function getOrFetchClipPeaks(
  mediaId: string,
  url: string,
): Promise<Float32Array> {
  const cached = CACHE.get(mediaId)
  if (cached) return cached
  const pending = PENDING.get(mediaId)
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
    const N = PEAKS_N
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
    CACHE.set(mediaId, peaks)
    PENDING.delete(mediaId)
    return peaks
  })().catch((err) => {
    PENDING.delete(mediaId)
    throw err
  })
  PENDING.set(mediaId, p)
  return p
}

export function peaksToBars(
  peaks: Float32Array | null,
  targetBars: number,
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

export interface AggregateClipInput {
  mediaId: string
  url: string
  /** Project timeline'da clip başlangıç (saniye). */
  startSec: number
  /** Clip duration (saniye). */
  durationSec: number
  /** Per-clip gain multiplier (varsa). */
  gain?: number
  /** Mute ise atla. */
  muted?: boolean
}

/**
 * Birden çok clip'in peak'lerini ortak bir N-bar grid'ine projekte eder
 * (max-merge). Hangi slot'ta hangi clip varsa o slot için aggregated[slot]
 * = max(aggregated[slot], clipPeakAtSlot * gain). Mute clip'ler atlanır.
 *
 * Tüm clip'ler için peak fetch paralel; cache hit'ler instant.
 */
export async function aggregateTimelinePeaks(
  clips: AggregateClipInput[],
  totalSec: number,
  targetBars: number,
): Promise<Float32Array> {
  const N = Math.max(1, targetBars)
  const out = new Float32Array(N)
  if (totalSec <= 0 || clips.length === 0) return out
  const secPerSlot = totalSec / N

  await Promise.all(
    clips
      .filter((c) => !c.muted && c.durationSec > 0)
      .map(async (c) => {
        try {
          const peaks = await getOrFetchClipPeaks(c.mediaId, c.url)
          const startSlot = Math.max(0, Math.floor(c.startSec / secPerSlot))
          const endSlot = Math.min(
            N,
            Math.ceil((c.startSec + c.durationSec) / secPerSlot),
          )
          const gain = c.gain ?? 1
          for (let s = startSlot; s < endSlot; s++) {
            const slotSec = s * secPerSlot
            const clipRelSec = slotSec - c.startSec
            const ratio = Math.max(
              0,
              Math.min(1, clipRelSec / c.durationSec),
            )
            const srcIdx = Math.min(
              peaks.length - 1,
              Math.floor(ratio * peaks.length),
            )
            const v = (peaks[srcIdx] ?? 0) * gain
            if (v > (out[s] ?? 0)) out[s] = v
          }
        } catch {
          // Bir clip fetch fail ederse diğerleri devam etsin (silent).
        }
      }),
  )

  return out
}

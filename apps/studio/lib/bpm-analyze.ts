"use client"

import { analyze, guess } from "web-audio-beat-detector"

/**
 * Audio BPM analiz helper — browser-only.
 *
 * `web-audio-beat-detector` AudioBuffer alır, autocorrelation ile BPM
 * tespit eder. Tipik ses için ±1 BPM doğruluk. Beats[] döndürmez —
 * onun yerine BPM + downbeat offset'ten generateBeats() ile üretilir.
 *
 * Async, ~100-500ms decoded buffer için. Hafif (50KB) — main thread'de
 * acceptable; pahalı bir dosya için Web Worker'a taşınabilir.
 *
 * Cache: backend `/api/companies/{slug}/studio/assets/{mediaId}/analysis`
 * endpoint'inde — analyzed media ID için BPM tekrar hesaplanmaz.
 */

let acRef: AudioContext | null = null
function getAc(): AudioContext {
  if (!acRef) {
    // Decode-only context — main app's Tone context'i ile çakışmasın
    const Ctor =
      (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    acRef = new Ctor()
  }
  return acRef
}

export interface BpmAnalysisResult {
  bpm: number
  /** Saniye cinsinden beat pozisyonları (downbeat = 0 varsayımı; user
   *  beatgridOffset ile shift edebilir). */
  beats: number[]
  duration: number
  sampleRate: number
  channels: number
}

export async function analyzeAudio(url: string): Promise<BpmAnalysisResult> {
  const ac = getAc()
  // CDN cross-origin fetch — credentials KULLANMA. Public `/f/:id`
  // endpoint'i mediaId-secret guard'lı; cookie iletmek gereksiz +
  // 'credentials: include' wildcard CORS header'ı ile çakışır
  // ("Access-Control-Allow-Origin: *" + credentials = browser reject).
  const buf = await (await fetch(url)).arrayBuffer()
  const audioBuf = await ac.decodeAudioData(buf.slice(0))

  let bpm: number
  try {
    bpm = await analyze(audioBuf)
  } catch {
    // Fallback — `guess` daha lenient (offset + tempo)
    try {
      const g = await guess(audioBuf)
      bpm = g.bpm
    } catch {
      bpm = 120 // safe default
    }
  }

  return {
    bpm: Math.round(bpm * 10) / 10,
    beats: generateBeats(bpm, 0, audioBuf.duration),
    duration: audioBuf.duration,
    sampleRate: audioBuf.sampleRate,
    channels: audioBuf.numberOfChannels,
  }
}

/**
 * BPM + offset + duration → beat timestamps (saniye).
 * Beat aralığı = 60 / bpm.
 */
export function generateBeats(
  bpm: number,
  offset: number,
  duration: number,
): number[] {
  if (bpm <= 0) return []
  const interval = 60 / bpm
  const beats: number[] = []
  for (let t = offset; t <= duration; t += interval) {
    if (t >= 0) beats.push(t)
  }
  return beats
}

/** Cache analiz sonucunu backend'e POST eder (idempotent upsert). */
export async function persistAnalysis(
  companySlug: string,
  mediaId: string,
  result: BpmAnalysisResult,
): Promise<void> {
  // Lokal (henüz cloud'a yüklenmemiş) dosyaların sunucuda asset kaydı yok —
  // analiz persist edilemez, sessiz geç. (media-url.isLocalMediaId ile aynı
  // önek kuralı; import cycle'ı önlemek için inline.)
  if (mediaId.startsWith("local-")) return
  try {
    await fetch(
      `/api/companies/${companySlug}/studio/assets/${mediaId}/analysis`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bpm: result.bpm,
          beats: result.beats,
          key: null,
          scale: null,
          duration: result.duration,
          peaks: null,
          sampleRate: result.sampleRate,
          channels: result.channels,
        }),
      },
    )
  } catch (err) {
    console.warn("[studio/bpm] persistAnalysis failed:", err)
  }
}

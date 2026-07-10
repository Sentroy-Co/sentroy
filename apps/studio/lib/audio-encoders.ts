"use client"

import lamejs from "@breezystack/lamejs"
import { Muxer as Mp4Muxer, ArrayBufferTarget } from "mp4-muxer"

/**
 * Sentroy Studio — audio format encoder'ları. Export pipeline:
 *   AudioBuffer (Tone.Offline render) → WAV / MP3 / M4A Blob
 *
 *   - WAV: PCM 16-bit, RIFF header — `musician-engine.ts:audioBufferToWavBlob`
 *     (zaten var, dep yok)
 *   - MP3: @breezystack/lamejs (CBR, default 192 kbps)
 *   - M4A: WebCodecs AudioEncoder + mp4-muxer (sadece modern Chromium-tabanlı
 *     tarayıcılarda destekli; isM4aSupported() ile pre-check)
 */

export type AudioFormat = "wav" | "mp3" | "m4a"

export interface EncodeOptions {
  /** kbps; varsayılan 192. WAV için ignore. */
  bitrate?: number
}

/**
 * AudioBuffer'ı 16-bit PCM WAV blob'a çevir. Stereo + mono destekler.
 * Tek dosyada `musician-engine.ts:audioBufferToWavBlob` ile aynı içerik;
 * burası encoder family'sinin parçası olarak da export ediyor (tek
 * import noktası iyi UX).
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numSamples = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)
  writeString(view, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, "WAVE")
  writeString(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, "data")
  view.setUint32(40, dataSize, true)
  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]![i] ?? 0))
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, int16, true)
      offset += 2
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" })
}

/**
 * AudioBuffer'ı MP3 blob'a encode et (lamejs, CBR).
 * Mono / stereo, 44.1/48 kHz desteği. Default 192 kbps.
 */
export function audioBufferToMp3Blob(
  buffer: AudioBuffer,
  options: EncodeOptions = {},
): Blob {
  const bitrate = options.bitrate ?? 192
  const numChannels = Math.min(2, buffer.numberOfChannels)
  const sampleRate = buffer.sampleRate
  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrate)
  // Float32 → Int16 conversion (lamejs Int16 bekliyor)
  const left = floatToInt16(buffer.getChannelData(0))
  const right =
    numChannels === 2
      ? floatToInt16(buffer.getChannelData(1))
      : undefined
  const sampleBlockSize = 1152
  const mp3Data: Uint8Array[] = []
  for (let i = 0; i < left.length; i += sampleBlockSize) {
    const leftChunk = left.subarray(i, i + sampleBlockSize)
    let mp3buf: Uint8Array
    if (right) {
      const rightChunk = right.subarray(i, i + sampleBlockSize)
      mp3buf = encoder.encodeBuffer(leftChunk, rightChunk)
    } else {
      mp3buf = encoder.encodeBuffer(leftChunk)
    }
    if (mp3buf.length > 0) mp3Data.push(mp3buf)
  }
  const tail = encoder.flush()
  if (tail.length > 0) mp3Data.push(tail)
  return new Blob(mp3Data as BlobPart[], { type: "audio/mpeg" })
}

/** WebCodecs AudioEncoder ile M4A (AAC) çıkış. */
export function isM4aSupported(): boolean {
  if (typeof window === "undefined") return false
  return typeof (window as { AudioEncoder?: unknown }).AudioEncoder !== "undefined"
}

/**
 * AudioBuffer'ı M4A (AAC-LC in MP4 container) blob'a encode et.
 * WebCodecs `AudioEncoder` + `mp4-muxer` ile streaming yapısı:
 *   1. AudioEncoder configure (codec: 'mp4a.40.2' = AAC-LC, mp4a obj-type 2)
 *   2. AudioData chunks → encode → mp4-muxer'a yaz
 *   3. encoder.flush() → muxer.finalize() → ArrayBuffer
 *
 * Modern Chromium-tabanlı tarayıcılarda destekli. isM4aSupported() ile
 * pre-check yapıp UI'da disabled gösterilmeli.
 */
export async function audioBufferToM4aBlob(
  buffer: AudioBuffer,
  options: EncodeOptions = {},
): Promise<Blob> {
  if (!isM4aSupported()) {
    throw new Error(
      "M4A export requires WebCodecs (Chrome/Edge/Opera modern versions)",
    )
  }
  const bitrate = (options.bitrate ?? 192) * 1000 // kbps → bps
  const numChannels = Math.min(2, buffer.numberOfChannels)
  const sampleRate = buffer.sampleRate

  const target = new ArrayBufferTarget()
  const muxer = new Mp4Muxer({
    target,
    fastStart: "in-memory",
    audio: {
      codec: "aac",
      numberOfChannels: numChannels,
      sampleRate,
    },
  })

  const W = window as unknown as {
    AudioEncoder: typeof AudioEncoder
    AudioData: typeof AudioData
  }

  return await new Promise<Blob>((resolve, reject) => {
    const encoder = new W.AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta)
      },
      error: reject,
    })
    encoder.configure({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels: numChannels,
      bitrate,
    })

    // PCM samples'i AudioData frame'lerine böl ve encode et.
    // Interleaved Float32 (planar yerine — bazı browser quirks için
    // copy with planar planView de OK; basit planar API kullanıyoruz).
    const frameSize = 1024
    const total = buffer.length
    for (let offset = 0; offset < total; offset += frameSize) {
      const len = Math.min(frameSize, total - offset)
      // Planar layout: tüm channel 1 data + tüm channel 2 data
      const planar = new Float32Array(len * numChannels)
      for (let c = 0; c < numChannels; c++) {
        const ch = buffer.getChannelData(c)
        for (let i = 0; i < len; i++) {
          planar[c * len + i] = ch[offset + i] ?? 0
        }
      }
      const audioData = new W.AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfChannels: numChannels,
        numberOfFrames: len,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: planar,
      })
      encoder.encode(audioData)
      audioData.close()
    }
    encoder
      .flush()
      .then(() => {
        muxer.finalize()
        resolve(new Blob([target.buffer], { type: "audio/mp4" }))
      })
      .catch(reject)
  })
}

/**
 * Format → MIME type + uzantı eşlemesi.
 */
export const FORMAT_META: Record<
  AudioFormat,
  { ext: string; mime: string; label: string; description: string }
> = {
  wav: {
    ext: "wav",
    mime: "audio/wav",
    label: "WAV",
    description: "16-bit PCM, uncompressed (büyük dosya)",
  },
  mp3: {
    ext: "mp3",
    mime: "audio/mpeg",
    label: "MP3",
    description: "192 kbps CBR, evrensel uyum",
  },
  m4a: {
    ext: "m4a",
    mime: "audio/mp4",
    label: "M4A",
    description: "AAC-LC 192 kbps, modern (Chrome/Edge)",
  },
}

/**
 * Tek noktadan AudioBuffer encode — caller format seçer, encoder bu
 * fonksiyonun içinde dispatch edilir.
 */
export async function encodeAudio(
  buffer: AudioBuffer,
  format: AudioFormat,
  options?: EncodeOptions,
): Promise<Blob> {
  switch (format) {
    case "wav":
      return audioBufferToWavBlob(buffer)
    case "mp3":
      return audioBufferToMp3Blob(buffer, options)
    case "m4a":
      return await audioBufferToM4aBlob(buffer, options)
    default: {
      const _exhaust: never = format
      throw new Error(`Unknown format: ${String(_exhaust)}`)
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

/**
 * Client-side PCM → WAV / MP3 encode yardımcıları. Audio Converter + Audio
 * Trimmer paylaşır. WAV manuel RIFF (lossless, dep yok); MP3 lamejs (lazy import,
 * chunk'lar arası yield ile UI donmaz).
 */

export function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

/** PCM kanalları → 16-bit RIFF/WAVE Blob. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numCh = channels.length
  const len = channels[0]!.length
  const dataLen = len * numCh * 2
  const buffer = new ArrayBuffer(44 + dataLen)
  const view = new DataView(buffer)
  writeStr(view, 0, "RIFF")
  view.setUint32(4, 36 + dataLen, true)
  writeStr(view, 8, "WAVE")
  writeStr(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numCh * 2, true)
  view.setUint16(32, numCh * 2, true)
  view.setUint16(34, 16, true)
  writeStr(view, 36, "data")
  view.setUint32(40, dataLen, true)
  let off = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!))
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([buffer], { type: "audio/wav" })
}

/** PCM → MP3 (lamejs, lazy). onProgress 0..1. */
export async function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  kbps: number,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs")
  const numCh = Math.min(channels.length, 2)
  const enc = new Mp3Encoder(numCh, sampleRate, kbps)
  const left = floatToInt16(channels[0]!)
  const right = numCh > 1 ? floatToInt16(channels[1]!) : undefined
  const blockSize = 1152
  const parts: Uint8Array[] = []
  const len = left.length
  let block = 0
  for (let i = 0; i < len; i += blockSize) {
    const l = left.subarray(i, i + blockSize)
    const buf =
      right !== undefined ? enc.encodeBuffer(l, right.subarray(i, i + blockSize)) : enc.encodeBuffer(l)
    if (buf.length > 0) parts.push(new Uint8Array(buf))
    if (++block % 64 === 0) {
      onProgress?.(i / len)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  const end = enc.flush()
  if (end.length > 0) parts.push(new Uint8Array(end))
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" })
}

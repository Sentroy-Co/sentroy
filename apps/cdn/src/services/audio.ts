import { spawn } from 'child_process'

/**
 * Audio analysis service — runs at upload time so the consuming app
 * (apps/studio DJ editor) can render BPM, duration, and key info
 * directly from the media metadata without a per-track in-browser
 * decode pass.
 *
 * Pipeline:
 *   1. ffmpeg decodes the arbitrary input container into mono 22050 Hz
 *      16-bit signed little-endian PCM on stdout. We pick 22050 Hz
 *      because Nyquist comfortably covers the kick/snare/hat onset band
 *      we autocorrelate against, and the smaller buffer halves analysis
 *      time vs 44.1 kHz with no measurable BPM accuracy loss.
 *   2. Onset envelope — frame the PCM (1024 samples, hop 512), compute
 *      per-frame RMS, then positive RMS deltas form the onset signal
 *      (basic spectral-energy onset detector; cheap and surprisingly
 *      robust for tempo-stable electronic music).
 *   3. Autocorrelation over the onset signal in the lag range that
 *      covers 60–200 BPM; pick the peak lag → BPM.
 *   4. Octave-fold into [70, 180] — the most common DJ working range.
 *
 * No native deps beyond ffmpeg (already on the Dockerfile for video).
 */

export interface AudioAnalysis {
  /** Track duration in seconds (from ffmpeg sample count). */
  duration: number
  /** Detected BPM, octave-folded into [70, 180]. null if onset signal too sparse. */
  bpm: number | null
  /** Decoded sample rate we analyzed at (always 22050 Hz). */
  sampleRate: number
  /** Source channel count (probed via ffprobe; informational). */
  channels: number
}

const ANALYSIS_SAMPLE_RATE = 22050
const FRAME_SIZE = 1024
const HOP_SIZE = 512

/**
 * Maximum input bytes we analyze. Tracks longer than ~30 min get
 * truncated to the first ~20 MB of decoded PCM (≈ 7 min) — BPM is a
 * stable global property so a representative window is sufficient and
 * we don't want to OOM the worker on multi-hour DJ sets uploaded to
 * the library.
 */
const MAX_ANALYSIS_BYTES = 20 * 1024 * 1024 // ≈ 7.5 min mono 22kHz 16-bit

export async function analyzeAudio(buffer: Buffer): Promise<AudioAnalysis> {
  const channels = await probeChannels(buffer).catch(() => 2)

  const pcm = await decodeToMonoPcm(buffer)
  // pcm: Int16 little-endian. Convert to Float32 [-1, 1] for analysis.
  const samples = new Float32Array(pcm.length / 2)
  for (let i = 0; i < samples.length; i++) {
    const lo = pcm[i * 2]
    const hi = pcm[i * 2 + 1]
    const int16 = (hi << 8) | lo
    const signed = int16 > 0x7fff ? int16 - 0x10000 : int16
    samples[i] = signed / 32768
  }

  const duration = samples.length / ANALYSIS_SAMPLE_RATE
  const bpm = detectBpm(samples)
  return {
    duration,
    bpm,
    sampleRate: ANALYSIS_SAMPLE_RATE,
    channels,
  }
}

function decodeToMonoPcm(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(ANALYSIS_SAMPLE_RATE),
        '-f',
        's16le',
        '-acodec',
        'pcm_s16le',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )

    const chunks: Buffer[] = []
    let total = 0
    let killed = false

    ff.stdout.on('data', (chunk: Buffer) => {
      if (killed) return
      total += chunk.length
      if (total > MAX_ANALYSIS_BYTES) {
        const remaining = MAX_ANALYSIS_BYTES - (total - chunk.length)
        if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
        killed = true
        try {
          ff.kill('SIGTERM')
        } catch {}
      } else {
        chunks.push(chunk)
      }
    })

    let stderrBuf = ''
    ff.stderr.on('data', (d: Buffer) => {
      stderrBuf += d.toString()
    })

    ff.on('error', reject)
    ff.on('close', (code) => {
      if (chunks.length === 0) {
        reject(
          new Error(
            `ffmpeg decode failed${code !== null ? ` (exit ${code})` : ''}: ${stderrBuf.slice(-200)}`,
          ),
        )
        return
      }
      resolve(Buffer.concat(chunks))
    })

    ff.stdin.on('error', () => {
      /* broken pipe when we kill mid-stream — expected */
    })
    ff.stdin.write(input)
    ff.stdin.end()
  })
}

function probeChannels(input: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const fp = spawn(
      'ffprobe',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=channels',
        '-of',
        'csv=p=0',
        'pipe:0',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )

    let out = ''
    fp.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    fp.on('error', reject)
    fp.on('close', () => {
      const n = parseInt(out.trim(), 10)
      resolve(Number.isFinite(n) && n > 0 ? n : 2)
    })
    fp.stdin.on('error', () => {})
    fp.stdin.write(input)
    fp.stdin.end()
  })
}

/**
 * Onset-flux autocorrelation BPM detector.
 *
 * Returns null if the onset envelope is too quiet to extract a reliable
 * peak (silent / ambient track without rhythmic content).
 */
function detectBpm(samples: Float32Array): number | null {
  const totalFrames = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE)
  if (totalFrames < 64) return null

  // Per-frame RMS
  const rms = new Float32Array(totalFrames)
  for (let f = 0; f < totalFrames; f++) {
    const start = f * HOP_SIZE
    let sum = 0
    for (let i = 0; i < FRAME_SIZE; i++) {
      const s = samples[start + i]
      sum += s * s
    }
    rms[f] = Math.sqrt(sum / FRAME_SIZE)
  }

  // Spectral-energy onset (positive RMS delta)
  const onset = new Float32Array(totalFrames)
  for (let f = 1; f < totalFrames; f++) {
    const d = rms[f] - rms[f - 1]
    onset[f] = d > 0 ? d : 0
  }

  // Normalize — autocorrelation against arbitrary scale OK, but
  // mean-center improves the peak ratio.
  let mean = 0
  for (let i = 0; i < totalFrames; i++) mean += onset[i]
  mean /= totalFrames
  if (mean < 1e-6) return null
  for (let i = 0; i < totalFrames; i++) onset[i] = onset[i] - mean

  // Autocorrelation lag range — convert BPM to frame lag.
  //   frame_sec = HOP_SIZE / SR  → 512 / 22050 ≈ 23.2 ms
  //   60 BPM = 1.0 s = 43 frames
  //   200 BPM = 0.3 s = 13 frames
  const frameSec = HOP_SIZE / ANALYSIS_SAMPLE_RATE
  const minLag = Math.max(1, Math.floor(60 / (200 * frameSec)))
  const maxLag = Math.min(
    totalFrames - 1,
    Math.floor(60 / (60 * frameSec)),
  )

  let bestLag = -1
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    const limit = totalFrames - lag
    for (let i = 0; i < limit; i++) {
      sum += onset[i] * onset[i + lag]
    }
    if (sum > bestScore) {
      bestScore = sum
      bestLag = lag
    }
  }

  if (bestLag <= 0 || bestScore <= 0) return null

  let bpm = 60 / (bestLag * frameSec)
  // Octave fold into [70, 180] — the practical DJ working range. A
  // detector that locks onto the half-time (1/2 BPM) or double-time
  // (2× BPM) gets folded back here, which gives way more usable
  // numbers than the raw lag for sync/mix work.
  while (bpm < 70) bpm *= 2
  while (bpm > 180) bpm /= 2
  return Math.round(bpm * 10) / 10
}

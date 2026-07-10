/**
 * Video transcode pipeline. The CDN owns the variant ladder so every
 * consumer hits the same set of qualities — currently 144p / 480p /
 * 720p / 1080p, mirroring YouTube's lower tiers without going past
 * the 1080p budget that fits the typical Sentroy upload limit.
 *
 * Two distinct entry points:
 *   - `transcodeVideoSingle` — light single-pass H.264 compression at
 *     the source resolution. Fast, cheap; the upload route uses this
 *     when the caller asks for the default "compress only" path.
 *   - `generateVideoVariants` — the full ladder. Each rung re-encodes
 *     the source down to its target height. Sequential to keep peak
 *     memory + ffmpeg fork count predictable on the storage host.
 *
 * `ffmpeg` is invoked via temporary files on disk because mp4 with
 * the `+faststart` mux flag needs a seekable output — piping to
 * stdout would either drop faststart or fall back to a fragmented
 * mp4 that some browsers don't seek cleanly.
 */

import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { writeFile, unlink, readFile } from 'fs/promises'
import path from 'path'
import { uploadToS3 } from './s3'
import type { IVideoVariant, IVideoMeta } from '../models/Media'

/** Heights served from the variant ladder, ascending. Source heights
 *  smaller than the smallest rung skip ladder generation entirely. */
export const VIDEO_HEIGHT_LADDER = [144, 480, 720, 1080] as const
export type VideoLadderHeight = (typeof VIDEO_HEIGHT_LADDER)[number]

/**
 * Default x264 quality (CRF). Lower is better; 23 is broadcast,
 * 28 is "noticeably smaller, still acceptable". 28 trims ~50% off
 * the source bitrate for the transparency we need on a CDN.
 */
const DEFAULT_CRF = 28

/** Per-tier audio bitrate. Tighter on the small ladders since the
 *  user is presumably on a thin connection if they pick 144p/480p. */
function audioBitrateFor(height: number): string {
  if (height <= 240) return '64k'
  if (height <= 480) return '96k'
  return '128k'
}

interface TranscodeOptions {
  /** x264 CRF override. Default 28. */
  crf?: number
  /** Skip downscale and just re-encode at source resolution. Useful
   *  for the "single-pass compress" code path. */
  preserveResolution?: boolean
  /** Encoder preset — bigger = slower but smaller file. `fast` is the
   *  sweet spot for upload-time use. */
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium'
}

/**
 * Encode `source` to mp4 at the requested height. Returns the
 * encoded buffer. Caller is responsible for uploading + cleanup of
 * the buffer's lifetime.
 */
async function transcodeOne(
  source: Buffer,
  targetHeight: number,
  opts: TranscodeOptions = {},
): Promise<Buffer> {
  const inPath = await writeTempFile(source, 'in', 'bin')
  const outPath = tempPath('out', 'mp4')
  try {
    const args = [
      '-y',
      '-i', inPath,
    ]
    if (!opts.preserveResolution) {
      // `-2:H` keeps the height fixed and rounds the width to the
      // nearest even number — yuv420p (the default for browser-
      // compatible H.264) requires even dimensions.
      args.push('-vf', `scale=-2:${targetHeight}`)
    }
    args.push(
      '-c:v', 'libx264',
      '-preset', opts.preset ?? 'fast',
      '-crf', String(opts.crf ?? DEFAULT_CRF),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', audioBitrateFor(targetHeight),
      '-movflags', '+faststart',
      '-loglevel', 'error',
      outPath,
    )
    await runFfmpeg(args)
    return await readFile(outPath)
  } finally {
    await Promise.allSettled([unlink(inPath), unlink(outPath)])
  }
}

/**
 * Probe the source for dimensions + duration. Falls back to zeros
 * when ffprobe has nothing to say (extremely short clips, broken
 * containers) — caller should treat zero dimensions as "skip ladder
 * generation" rather than an error.
 */
export async function probeVideo(
  source: Buffer,
): Promise<{ width: number; height: number; duration: number }> {
  const inPath = await writeTempFile(source, 'probe', 'bin')
  try {
    const out = await runProcess('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1',
      inPath,
    ])
    const text = out.toString('utf-8')
    const w = /width=(\d+)/.exec(text)?.[1]
    const h = /height=(\d+)/.exec(text)?.[1]
    const d = /duration=([\d.]+)/.exec(text)?.[1]
    return {
      width: w ? Number(w) : 0,
      height: h ? Number(h) : 0,
      duration: d ? Number(d) : 0,
    }
  } catch (err) {
    console.warn(
      '[video] probe failed:',
      err instanceof Error ? err.message : err,
    )
    return { width: 0, height: 0, duration: 0 }
  } finally {
    await unlink(inPath).catch(() => {})
  }
}

/**
 * Light single-pass compression — re-encode at the source resolution
 * with a CRF target. Drops typical phone/screen-record uploads by
 * 30–60% with no visual hit. Returns the new buffer; caller is
 * expected to upload it as the *original* (replacing the raw upload).
 */
export async function transcodeVideoSingle(
  source: Buffer,
  opts: TranscodeOptions = {},
): Promise<Buffer> {
  // 0 height means "preserve" — the scale filter is skipped via
  // `preserveResolution`. The number is unused beyond that.
  return transcodeOne(source, 0, { ...opts, preserveResolution: true })
}

/**
 * Generate the multi-quality ladder for a video upload. Skips rungs
 * that would up-scale the source (a 720p source produces 144 / 480 /
 * 720 but not 1080). Each variant is uploaded to S3 immediately so a
 * fail in tier N still leaves tiers 1..N-1 intact.
 *
 * `originalKey` is the source S3 key — variants land next to it as
 * `{base}_{height}p.mp4` so deletion of the source doc can sweep
 * them with the same fileName-collection pattern as image
 * thumbnails.
 *
 * Returns the IVideoMeta payload to persist on the Media doc, OR
 * null if the source is so small / unparseable that no ladder
 * makes sense (caller should fall back to original-only).
 */
export async function generateVideoVariants(
  source: Buffer,
  originalKey: string,
  isPublic: boolean,
  opts: {
    ladder?: readonly number[]
    crf?: number
    /** Fired after each rung uploads to S3. Used by the async
     *  pipeline to stream variant rows back into the Media doc so
     *  the UI can render new qualities as they land instead of
     *  waiting for the whole ladder. */
    onVariantReady?: (variant: IVideoVariant) => void | Promise<void>
  } = {},
): Promise<IVideoMeta | null> {
  const probe = await probeVideo(source)
  if (probe.height === 0 || probe.width === 0) return null

  const ladder = opts.ladder ?? VIDEO_HEIGHT_LADDER
  // Only emit rungs at or below the source height. Up-scaling wastes
  // bytes for no quality gain. We allow the highest matching rung to
  // *equal* source height so 1080p sources do get a clean 1080p
  // variant (re-encoded with our CRF, often smaller than the raw
  // upload).
  const targets = ladder.filter((h) => h <= probe.height)
  if (targets.length === 0) return null

  const dotIdx = originalKey.lastIndexOf('.')
  const basePath = dotIdx > -1 ? originalKey.substring(0, dotIdx) : originalKey

  const variants: IVideoVariant[] = []

  // Sequential — parallel ffmpeg processes balloon RAM/CPU on a
  // small storage host. The ladder is short (≤4) so latency is
  // bounded by the longest tier anyway.
  for (const h of targets) {
    try {
      const buffer = await transcodeOne(source, h, { crf: opts.crf })
      const key = `${basePath}_${h}p.mp4`
      await uploadToS3(key, buffer, 'video/mp4', isPublic)
      // Width derives from the source aspect ratio scaled to `h`,
      // rounded to the next even integer (yuv420p constraint).
      const ratio = probe.width / probe.height
      const scaledWidth = Math.round(h * ratio)
      const evenWidth = scaledWidth % 2 === 0 ? scaledWidth : scaledWidth + 1
      const variant: IVideoVariant = {
        height: h,
        width: evenWidth,
        fileName: key,
        size: buffer.length,
      }
      variants.push(variant)
      if (opts.onVariantReady) {
        try {
          await opts.onVariantReady(variant)
        } catch (cbErr) {
          // Stream callback failure shouldn't kill the rest of the
          // ladder — log and continue with the in-memory list, the
          // final DB write at the end will reconcile.
          console.warn(
            '[video] onVariantReady callback failed:',
            cbErr instanceof Error ? cbErr.message : cbErr,
          )
        }
      }
    } catch (err) {
      console.warn(
        `[video] variant ${h}p failed for ${originalKey}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return {
    width: probe.width,
    height: probe.height,
    duration: probe.duration,
    variants,
  }
}

// ── ffmpeg / ffprobe shell helpers ─────────────────────────────────────

function tempPath(prefix: string, ext: string): string {
  return path.join(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
  )
}

async function writeTempFile(
  buffer: Buffer,
  prefix: string,
  ext: string,
): Promise<string> {
  const p = tempPath(prefix, ext)
  await writeFile(p, buffer)
  return p
}

async function runFfmpeg(args: string[]): Promise<void> {
  await runProcess('ffmpeg', args)
}

function runProcess(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    proc.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    // Absorb stream-level errors — an unhandled 'error' on any of the
    // child's pipes would crash the Node process via the default
    // EventEmitter behaviour. We let the `close` handler decide the
    // final outcome from the exit code.
    proc.stdout.on('error', () => {})
    proc.stderr.on('error', () => {})
    proc.on('error', (e) =>
      settle(() => reject(new Error(`${cmd} spawn failed: ${e.message}`))),
    )
    proc.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(err).toString('utf-8').slice(0, 800)
        settle(() =>
          reject(
            new Error(`${cmd} exited ${code}: ${stderr || 'no stderr'}`),
          ),
        )
        return
      }
      settle(() => resolve(Buffer.concat(out)))
    })
  })
}

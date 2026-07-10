import sharp from 'sharp'
import { spawn } from 'child_process'

/**
 * On-the-fly file format conversion. Sonuçlar S3'e yazılmaz; her istek
 * source buffer'ı transform edip stream eder. Cache stratejisi yok (Faz 1) —
 * deterministik ETag ile CDN edge cache'e bırakıyoruz.
 *
 * Desteklenen yollar:
 *   image/* → jpg | png | webp | avif       (sharp pipeline)
 *   application/pdf → png (page=N)          (pdftoppm shell binary)
 *   video/* → png (first frame)             (ffmpeg shell binary)
 *
 * Backend bağımlılıkları:
 *   - sharp: package.json zaten var
 *   - pdftoppm: Dockerfile `apk add poppler-utils`
 *   - ffmpeg:  Dockerfile `apk add ffmpeg`
 *
 * Hata durumunda throw — caller HTTP 502/415 döner.
 */

export type ImageTargetFormat = 'jpg' | 'jpeg' | 'png' | 'webp' | 'avif'

export interface ConvertResult {
  buffer: Buffer
  mimeType: string
  /** Yeni uzantı — Content-Disposition filename için. */
  ext: string
}

const IMAGE_FORMAT_TO_MIME: Record<ImageTargetFormat, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
}

/** Sharp pipeline ile image format conversion. Quality default 85. */
export async function convertImage(
  source: Buffer,
  format: ImageTargetFormat,
  quality = 85,
): Promise<ConvertResult> {
  const q = Math.min(95, Math.max(1, quality))
  let pipeline = sharp(source).rotate() // EXIF auto-orient
  switch (format) {
    case 'jpg':
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: q, mozjpeg: true })
      break
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 9, palette: false })
      break
    case 'webp':
      pipeline = pipeline.webp({ quality: q })
      break
    case 'avif':
      pipeline = pipeline.avif({ quality: q })
      break
  }
  const buffer = await pipeline.toBuffer()
  const ext = format === 'jpeg' ? 'jpg' : format
  return { buffer, mimeType: IMAGE_FORMAT_TO_MIME[format], ext }
}

/**
 * On-the-fly resize — pre-generated variant S3 objesi yoksa (özellikle
 * edrive-cdn'den migrate edilmiş, DB'de ladder kaydı olan ama S3'te dosyası
 * olmayan media) orijinali istenen genişliğe küçültüp webp döner. `file.ts`
 * bunu read-through cache'ler → ilk istekten sonra statik servis. `fit:inside`
 * + `withoutEnlargement` → oran korunur, orijinalden büyütmez.
 */
export async function resizeImage(
  source: Buffer,
  width: number,
  quality = 80,
): Promise<ConvertResult> {
  const q = Math.min(95, Math.max(1, quality))
  const buffer = await sharp(source)
    .rotate()
    .resize(width, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: q })
    .toBuffer()
  return { buffer, mimeType: 'image/webp', ext: 'webp' }
}

/**
 * PDF dosyasının N. sayfasını PNG'ye çevirir. `pdftoppm` stdin'i destekler:
 *   pdftoppm -f N -l N -png -r 150 -      (- = stdin/stdout)
 *
 * Resolution 150 DPI (default). Daha yüksek kullanıcı ister, `?dpi=` ile
 * kontrol edilebilir; şu an sabit.
 */
export async function convertPdfToPng(
  source: Buffer,
  page = 1,
): Promise<ConvertResult> {
  const buffer = await runShell(
    'pdftoppm',
    ['-f', String(page), '-l', String(page), '-png', '-r', '150', '-'],
    source,
  )
  return { buffer, mimeType: 'image/png', ext: 'png' }
}

/**
 * Video dosyasının ilk frame'ini PNG'ye çevirir. ffmpeg pipe:0 (stdin) →
 * pipe:1 (stdout) ile geçici dosya yazmadan. `-ss 0` ilk frame'i seçer,
 * `-frames:v 1` tek frame, `-f image2pipe -vcodec png` PNG output.
 *
 * NOT: bazı container'larda (mkv, webm) ilk frame siyah olabilir; user
 * `?at=2` (saniye) param'ı isterse ileride genişletilebilir.
 */
export async function convertVideoToFirstFrame(
  source: Buffer,
): Promise<ConvertResult> {
  const buffer = await runShell(
    'ffmpeg',
    [
      '-i', 'pipe:0',
      '-ss', '0',
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-loglevel', 'error',
      'pipe:1',
    ],
    source,
  )
  return { buffer, mimeType: 'image/png', ext: 'png' }
}

/**
 * Spawn helper: stdin'e source buffer yazar, stdout'tan output toplar.
 * stderr non-empty + non-zero exit → reject. Büyük PDF/video için memory
 * concern: tüm output buffered (Streaming response yapılmıyor şu an;
 * ileride large file için res.pipe(stdout) optimizasyonu yapılabilir).
 */
function runShell(
  cmd: string,
  args: string[],
  stdin: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
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

    // stdin/stdout/stderr error listeners — without them an EPIPE on
    // `proc.stdin.write` (child died early) crashes the whole node
    // process via `unhandled "error" event`. We absorb them here and
    // let the `close` handler decide the final outcome from the exit
    // code; if the child crashed before reading our payload `close`
    // will still fire with a non-zero code and reject cleanly.
    proc.stdin.on('error', (e) => {
      // EPIPE on stdin is normal when the child has already finished
      // (e.g. ffmpeg short-circuits on a malformed input). Swallow
      // and let `close` settle the promise.
      if ((e as NodeJS.ErrnoException).code === 'EPIPE') return
      settle(() => reject(new Error(`${cmd} stdin error: ${e.message}`)))
    })
    proc.stdout.on('error', () => {
      /* same — close handler reports the real cause */
    })
    proc.stderr.on('error', () => {
      /* same */
    })

    proc.on('error', (e) =>
      settle(() => reject(new Error(`${cmd} spawn failed: ${e.message}`))),
    )
    proc.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(err).toString('utf-8').slice(0, 500)
        settle(() =>
          reject(new Error(`${cmd} exited ${code}: ${stderr || 'no stderr'}`)),
        )
        return
      }
      settle(() => resolve(Buffer.concat(out)))
    })

    // Write+end via callback so an in-flight EPIPE doesn't escape via
    // an uncaught synchronous throw on a backed-up pipe.
    proc.stdin.write(stdin, (writeErr) => {
      if (writeErr) {
        // Already handled by the stdin 'error' listener above; this
        // branch only fires when write fails synchronously and the
        // listener hasn't run yet. No-op — close will report.
        return
      }
      proc.stdin.end()
    })
  })
}

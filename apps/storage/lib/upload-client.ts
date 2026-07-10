/**
 * Browser tarafı upload helper'ları. `fetch` API progress event vermediği
 * için XHR kullanılıyor — dosya gönderiminin ilerleyişini UI'da yüzde
 * olarak göstermek için gerekli.
 */

/**
 * Tek bir dosyanın yüklenebilecek maksimum byte boyutu. stateless-cdn-server
 * `MAX_UPLOAD_BYTES` env'i ile aynı değeri kullanır (50 MB default). Bu sabit
 * UI'da pre-validate için, server `route.ts` POST handler'ında erken-fail
 * için, ve FileUploader'a `maxSize` prop'u olarak geçirilir. CDN env'i
 * değişirse buradaki sabiti de güncellemek gerek; mismatch halinde server
 * yine 413 ile reject eder ve UI generic toast gösterir.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function formatUploadBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export interface UploadTask {
  id: string
  file: File
  progress: number
  status: "queued" | "uploading" | "done" | "error"
  error?: string
}

export interface UploadProgressEvent {
  id: string
  progress: number
}

export interface UploadResult {
  id: string
  media: unknown
}

/**
 * Tek bir dosyayı XHR üzerinden yükler. `onProgress` yüklenen byte / toplam
 * byte oranını iletir (0..1). XHR bildirmezse `undefined` döner ve UI
 * "indeterminate" göstermelidir.
 */
export function uploadFileWithProgress(
  url: string,
  file: File,
  opts: {
    folder?: string
    isPublic?: boolean
    alt?: string
    caption?: string
    tags?: string[]
    /** Light single-pass video re-encode at the source resolution.
     *  Default off; ignored for non-video files. */
    compressVideo?: boolean
    /** Multi-quality video ladder (144/480/720/1080). Implies
     *  `compressVideo`. Slow — UI should warn the user. Default off;
     *  ignored for non-video files. */
    transcodeVideo?: boolean
    onProgress?: (progress: number) => void
    signal?: AbortSignal
  } = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.responseType = "json"

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return
      opts.onProgress?.(e.loaded / e.total)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const body = xhr.response
        resolve(body?.data ?? body)
      } else {
        const msg = xhr.response?.error || `HTTP ${xhr.status}`
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error("Network error"))
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"))

    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true })

    const form = new FormData()
    form.append("file", file)
    if (opts.folder) form.append("folder", opts.folder)
    if (opts.isPublic !== undefined) {
      form.append("public", opts.isPublic ? "true" : "false")
    }
    if (opts.alt) form.append("alt", opts.alt)
    if (opts.caption) form.append("caption", opts.caption)
    if (opts.tags?.length) form.append("tags", opts.tags.join(","))
    if (opts.compressVideo) form.append("compressVideo", "true")
    if (opts.transcodeVideo) form.append("transcodeVideo", "true")

    xhr.send(form)
  })
}

/**
 * N-concurrent havuz. `items` uzunluğu ne olursa olsun aynı anda en fazla
 * `concurrency` task çalışır; her task bitmeden yenisi kuyruktan alınmaz.
 * Hata durumunda diğer task'lar devam eder — task bazlı hata `worker`
 * içinde yakalanır ve sonuçlar `settled` olarak döner.
 */
export async function runWithPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: Error }>> {
  const results = new Array<{ ok: true; value: R } | { ok: false; error: Error }>(
    items.length,
  )
  let cursor = 0

  async function runOne() {
    while (cursor < items.length) {
      const i = cursor++
      try {
        const value = await worker(items[i]!, i)
        results[i] = { ok: true, value }
      } catch (err) {
        results[i] = {
          ok: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }
      }
    }
  }

  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    runOne,
  )
  await Promise.all(runners)
  return results
}

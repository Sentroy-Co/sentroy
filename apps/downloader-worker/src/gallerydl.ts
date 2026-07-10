import { spawn } from "node:child_process"
import { mkdir, readdir } from "node:fs/promises"
import path from "node:path"

/**
 * gallery-dl sarmalayıcı — Instagram foto/carousel/profil-resmi içindir
 * (yt-dlp avatar indiremez, carousel'i yarım bırakır). yt-dlp ile aynı
 * spawn(shell:false) + argüman dizisi güvenliği. Cookie/proxy env'den.
 */

const GALLERYDL_BIN = process.env.GALLERYDL_BIN || "gallery-dl"
const PROC_TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS || "300000")

function galleryArgs(): string[] {
  const a: string[] = ["--no-colors"]
  // Instagram cookie (varsa) — proxy-first; cookie opsiyonel.
  if (process.env.INSTAGRAM_COOKIES_FILE) {
    a.push("--cookies", process.env.INSTAGRAM_COOKIES_FILE)
  }
  if (process.env.YTDLP_PROXY) {
    a.push("--proxy", process.env.YTDLP_PROXY)
  }
  return a
}

interface ProcResult {
  code: number | null
  stdout: string
  stderr: string
}

function run(args: string[]): Promise<ProcResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(GALLERYDL_BIN, args, { shell: false })
    let stdout = ""
    let stderr = ""
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      child.kill("SIGKILL")
      reject(new Error("gallery-dl timed out"))
    }, PROC_TIMEOUT_MS)
    timer.unref?.()
    child.stdout.on("data", (d) => {
      stdout += d
      if (stdout.length > 5_000_000) child.kill("SIGKILL")
    })
    child.stderr.on("data", (d) => {
      stderr += d
    })
    child.on("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

export interface GalleryItem {
  url: string
  isVideo: boolean
}

/** Medya URL'lerini listele (`-g`) — count + video tespiti için. İndirmez. */
export async function galleryUrls(url: string): Promise<GalleryItem[]> {
  const { code, stdout, stderr } = await run([...galleryArgs(), "-g", "--", url])
  const urls = stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
  if (urls.length === 0) {
    throw new Error(parseGalleryError(stderr || ""))
  }
  return urls.map((u) => ({ url: u, isVideo: /\.mp4(\?|$)/i.test(u) }))
}

/** Tüm medyayı `destDir`'e indir → üretilen dosya yollarını döndür. */
export async function galleryDownload(url: string, destDir: string): Promise<string[]> {
  await mkdir(destDir, { recursive: true })
  const { code, stderr } = await run([...galleryArgs(), "-D", destDir, "--", url])
  const names = await readdir(destDir).catch(() => [] as string[])
  const files = names.map((n) => path.join(destDir, n))
  if (files.length === 0) {
    throw new Error(parseGalleryError(stderr || ""))
  }
  return files
}

/** gallery-dl stderr → kullanıcı-dostu mesaj (Instagram'a özgü). */
export function parseGalleryError(stderr: string): string {
  const s = (stderr || "").toLowerCase()
  if (s.includes("login required") || s.includes("checkpoint") || s.includes("challenge")) {
    return "This Instagram content requires login. Try again later."
  }
  if (s.includes("not found") || s.includes("404") || s.includes("no extractor")) {
    return "This Instagram content was not found."
  }
  if (s.includes("private")) {
    return "This account or post is private."
  }
  if (s.includes("rate limit") || s.includes("429") || s.includes("please wait")) {
    return "Instagram is rate-limiting requests. Please try again later."
  }
  return "Could not fetch this Instagram media. Please check the link and try again."
}

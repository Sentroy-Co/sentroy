import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, rename, rm, stat } from "node:fs/promises"
import path from "node:path"
import {
  fetchInfo,
  instagramUrlKind,
  mimeForExt,
  type VideoInfo,
  type DownloadResult,
} from "./ytdlp"
import { galleryUrls, galleryDownload } from "./gallerydl"

/**
 * Instagram orkestrasyonu: hangi araç hangi tip için —
 *  - profile / image / carousel → gallery-dl (orijinal çözünürlük + tüm öğeler)
 *  - video / reel               → yt-dlp (kalite + mp4 merge)  (ytdlp.ts)
 */

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "/tmp/dl"

/** instagram.com/<user>[...] → gallery-dl avatar hedefi. */
function avatarTarget(profileUrl: string): { url: string; user: string } {
  const u = new URL(profileUrl.trim())
  const user = u.pathname.split("/").filter(Boolean)[0] || "profile"
  return { url: `https://www.instagram.com/${user}/avatar`, user }
}

export type IgDownloadKind = "video" | "audio" | "image" | "carousel" | "profile"

/** /info — Instagram URL tipine göre mediaType + metadata. */
export async function fetchInstagramInfo(url: string): Promise<VideoInfo> {
  const kind = instagramUrlKind(url)

  if (kind === "profile") {
    const { url: avatar, user } = avatarTarget(url)
    const items = await galleryUrls(avatar)
    return {
      title: `@${user}`,
      uploader: user,
      duration: null,
      durationString: null,
      thumbnail: items[0]?.url ?? null,
      hasVideo: false,
      maxHeight: null,
      mediaType: "profile",
      count: 1,
    }
  }

  if (kind === "reel") {
    const info = await fetchInfo(url, "instagram")
    return { ...info, mediaType: "video", count: 1 }
  }

  // post veya story: tek foto/video / carousel — gallery-dl ile öğe listesi.
  const items = await galleryUrls(url)
  const count = items.length
  const hasVideo = items.some((i) => i.isVideo)
  // Önizleme: video URL'si <img>'de kırılır → ilk video-OLMAYAN öğeyi kullan.
  const previewThumb = items.find((i) => !i.isVideo)?.url ?? null
  const baseTitle = kind === "story" ? "Instagram story" : "Instagram post"

  if (count > 1) {
    return {
      title: baseTitle,
      uploader: null,
      duration: null,
      durationString: null,
      thumbnail: previewThumb,
      hasVideo,
      maxHeight: null,
      mediaType: "carousel",
      count,
    }
  }

  // Tek öğeli post + video → yt-dlp (kalite/başlık zengin). Story'de yt-dlp
  // URL'yi çözemeyebilir → her zaman gallery-dl (image kind, mp4/jpg).
  if (kind === "post" && hasVideo) {
    const info = await fetchInfo(url, "instagram")
    return { ...info, mediaType: "video", count: 1 }
  }

  return {
    title: kind === "story" ? baseTitle : "Instagram photo",
    uploader: null,
    duration: null,
    durationString: null,
    thumbnail: previewThumb,
    hasVideo,
    maxHeight: null,
    mediaType: "image",
    count: 1,
  }
}

function zipFiles(zipPath: string, files: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // -j: dizin yapısını düzleştir, -q: sessiz. shell:false + arg dizisi.
    const child = spawn("zip", ["-j", "-q", zipPath, ...files], { shell: false })
    let stderr = ""
    child.stderr.on("data", (d) => {
      stderr += d
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || "zip failed"))
    })
  })
}

/**
 * gallery-dl ile indir (image/carousel/profile). Carousel → tek .zip.
 * Tek dosya → DOWNLOAD_DIR köküne `<id>.<ext>` taşınır (cleanup uyumu).
 */
export async function downloadInstagramMedia(
  kind: "image" | "carousel" | "profile",
  url: string,
): Promise<DownloadResult> {
  await mkdir(DOWNLOAD_DIR, { recursive: true })
  const id = randomUUID()
  const stageDir = path.join(DOWNLOAD_DIR, `${id}-stage`)
  const target = kind === "profile" ? avatarTarget(url).url : url

  let files: string[]
  try {
    files = await galleryDownload(target, stageDir)
  } catch (err) {
    await rm(stageDir, { recursive: true, force: true }).catch(() => {})
    throw err
  }

  try {
    if (kind === "carousel" && files.length > 1) {
      const zipPath = path.join(DOWNLOAD_DIR, `${id}.zip`)
      await zipFiles(zipPath, files)
      const st = await stat(zipPath)
      return { filePath: zipPath, ext: "zip", mime: "application/zip", sizeBytes: st.size }
    }
    // Tek dosya (foto / profil / tek öğeli carousel) → köke taşı.
    const src = files[0]!
    const ext = src.slice(src.lastIndexOf(".") + 1).toLowerCase() || "jpg"
    const dest = path.join(DOWNLOAD_DIR, `${id}.${ext}`)
    await rename(src, dest)
    const st = await stat(dest)
    return { filePath: dest, ext, mime: mimeForExt(ext), sizeBytes: st.size }
  } finally {
    await rm(stageDir, { recursive: true, force: true }).catch(() => {})
  }
}

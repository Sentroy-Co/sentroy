// Sentroy Desktop indirilebilir sürümleri — GitHub Releases'ten (server-side).
// İndirme sayfası + "uygulamayı indir" popup'ı buradan beslenir. Asset adları
// electron-builder artifactName'inden gelir (sürüm içerir) → "latest" için
// isim sabit değil; bu yüzden Releases API'sinden gerçek asset URL'lerini çekip
// platforma eşleriz (revalidate cache ile GitHub rate-limit'e takılmadan).

/** Desktop repo (owner/repo). GitHub Releases API + doğrudan indirme buradan. */
export const DESKTOP_REPO =
  process.env.NEXT_PUBLIC_DESKTOP_REPO || "Sentroy-Co/sentroy-desktop"

export type DownloadPlatform = "mac" | "win" | "linux"

export interface DownloadAsset {
  platform: DownloadPlatform
  /** Kullanıcıya görünen etiket (örn. "macOS", "Windows", "Linux (AppImage)"). */
  label: string
  ext: string
  url: string
  size?: number
}

export interface DesktopRelease {
  version: string | null
  htmlUrl: string | null
  assets: DownloadAsset[]
}

const EMPTY: DesktopRelease = { version: null, htmlUrl: null, assets: [] }

/** Bir GitHub release asset'ini platform + etikete eşler; download olmayanları eler. */
function mapAsset(name: string, url: string, size?: number): DownloadAsset | null {
  const lower = name.toLowerCase()
  // Auto-update metadata + checksum dosyaları indirilebilir değil.
  if (/\.(yml|yaml|blockmap)$/.test(lower)) return null
  if (lower.endsWith(".dmg")) return { platform: "mac", label: "macOS", ext: "dmg", url, size }
  if (lower.endsWith(".exe"))
    return {
      platform: "win",
      // nsis kurulumu vs taşınabilir tek-dosya (artifactName -setup / -portable).
      label: lower.includes("portable") ? "Windows · Portable" : "Windows",
      ext: "exe",
      url,
      size,
    }
  if (lower.endsWith(".appimage")) return { platform: "linux", label: "Linux · AppImage", ext: "AppImage", url, size }
  if (lower.endsWith(".deb")) return { platform: "linux", label: "Linux · .deb", ext: "deb", url, size }
  if (lower.endsWith(".zip") && lower.includes("mac"))
    return { platform: "mac", label: "macOS · zip", ext: "zip", url, size }
  return null
}

/** Kart içi buton sırası: birincil kurulum (dmg/exe-setup/AppImage) önce,
 *  ikincil (zip/portable/deb) sonra — ilk buton primary stille render edilir. */
function assetWeight(a: DownloadAsset): number {
  if (a.ext === "zip") return 2
  if (a.label.includes("Portable") || a.ext === "deb") return 1
  return 0
}

/**
 * En son yayınlanan desktop sürümünü çeker. Release/asset yoksa (repo henüz
 * yayınlanmadıysa) boş döner — sayfa "yakında" durumunu zarifçe gösterir.
 * 10 dk ISR cache; GitHub token gerektirmez (public repo, düşük istek).
 */
export async function fetchLatestDesktopRelease(): Promise<DesktopRelease> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${DESKTOP_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "sentroy-download-page",
        },
        next: { revalidate: 600 },
      },
    )
    if (!res.ok) return EMPTY
    const json = (await res.json()) as {
      tag_name?: string
      name?: string
      html_url?: string
      assets?: { name: string; browser_download_url: string; size?: number }[]
    }
    const assets: DownloadAsset[] = []
    for (const a of json.assets ?? []) {
      const mapped = mapAsset(a.name, a.browser_download_url, a.size)
      if (mapped) assets.push(mapped)
    }
    // Her platform içinde birincil kurulum öne gelsin (byPlatform sıra korur).
    assets.sort((a, b) => assetWeight(a) - assetWeight(b))
    return {
      version: json.tag_name ?? json.name ?? null,
      htmlUrl: json.html_url ?? null,
      assets,
    }
  } catch {
    return EMPTY
  }
}

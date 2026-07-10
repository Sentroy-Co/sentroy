"use client"

/**
 * Sidebar footer altına yerleşen küçük versiyon etiketi. Build-time
 * `process.env.APP_VERSION` her app'in next.config'inde inject edilir
 * (`env: { APP_VERSION: pkg.version }`); release.sh tüm app paketlerini
 * tek versiyonda tuttuğu için tutarlı.
 *
 * Görünmesi: ufak, low-contrast — kullanıcının dikkat alanını çalmasın
 * ama destek/debug için "hangi versiyon kullanıyorum" sorusuna anlık
 * cevap versin. Sidebar collapsed iken (icon mode) gizlenir.
 */
export function VersionTag() {
  const version = process.env.APP_VERSION
  if (!version) return null
  return (
    <div className="group-data-[collapsible=icon]:hidden flex items-center justify-center px-2 pb-1.5 pt-0.5 text-[10px] tabular-nums text-muted-foreground/50">
      v{version}
    </div>
  )
}

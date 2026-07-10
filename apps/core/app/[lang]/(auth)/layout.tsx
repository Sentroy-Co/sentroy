import { wallpaperById, DEFAULT_WALLPAPER } from "@/components/os/wallpapers"

/**
 * Auth sayfaları — "bir OS'a giriş yapılıyor" hissi. Sıradan boş dashboard
 * yerine Sentroy OS masaüstü duvar kâğıdı (default aurora; login öncesi
 * wallpaper-store yok) + hafif karartma; sayfalar (login/signup vb.) ortalı
 * cam kart olarak bunun üstünde açılır. Form davranışı değişmez.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const wp = wallpaperById(DEFAULT_WALLPAPER)
  return (
    <div className="relative min-h-svh w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={wp.src}
        alt=""
        className="fixed inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="fixed inset-0 -z-10 bg-black/35" />
      <div className="flex min-h-svh items-center justify-center p-6">
        {children}
      </div>
    </div>
  )
}

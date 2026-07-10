export interface Wallpaper {
  id: string
  name: string
  src: string
}

/** Sentroy OS masaüstü duvar kâğıtları (public/os-wallpapers). */
export const WALLPAPERS: Wallpaper[] = [
  { id: "aurora", name: "Aurora", src: "/os-wallpapers/aurora.webp" },
  { id: "sunset", name: "Sunset", src: "/os-wallpapers/sunset.webp" },
  { id: "dusk", name: "Dusk", src: "/os-wallpapers/dusk.webp" },
  { id: "valley", name: "Valley", src: "/os-wallpapers/valley.webp" },
  { id: "dunes", name: "Dunes", src: "/os-wallpapers/dunes.webp" },
  { id: "coastline", name: "Coastline", src: "/os-wallpapers/coastline.webp" },
]

export const DEFAULT_WALLPAPER = "aurora"

export function wallpaperById(id: string): Wallpaper {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]!
}

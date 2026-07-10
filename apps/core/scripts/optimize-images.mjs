// Author-time (offline) görsel optimizasyonu — `next build`'e BAĞLI DEĞİL.
// Amaç: runtime next/image sharp CPU'sundan kaçınmak (2-core prod kutusu,
// README §5.4 starvation) + statik .webp asset'leri commit'lemek. Orijinal
// .png/.jpeg'ler fallback olarak yerinde kalır.
//
// Çalıştır:  cd apps/core && node scripts/optimize-images.mjs
// Sonra üretilen tüm .webp dosyalarını commit'le.
import sharp from "sharp"
import { readdir } from "node:fs/promises"
import path from "node:path"

const ICON = "public/os-app-icons"
const WALL = "public/os-wallpapers"

// OS app ikonları: 256x256 kaynak → 128px webp (dock 40→80, investor 52→104
// yani 2x için 128px yeterli; transparan zemin korunur). Her biri <10KB.
let icons = 0
for (const f of await readdir(ICON)) {
  if (!f.endsWith(".png")) continue
  const out = path.join(ICON, `${f.replace(/\.png$/, "")}.webp`)
  await sharp(path.join(ICON, f))
    .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82 })
    .toFile(out)
  icons++
}

// Wallpaper'lar: full-bleed → 1600px webp. valley (public landing LCP) ek
// olarak 800px (mobil poster / responsive srcset alt basamağı).
let walls = 0
for (const f of await readdir(WALL)) {
  if (!f.endsWith(".jpeg")) continue
  const base = f.replace(/\.jpeg$/, "")
  await sharp(path.join(WALL, f)).resize({ width: 1600 }).webp({ quality: 72 }).toFile(path.join(WALL, `${base}.webp`))
  walls++
  if (base === "valley") {
    await sharp(path.join(WALL, f)).resize({ width: 800 }).webp({ quality: 72 }).toFile(path.join(WALL, `${base}-800.webp`))
  }
}

console.log(`optimized: ${icons} icons (128px webp) + ${walls} wallpapers (1600px webp) + valley-800.webp`)

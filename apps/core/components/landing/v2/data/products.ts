// Landing v2 ürün kataloğu — kalıcı uzamsal kimlik şeması.
//
// Renk/ikonların gerçek kaynağı packages/console/.../app-launcher.tsx (dashboard
// launcher'ı); landing runtime'da oraya bağımlı OLMASIN diye statik aynalanır
// (yeni ürün eklerken iki yeri de güncelle). `dockSlot` sayfa boyunca SABİTTİR:
// dock sıralaması hiçbir sahnede değişmez — DockNav, scroll-spy ve genie-minimize
// hedef koordinatları hep bu tek kaynaktan okur.

import {
  Mail01Icon,
  FolderLibraryIcon,
  KeyIcon,
  ShieldUserIcon,
  ChartBarLineIcon,
  HeadphonesIcon,
  Message01Icon,
  KanbanIcon,
  FilmRoll01Icon,
  Video01Icon,
  Wrench01Icon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons"

/** Sahne grupları: hangi ürün hangi anlatı sahnesinde "yanar". */
export type SceneTier = "build" | "operate" | "create" | "os"

export interface LandingProduct {
  id: string
  /** Marka rengi (app-launcher ile senkron). */
  color: string
  /** Hugeicons SvgObject — repo genelindeki `typeof Mail01Icon` deseni. */
  icon: typeof Mail01Icon
  /** Dock'taki sabit sıra (0-based). */
  dockSlot: number
  sceneTier: SceneTier
  /**
   * Ürünün kendi sahnesi İÇİNDEKİ scroll konumu (0-1, pinned scrub'ın
   * (sectionHeight - viewportHeight) uzunluğuna oran). Dock tıklaması yalnız
   * sahne başına değil, ürünün segmentine/merkez anına iner — pinned
   * sahnelerde "yatay hedef" ancak dikey scroll offset'iyle kurulur.
   */
  sceneOffset: number
  /** Public href (marketing bağlamı — dashboard değil ürün yüzeyi). */
  href: string
  /**
   * OS dock ile ortak özel PNG logo (core/public/os-app-icons/<id>.webp).
   * Set edilmezse render noktaları productLogoUrl(id)'ye düşer; "os" gibi
   * PNG'si olmayan ürünler hugeicons glyph'inde kalır.
   */
  logoUrl?: string
}

/** Sahne anchor'ları — ScrollScene section id'leri (DockNav scroll hedefi). */
export const SCENE_ANCHORS: Record<SceneTier, string> = {
  build: "lv2-build",
  operate: "lv2-operate",
  create: "lv2-create",
  os: "one-session",
}

export const LANDING_PRODUCTS: LandingProduct[] = [
  // build — geliştirici temeli (segmentler: %25'lik dilimler; hedef = segment ortası)
  { id: "mail",     color: "#3b82f6", icon: Mail01Icon,        dockSlot: 0,  sceneTier: "build",   sceneOffset: 0.08, href: "https://mail.sentroy.com" },
  { id: "storage",  color: "#a855f7", icon: FolderLibraryIcon, dockSlot: 1,  sceneTier: "build",   sceneOffset: 0.33, href: "https://storage.sentroy.com" },
  { id: "auth",     color: "#10b981", icon: ShieldUserIcon,    dockSlot: 2,  sceneTier: "build",   sceneOffset: 0.58, href: "https://auth.sentroy.com" },
  { id: "vault",    color: "#f59e0b", icon: KeyIcon,           dockSlot: 3,  sceneTier: "build",   sceneOffset: 0.83, href: "https://sentroy.com" },
  // operate — yatay ray merkez anları (RAIL_START 0.06 → RAIL_END 0.94)
  { id: "status",   color: "#06b6d4", icon: ChartBarLineIcon,  dockSlot: 4,  sceneTier: "operate", sceneOffset: 0.06, href: "https://status.sentroy.com" },
  { id: "meet",     color: "#0ea5e9", icon: Video01Icon,       dockSlot: 5,  sceneTier: "operate", sceneOffset: 0.35, href: "https://meet.sentroy.com" },
  { id: "whatsapp", color: "#25d366", icon: Message01Icon,     dockSlot: 6,  sceneTier: "operate", sceneOffset: 0.65, href: "https://whatsapp.sentroy.com" },
  { id: "linear",   color: "#5E6AD2", icon: KanbanIcon,        dockSlot: 7,  sceneTier: "operate", sceneOffset: 0.94, href: "https://linear.sentroy.com" },
  // create — kamera keyframe'leri (studio zoom / opencut pan / tools finali)
  { id: "studio",   color: "#ec4899", icon: HeadphonesIcon,    dockSlot: 8,  sceneTier: "create",  sceneOffset: 0.16, href: "https://studio.sentroy.com" },
  { id: "opencut",  color: "#f97316", icon: FilmRoll01Icon,    dockSlot: 9,  sceneTier: "create",  sceneOffset: 0.48, href: "https://opencut.sentroy.com" },
  { id: "tools",    color: "#6366f1", icon: Wrench01Icon,      dockSlot: 10, sceneTier: "create",  sceneOffset: 0.82, href: "https://tools.sentroy.com" },
  // os — 12. ikon: Exposé grid'i kurulu + ikon düşmüş an
  { id: "os",       color: "#111111", icon: ShieldKeyIcon,     dockSlot: 11, sceneTier: "os",      sceneOffset: 0.74, href: "https://sentroy.com" },
]

export const productById = (id: string): LandingProduct | undefined =>
  LANDING_PRODUCTS.find((p) => p.id === id)

export const productsByTier = (tier: SceneTier): LandingProduct[] =>
  LANDING_PRODUCTS.filter((p) => p.sceneTier === tier)

/**
 * OS dock'unun kullandığı özel PNG logoya sahip ürün id'leri — landing bu
 * görselleri (core/public/os-app-icons/<id>.webp) aynalar. "os" HARİÇ: onun
 * PNG'si yok, hugeicons glyph'inde (ShieldKeyIcon) kalır.
 */
const LOGO_IDS = new Set([
  "mail",
  "storage",
  "auth",
  "vault",
  "status",
  "meet",
  "whatsapp",
  "linear",
  "studio",
  "opencut",
  "tools",
])

/** Ürünün OS-dock aynası PNG logo yolu (core relative); logosu yoksa null. */
export function productLogoUrl(id: string): string | null {
  return LOGO_IDS.has(id) ? `/os-app-icons/${id}.webp` : null
}

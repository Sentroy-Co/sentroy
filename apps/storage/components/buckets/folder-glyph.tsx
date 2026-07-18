import { cn } from "@workspace/ui/lib/utils"

/**
 * iCloud tarzı dolu klasör glyph'i — bucket'lar ve klasörler için ortak
 * (mobil `FolderGlyph` ile aynı görünüm/oranlar). Public → yeşil (emerald),
 * private → mavi (blue). Sekme (tab) + dikey gradient gövde + renk parıltısı.
 * Kare bir kap içinde ölçeklenir (kabın genişliğini doldurur).
 */
export function FolderGlyph({
  isPublic,
  className,
}: {
  isPublic: boolean
  className?: string
}) {
  const c = isPublic
    ? { base: "#10B981", light: "#45C89D", dark: "#0E9F6F" }
    : { base: "#3B82F6", light: "#669DF8", dark: "#3370D4" }

  return (
    <div className={cn("relative aspect-square w-full", className)} aria-hidden>
      {/* Arka sekme */}
      <div
        className="absolute"
        style={{
          left: "12%",
          top: "17%",
          width: "42%",
          height: "24%",
          background: c.dark,
          borderTopLeftRadius: "17%",
          borderTopRightRadius: "17%",
        }}
      />
      {/* Gövde — dikey gradient + parıltı */}
      <div
        className="absolute"
        style={{
          left: "6%",
          top: "29%",
          width: "88%",
          height: "56%",
          background: `linear-gradient(180deg, ${c.light}, ${c.base})`,
          borderRadius: "12.5%",
          boxShadow: `0 6px 20px ${c.base}59`,
        }}
      />
    </div>
  )
}

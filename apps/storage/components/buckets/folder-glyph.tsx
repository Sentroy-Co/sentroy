import { cn } from "@workspace/ui/lib/utils"
import type { StorageAccess } from "@workspace/db/types"

/**
 * iCloud tarzı dolu klasör glyph'i — bucket'lar ve klasörler için ortak
 * (mobil `FolderGlyph` ile aynı görünüm/oranlar). Public → yeşil (emerald),
 * private → mavi (blue). Sekme (tab) + dikey gradient gövde + renk parıltısı.
 * Kare bir kap içinde ölçeklenir (kabın genişliğini doldurur).
 *
 * `access` (şirket-içi erişim tier'ı) everyone dışıysa gövdenin ortasında
 * klasörün kendi koyu tonunda bir kilit (owner) / kalkan (admins) ikonu
 * çizilir — kullanıcı klasörün kısıtlı olduğunu tek bakışta anlar.
 */
export function FolderGlyph({
  isPublic,
  access,
  className,
}: {
  isPublic: boolean
  access?: StorageAccess
  className?: string
}) {
  const c = isPublic
    ? { base: "#10B981", light: "#45C89D", dark: "#0E9F6F" }
    : { base: "#3B82F6", light: "#669DF8", dark: "#3370D4" }

  const restricted = access === "admins" || access === "owner"

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
      {/* Erişim markörü — gövdenin ortasında, klasörün koyu tonunda */}
      {restricted ? (
        <div
          className="absolute flex items-center justify-center"
          style={{ left: "6%", top: "29%", width: "88%", height: "56%" }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{ width: "34%", height: "34%", color: c.dark }}
            fill="none"
          >
            {access === "admins" ? (
              // Kalkan
              <path
                d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ) : (
              // Kilit
              <>
                <rect
                  x="5"
                  y="10.5"
                  width="14"
                  height="9.5"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M8 10.5V8a4 4 0 118 0v2.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
        </div>
      ) : null}
    </div>
  )
}

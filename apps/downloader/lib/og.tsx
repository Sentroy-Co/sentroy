import { ImageResponse } from "next/og"
import type { Platform } from "@/lib/platform"

/**
 * Paylaşılan OG görsel template'i (1200×630). Dile duyarlı: çağıran route
 * yerelleştirilmiş başlık/eyebrow'u geçirir. Satori tabanlı — her çok-çocuklu
 * div'de display:flex zorunlu.
 */
export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = "image/png"

const ACCENT: Record<Platform, string> = {
  youtube: "#ef4444",
  instagram: "#ec4899",
  soundcloud: "#f97316",
}

export function ogResponse(opts: {
  platform: Platform
  platformLabel: string
  eyebrow: string
  title: string
  footer: string
}) {
  const accent = ACCENT[opts.platform] ?? "#ef4444"
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "#09090b",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        {/* Arka plan glow */}
        <div
          style={{
            position: "absolute",
            top: "-220px",
            left: "380px",
            width: "640px",
            height: "640px",
            borderRadius: "9999px",
            background: accent,
            opacity: 0.22,
            filter: "blur(160px)",
            display: "flex",
          }}
        />

        {/* Üst: marka + platform rozeti */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "9999px",
                background: accent,
                display: "flex",
              }}
            />
            <div style={{ fontSize: "34px", fontWeight: 700, display: "flex" }}>Sentroy</div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: "9999px",
              border: "1px solid rgba(255,255,255,0.14)",
              fontSize: "26px",
              color: "#d4d4d8",
            }}
          >
            {opts.platformLabel}
          </div>
        </div>

        {/* Orta: eyebrow + başlık */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              letterSpacing: "4px",
              textTransform: "uppercase",
              color: accent,
              fontWeight: 600,
            }}
          >
            {opts.eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "76px",
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: "1000px",
            }}
          >
            {opts.title}
          </div>
        </div>

        {/* Alt: footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            fontSize: "28px",
            color: "#a1a1aa",
          }}
        >
          {opts.footer}
        </div>
      </div>
    ),
    { ...OG_SIZE },
  )
}

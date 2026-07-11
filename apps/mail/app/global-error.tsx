"use client"

import { useEffect } from "react"

// Root-level catastrophic error — app layout'u/CSS'i yüklenmeyebilir, bu yüzden
// tamamen self-contained (inline style, Tailwind/Logo yok). OS-dark + marka
// kırmızısı (#FF1744) + "Sentroy" wordmark ile diğer error yüzeyleriyle uyumlu.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[global-error]", error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            background: "#0a0a0a",
            backgroundImage:
              "radial-gradient(circle at 50% 45%, rgba(255,23,68,0.14), transparent 55%)",
            color: "#fafafa",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 440 }}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 34 }}>
              Sentroy
            </div>
            <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1, color: "#ff1744", marginBottom: 14 }}>
              500
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6, margin: "0 0 32px" }}>
              An unexpected error occurred. Our team has been notified — please try again.
            </p>
            <button
              onClick={reset}
              style={{
                background: "#fafafa",
                color: "#0a0a0a",
                border: "none",
                borderRadius: 12,
                padding: "12px 26px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}

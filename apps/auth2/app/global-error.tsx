"use client"

import { useEffect } from "react"

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
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            background: "#09090b",
            color: "#fafafa",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 480 }}>
            <div
              style={{
                fontSize: 80,
                fontWeight: 700,
                lineHeight: 1,
                background: "linear-gradient(135deg, #ef4444, #f97316)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: 16,
              }}
            >
              ERROR
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#a1a1aa", fontSize: 15, lineHeight: 1.6, margin: "0 0 32px" }}>
              An unexpected error occurred. Our team has been notified.
            </p>
            <button
              onClick={reset}
              style={{
                background: "#fafafa",
                color: "#09090b",
                border: "none",
                borderRadius: 9999,
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: 500,
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

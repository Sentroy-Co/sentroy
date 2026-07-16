"use client"

import { useEffect, useState } from "react"

/**
 * Fires the `sentroy://` deep link that hands the session back to the desktop
 * app, with a manual fallback button for browsers that block auto protocol
 * navigation.
 */
export function DesktopAuthLauncher({
  code,
  email,
  scheme = "sentroy",
  appName = "Sentroy",
}: {
  code: string
  email: string
  /** Hedef uygulamanın deep-link şeması (allowlist: page.tsx HANDOFF_APPS). */
  scheme?: string
  appName?: string
}) {
  const deepLink = `${scheme}://auth?code=${encodeURIComponent(code)}`
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = deepLink
      setOpened(true)
    }, 400)
    return () => clearTimeout(t)
  }, [deepLink])

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#0a0a0a",
        color: "#f2f2f4",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 380, textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff1744" }} />
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Opening the {appName} app…</h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "#8b8b93", margin: 0 }}>
          {email ? <>Signed in as <b style={{ color: "#f2f2f4" }}>{email}</b>. </> : null}
          If the app doesn’t open automatically, use the button below. You can
          close this tab afterwards.
        </p>
        <a
          href={deepLink}
          onClick={() => setOpened(true)}
          style={{
            marginTop: 4,
            padding: "10px 22px",
            borderRadius: 12,
            background: "#ff1744",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Open {appName}
        </a>
        {opened ? (
          <p style={{ fontSize: 12, color: "#8b8b93", margin: 0 }}>
            You can return to the {appName} app now.
          </p>
        ) : null}
      </div>
    </div>
  )
}

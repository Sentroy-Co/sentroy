"use client"

import { useEffect, useState } from "react"

function formatDelta(deltaMs: number): string {
  const sec = Math.max(0, Math.round(deltaMs / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  return `${hr}h ago`
}

export function LastUpdated({ generatedAt }: { generatedAt: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  const generated = new Date(generatedAt).getTime()
  return (
    <span className="font-mono text-[11.5px] text-muted-foreground">
      Updated {formatDelta(now - generated)}
    </span>
  )
}

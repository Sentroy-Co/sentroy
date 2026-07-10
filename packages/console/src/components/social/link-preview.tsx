"use client"

import { useEffect, useState } from "react"

interface OgData {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

/**
 * Twitter-tarzı OG link önizleme kartı. `/api/og` (SSRF-güvenli) ile meta
 * çeker; anlamlı meta (başlık/görsel) yoksa hiçbir şey render etmez. Kart
 * linki yeni sekmede açar (target=_blank → OsLinkBridge dokunmaz).
 */
export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<OgData | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setDone(false)
    fetch(`/api/og?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return
        const d = j?.data as OgData | undefined
        if (d && (d.title || d.image)) setData(d)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (!done || !data) return null

  let host = data.siteName
  try {
    host = data.siteName || new URL(url).hostname
  } catch {
    /* keep */
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/lp block overflow-hidden rounded-2xl border bg-card transition-colors hover:bg-accent/40"
    >
      {data.image ? (
        <div className="aspect-[1.91/1] w-full overflow-hidden border-b bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.image}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5 p-3">
        {host ? (
          <span className="truncate text-xs text-muted-foreground">{host}</span>
        ) : null}
        {data.title ? (
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {data.title}
          </span>
        ) : null}
        {data.description ? (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {data.description}
          </span>
        ) : null}
      </div>
    </a>
  )
}

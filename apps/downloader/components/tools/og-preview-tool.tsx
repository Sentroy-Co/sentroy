"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon, Image01Icon, Globe02Icon } from "@hugeicons/core-free-icons"

/** Open Graph / link preview — /api/og (SSRF korumalı server fetch) ile meta çeker. */

interface OgData {
  url: string
  domain: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  favicon: string | null
  twitterCard: string | null
  raw: Record<string, string>
}

export function OgPreviewTool() {
  const t = useTranslations("d")
  const [url, setUrl] = useState("")
  const [data, setData] = useState<OgData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchOg = useCallback(async () => {
    let u = url.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) u = "https://" + u
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`/api/og?url=${encodeURIComponent(u)}`)
      const json = await res.json()
      if (!res.ok) {
        setError(t("ogError"))
      } else {
        setData(json as OgData)
      }
    } catch {
      setError(t("ogError"))
    } finally {
      setLoading(false)
    }
  }, [url, t])

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchOg()}
          placeholder="https://sentroy.com"
          spellCheck={false}
          className="h-11 flex-1 rounded-xl border bg-card px-4 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={fetchOg}
          disabled={loading || !url.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5" />
          {t("ogPreview")}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
            {t("ogFetching")}
          </motion.div>
        ) : error ? (
          <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            {error}
          </motion.div>
        ) : data ? (
          <motion.div key="d" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5 lg:grid-cols-[1fr_360px]">
            {/* Link önizleme kartı */}
            <div className="flex flex-col gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("ogCardPreview")}</span>
              <div className="overflow-hidden rounded-2xl border bg-card">
                <div className="flex aspect-[1.91/1] items-center justify-center bg-muted/40">
                  {data.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.image} alt="" className="size-full object-cover" />
                  ) : (
                    <HugeiconsIcon icon={Image01Icon} strokeWidth={1.5} className="size-10 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-4">
                  <span className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
                    {data.favicon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={data.favicon} alt="" className="size-4 rounded-sm" />
                    ) : (
                      <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} className="size-4" />
                    )}
                    {data.domain}
                  </span>
                  <span className="font-semibold leading-snug">{data.title ?? t("ogNoTitle")}</span>
                  {data.description ? (
                    <span className="line-clamp-2 text-sm text-muted-foreground">{data.description}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Çıkarılan meta */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("ogTags")}</span>
              <div className="flex max-h-[420px] flex-col gap-1 overflow-auto rounded-2xl border bg-card p-3 font-mono text-[11px]">
                {Object.entries(data.raw).length === 0 ? (
                  <span className="text-muted-foreground/60">{t("ogNoTags")}</span>
                ) : (
                  Object.entries(data.raw).map(([k, v]) => (
                    <div key={k} className="flex flex-col border-b border-border/40 py-1 last:border-0">
                      <span className="font-medium text-primary">{k}</span>
                      <span className="break-all text-muted-foreground">{v}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="i" className="rounded-2xl border border-dashed bg-card/50 p-10 text-center text-sm text-muted-foreground/60">
            {t("ogHint")}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

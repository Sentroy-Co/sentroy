"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Download04Icon,
  Loading03Icon,
  VideoReplayIcon,
  MusicNote01Icon,
  Alert02Icon,
  PlusSignIcon,
  Delete02Icon,
  Clock01Icon,
  Link01Icon,
  ArrowRight01Icon,
  UserIcon,
  Image01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { TurnstileWidget } from "./turnstile-widget"
import {
  VIDEO_QUALITIES,
  AUDIO_FORMATS,
  isValidUrl,
  PLATFORMS,
  type Platform,
} from "@/lib/platform"
import { useDownloadStore, type HistoryItem } from "@/lib/store"

type MediaType = "video" | "image" | "carousel" | "profile"

interface VideoInfo {
  title: string
  uploader: string | null
  duration: number | null
  durationString: string | null
  thumbnail: string | null
  hasVideo: boolean
  maxHeight: number | null
  /** Instagram: medya tipi. YouTube'da undefined → klasik video/audio akışı. */
  mediaType?: MediaType
  count?: number
}

/** Toggle/kalite UI'sı video/audio'da; thumbnail + image/carousel/profile tek-tık. */
type DownloadKind = "video" | "audio" | "thumbnail" | "image" | "carousel" | "profile"

/** SSE indirme olayı (worker → app → client) veya JSON yanıtı. */
type DlEvent = {
  type?: "progress" | "done" | "error"
  stage?: "downloading" | "converting"
  percent?: number
  token?: string
  filename?: string
  remaining?: number
  quotaMax?: number
  resetAt?: number
  error?: string
}

function pickVideoQuality(maxHeight: number | null): string {
  const avail = VIDEO_QUALITIES.filter((q) => !maxHeight || Number(q) <= maxHeight)
  return avail[avail.length - 1] ?? "720"
}

function triggerDownload(href: string, name: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Instagram/fbcdn thumbnail'leri CORP same-origin döndürür → tarayıcıda hotlink
 * edilemez. Bu host'lar /api/img proxy'sinden geçirilir; diğerleri (youtube
 * ytimg vb.) doğrudan.
 */
function proxiedThumb(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    if (/(?:^|\.)(fbcdn\.net|cdninstagram\.com)$/i.test(new URL(url).hostname)) {
      return `/api/img?url=${encodeURIComponent(url)}`
    }
  } catch {
    /* geçersiz url → olduğu gibi */
  }
  return url
}

export function Downloader({
  platform,
  initialUrl,
  siteKey,
}: {
  platform: Platform
  initialUrl?: string
  siteKey: string | null
}) {
  const t = useTranslations("d")
  const cfg = PLATFORMS[platform]

  const urlRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(initialUrl ?? "")
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<DownloadKind>("video")
  const [quality, setQuality] = useState<string>("720")
  const [token, setToken] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<{ stage: "downloading" | "converting"; percent: number } | null>(
    null,
  )
  const [ready, setReady] = useState<{ href: string; name: string } | null>(null)

  const addToHistory = useDownloadStore((s) => s.addToHistory)

  // Günlük indirme kotası (IP başına 5) — ilk yüklemede çek, her indirmede güncelle.
  const [quota, setQuota] = useState<{ remaining: number; max: number; resetAt: number } | null>(
    null,
  )
  const refreshQuota = useCallback(async () => {
    try {
      const r = await fetch("/api/quota", { cache: "no-store" })
      if (r.ok) setQuota(await r.json())
    } catch {
      /* sessiz */
    }
  }, [])
  useEffect(() => {
    void refreshQuota()
  }, [refreshQuota])

  const fetchInfo = useCallback(
    async (u: string) => {
      setError(null)
      setInfo(null)
      setReady(null)
      const trimmed = u.trim()
      if (!isValidUrl(trimmed, platform)) {
        setError(t("errInvalidUrl", { platform: cfg.label }))
        return
      }
      setLoading(true)
      try {
        const res = await fetch("/api/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed, platform }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(
            res.status === 429
              ? t("errRateLimit")
              : data?.error === "invalidUrl"
                ? t("errInvalidUrl", { platform: cfg.label })
                : data?.error || t("errGeneric"),
          )
          return
        }
        const vi = data as VideoInfo
        setInfo(vi)
        // Instagram: mediaType tek-tık tipini belirler (image/carousel/profile);
        // video ise klasik kalite akışı.
        if (vi.mediaType === "image" || vi.mediaType === "carousel" || vi.mediaType === "profile") {
          setKind(vi.mediaType)
          setQuality("original")
        } else if (vi.hasVideo) {
          setKind("video")
          setQuality(pickVideoQuality(vi.maxHeight))
        } else {
          setKind("audio")
          setQuality("mp3")
        }
      } catch {
        setError(t("errGeneric"))
      } finally {
        setLoading(false)
      }
    },
    [platform, cfg.label, t],
  )

  useEffect(() => {
    if (initialUrl) void fetchInfo(initialUrl)
  }, [initialUrl, fetchInfo])

  const onDownload = useCallback(async () => {
    if (siteKey && !token) return
    setDownloading(true)
    setError(null)
    setProgress(null)

    const commit = (d: DlEvent) => {
      if (!d.token || !d.filename) return
      if (typeof d.remaining === "number")
        setQuota({ remaining: d.remaining, max: d.quotaMax ?? 5, resetAt: d.resetAt as number })
      const href = `/api/file/${d.token}`
      setReady({ href, name: d.filename })
      addToHistory({
        url: url.trim(),
        platform,
        title: info?.title || d.filename,
        thumbnail: info?.thumbnail ?? null,
        kind,
        quality,
        filename: d.filename,
        token: d.token,
      })
      triggerDownload(href, d.filename)
    }
    const showErr = (status: number, d: DlEvent) => {
      if (status === 429) {
        setError(d?.error === "quota" ? t("errQuota") : t("errRateLimit"))
        if (d?.error === "quota")
          setQuota({ remaining: 0, max: d?.quotaMax ?? 5, resetAt: d?.resetAt as number })
      } else {
        setError(d?.error || t("errGeneric"))
      }
    }

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          platform,
          kind,
          quality,
          title: info?.title,
          turnstileToken: token,
        }),
      })

      // video/audio/thumbnail → SSE progress; diğerleri JSON.
      const isStream = (res.headers.get("content-type") || "").includes("event-stream")
      if (res.ok && res.body && isStream) {
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ""
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const parts = buf.split("\n\n")
          buf = parts.pop() ?? ""
          for (const part of parts) {
            const s = part.replace(/^data:\s*/, "").trim()
            if (!s) continue
            let o: DlEvent
            try {
              o = JSON.parse(s)
            } catch {
              continue
            }
            if (o.type === "progress") {
              setProgress({ stage: o.stage ?? "downloading", percent: o.percent ?? 0 })
            } else if (o.type === "done") {
              commit(o)
            } else if (o.type === "error") {
              setError(o.error || t("errGeneric"))
            }
          }
        }
      } else {
        const data: DlEvent = await res.json().catch(() => ({}))
        if (!res.ok) {
          showErr(res.status, data)
          return
        }
        commit(data)
      }
    } catch {
      setError(t("errGeneric"))
    } finally {
      setDownloading(false)
      setProgress(null)
    }
  }, [siteKey, token, url, platform, kind, quality, info, t, addToHistory])

  const resetForm = useCallback(() => {
    setUrl("")
    setInfo(null)
    setReady(null)
    setError(null)
    setToken(null)
    setTimeout(() => urlRef.current?.focus(), 50)
  }, [])

  // Geçmiş item'ı forma yükle (farklı format için) → info çek.
  const loadFromHistory = useCallback(
    (h: HistoryItem) => {
      setUrl(h.url)
      void fetchInfo(h.url)
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [fetchInfo],
  )

  const videoQualities = VIDEO_QUALITIES.filter(
    (q) => !info?.maxHeight || Number(q) <= info.maxHeight,
  )
  const qualityList = kind === "video" ? videoQualities : [...AUDIO_FORMATS]

  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      {/* URL input — birleşik şık pill: ikon + borderless input + Getir butonu */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void fetchInfo(url)
        }}
        className="group/url flex items-center gap-1.5 rounded-2xl border bg-card/60 p-2 shadow-lg backdrop-blur transition-all focus-within:border-primary/60 focus-within:shadow-primary/10 sm:gap-2 sm:p-2.5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground transition-colors group-focus-within/url:bg-primary/10 group-focus-within/url:text-primary sm:size-11">
          <HugeiconsIcon icon={Link01Icon} strokeWidth={2} className="size-5" />
        </span>
        <input
          ref={urlRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            // Paste'te otomatik getir — kullanıcı 'Getir'e basmasın.
            const text = e.clipboardData.getData("text").trim()
            if (text) {
              e.preventDefault()
              setUrl(text)
              void fetchInfo(text)
            }
          }}
          placeholder={cfg.placeholder}
          className="min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground/70"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-label={t("urlLabel")}
        />
        <Button
          type="submit"
          disabled={loading}
          className="h-10 shrink-0 rounded-xl px-5 text-base font-semibold sm:h-11 sm:px-7"
        >
          {loading ? (
            <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
          ) : (
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2.5}
              className="size-5 sm:hidden"
            />
          )}
          <span className="hidden sm:inline">{loading ? t("fetching") : t("get")}</span>
          <span className="sm:hidden">{loading ? t("fetching") : ""}</span>
        </Button>
      </form>

      {/* Günlük kota göstergesi */}
      {quota ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3.5" />
          {quota.remaining > 0
            ? t("quotaLeft", { remaining: quota.remaining, max: quota.max })
            : t("quotaReached")}
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 shrink-0" />
            {error}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Sonuç kartı */}
      <AnimatePresence mode="wait">
        {info ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="flex flex-col gap-5 rounded-2xl border bg-card/60 p-5 shadow-xl backdrop-blur"
          >
            <div className="flex gap-4">
              {info.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxiedThumb(info.thumbnail)}
                  alt=""
                  className={cn(
                    "shrink-0 rounded-xl object-cover ring-1 ring-border",
                    info.mediaType === "profile"
                      ? "size-28 rounded-full"
                      : info.mediaType === "image" || info.mediaType === "carousel"
                        ? "aspect-square w-44"
                        : "aspect-video w-44",
                  )}
                />
              ) : null}
              <div className="flex min-w-0 flex-col justify-center gap-1">
                <h2 className="line-clamp-2 font-semibold">{info.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {info.uploader ? `${t("by")} ${info.uploader}` : ""}
                  {info.durationString ? ` · ${info.durationString}` : ""}
                </p>
              </div>
            </div>

            {/* Video/audio/thumbnail → toggle; instagram foto/carousel/profil → sade özet */}
            {kind === "video" || kind === "audio" || kind === "thumbnail" ? (
            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {t("chooseWhat")}
              </span>
              <div
                className={cn(
                  "grid gap-3",
                  platform === "youtube" ? "grid-cols-3" : "grid-cols-2",
                )}
              >
                {[
                  {
                    k: "video" as const,
                    icon: VideoReplayIcon,
                    label: t("video"),
                    hint: t("videoHint"),
                    disabled: !info.hasVideo,
                  },
                  {
                    k: "audio" as const,
                    icon: MusicNote01Icon,
                    label: t("audio"),
                    hint: t("audioHint"),
                    disabled: false,
                  },
                  ...(platform === "youtube"
                    ? [
                        {
                          k: "thumbnail" as const,
                          icon: Image01Icon,
                          label: t("thumbnail"),
                          hint: t("thumbnailHint"),
                          disabled: false,
                        },
                      ]
                    : []),
                ].map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      setKind(opt.k)
                      setQuality(
                        opt.k === "video"
                          ? pickVideoQuality(info.maxHeight)
                          : opt.k === "audio"
                            ? "mp3"
                            : "original",
                      )
                    }}
                    className={cn(
                      "group flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all disabled:opacity-40",
                      kind === opt.k
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "hover:border-primary/40 hover:bg-muted/40",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <HugeiconsIcon
                        icon={opt.icon}
                        strokeWidth={2}
                        className={cn(
                          "size-5 transition-colors",
                          kind === opt.k ? "text-primary" : "text-muted-foreground group-hover:text-primary",
                        )}
                      />
                      {opt.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </button>
                ))}
              </div>

              {/* Kalite/format — yalnız video/audio (thumbnail'de kalite yok) */}
              {kind === "video" || kind === "audio" ? (
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${qualityList.length}, minmax(0, 1fr))` }}
                >
                  {qualityList.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuality(q)}
                      className={cn(
                        "rounded-xl border py-2.5 text-sm font-semibold transition-all",
                        quality === q
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:border-primary/40 hover:bg-muted/40",
                      )}
                    >
                      {kind === "video" ? `${q}p` : q.toUpperCase()}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <HugeiconsIcon
                    icon={kind === "profile" ? UserIcon : Image01Icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">
                    {kind === "profile"
                      ? t("igProfileTitle")
                      : kind === "carousel"
                        ? t("igCarouselTitle", { count: info.count ?? 0 })
                        : t("igPhotoTitle")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {kind === "profile"
                      ? t("igProfileHint")
                      : kind === "carousel"
                        ? t("igCarouselHint")
                        : t("igPhotoHint")}
                  </span>
                </div>
              </div>
            )}

            {siteKey ? <TurnstileWidget siteKey={siteKey} onToken={setToken} /> : null}

            {/* İndir / İndirme hazır + başka içerik */}
            {ready ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => triggerDownload(ready.href, ready.name)}
                  className="h-14 flex-1 rounded-xl text-base font-semibold"
                >
                  <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                  {t("save")}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetForm}
                  className="h-14 rounded-xl px-6 text-base font-semibold"
                >
                  <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                  {t("startOver")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => void onDownload()}
                  disabled={downloading || (!!siteKey && !token) || quota?.remaining === 0}
                  className="h-14 rounded-xl text-base font-semibold"
                >
                  {downloading ? (
                    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                  )}
                  {downloading
                    ? progress?.stage === "converting"
                      ? t("stageConverting")
                      : progress
                        ? t("stageDownloadingPct", { percent: progress.percent })
                        : t("downloading")
                    : kind === "video"
                      ? `${t("download")} · ${quality}p`
                      : kind === "audio"
                        ? `${t("download")} · ${quality.toUpperCase()}`
                        : kind === "thumbnail"
                          ? t("dlThumbnail")
                          : kind === "carousel"
                            ? t("dlCarousel", { count: info.count ?? 0 })
                            : kind === "profile"
                              ? t("dlProfile")
                              : t("dlPhoto")}
                </Button>
                {downloading ? (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    {progress?.stage === "converting" ? (
                      <motion.div
                        className="h-full w-full rounded-full bg-primary"
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                      />
                    ) : (
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={false}
                        animate={{ width: `${progress?.percent ?? 0}%` }}
                        transition={{ ease: "easeOut", duration: 0.3 }}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DownloadHistory onReload={loadFromHistory} />
    </div>
  )
}

// ── Geçmiş indirmeler (1 saat TTL, thumbnail + tekrar/farklı format) ─────────
function DownloadHistory({ onReload }: { onReload: (h: HistoryItem) => void }) {
  const t = useTranslations("d")
  const hydrated = useDownloadStore((s) => s.hydrated)
  const history = useDownloadStore((s) => s.history)
  const remove = useDownloadStore((s) => s.removeFromHistory)
  const prune = useDownloadStore((s) => s.pruneExpired)

  // Süresi geçenleri periyodik temizle (state'te 1 saat).
  useEffect(() => {
    prune()
    const id = setInterval(prune, 60_000)
    return () => clearInterval(id)
  }, [prune])

  if (!hydrated || history.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4" />
        {t("historyTitle")}
      </span>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {history.map((h) => (
            <motion.div
              key={h.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-3 rounded-xl border bg-card/40 p-2.5"
            >
              {h.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxiedThumb(h.thumbnail)}
                  alt=""
                  className="aspect-video w-20 shrink-0 rounded-lg object-cover"
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{h.title}</span>
                <span className="text-xs text-muted-foreground">
                  {h.kind === "video"
                    ? `${h.quality}p`
                    : h.kind === "audio"
                      ? h.quality.toUpperCase()
                      : h.kind === "thumbnail"
                        ? t("thumbnail")
                        : h.kind === "carousel"
                          ? "ZIP"
                          : h.kind === "profile"
                            ? t("igProfileTitle")
                            : t("igPhotoTitle")}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("save")}
                onClick={() => triggerDownload(`/api/file/${h.token}`, h.filename)}
              >
                <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReload(h)}
                className="text-xs"
              >
                {t("otherFormat")}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(h.id)}
                title={t("remove")}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

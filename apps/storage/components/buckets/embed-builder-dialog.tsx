"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"

interface EmbedBuilderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Public media id — embed page lives at `/embed/<mediaId>`. */
  mediaId: string
  /** Used as a sensible default for the iframe sizing — videos
   *  pick 16:9, audio picks the slim strip. */
  kind: "video" | "audio"
  /** Public storage origin — falls back to the current window
   *  origin so local dev still works without env. */
  storageOrigin?: string
}

/**
 * YouTube-style embed builder. Toggle player options (autoplay /
 * loop / muted / controls / start time), set iframe dimensions,
 * watch the live preview, copy the resulting `<iframe>` snippet.
 *
 * URL params encoded into the iframe `src` so the embed page can
 * parse them server-side (`apps/storage/app/embed/[id]/page.tsx`):
 *
 *   ?autoplay=1   start playback immediately (browsers mute it)
 *   ?loop=1       wrap-around at the end
 *   ?muted=1      start muted
 *   ?start=42     jump to N seconds on load
 *   ?controls=0   hide all chrome
 */
export function EmbedBuilderDialog({
  open,
  onOpenChange,
  mediaId,
  kind,
  storageOrigin,
}: EmbedBuilderDialogProps) {
  const t = useTranslations("storage")

  const isVideo = kind === "video"
  const [width, setWidth] = useState(isVideo ? 640 : 600)
  const [height, setHeight] = useState(isVideo ? 360 : 180)
  const [autoplay, setAutoplay] = useState(false)
  const [loop, setLoop] = useState(false)
  const [muted, setMuted] = useState(false)
  const [hideControls, setHideControls] = useState(false)
  const [start, setStart] = useState(0)
  const [copied, setCopied] = useState(false)

  // Resolve origin lazily — server pages don't have access to
  // window. Caller passes storageOrigin from env when known.
  const origin =
    storageOrigin?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "")

  const src = useMemo(() => {
    const params = new URLSearchParams()
    if (autoplay) params.set("autoplay", "1")
    if (loop) params.set("loop", "1")
    if (muted) params.set("muted", "1")
    if (hideControls) params.set("controls", "0")
    if (start > 0) params.set("start", String(start))
    const qs = params.toString()
    return `${origin}/embed/${mediaId}${qs ? `?${qs}` : ""}`
  }, [origin, mediaId, autoplay, loop, muted, hideControls, start])

  const snippet = useMemo(() => {
    return (
      `<iframe src="${src}" width="${width}" height="${height}" ` +
      `frameborder="0" allow="autoplay; fullscreen; picture-in-picture" ` +
      `allowfullscreen></iframe>`
    )
  }, [src, width, height])

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — text is still selectable in textarea */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("embedBuilder.title")}</DialogTitle>
          <DialogDescription>
            {t("embedBuilder.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Options */}
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">
                  {t("embedBuilder.width")}
                </Label>
                <Input
                  type="number"
                  min={120}
                  max={2400}
                  step={10}
                  value={width}
                  onChange={(e) =>
                    setWidth(
                      Math.max(120, Math.min(2400, Number(e.target.value) || 0)),
                    )
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">
                  {t("embedBuilder.height")}
                </Label>
                <Input
                  type="number"
                  min={80}
                  max={1600}
                  step={10}
                  value={height}
                  onChange={(e) =>
                    setHeight(
                      Math.max(80, Math.min(1600, Number(e.target.value) || 0)),
                    )
                  }
                />
              </div>
            </div>

            <ToggleRow
              label={t("embedBuilder.autoplay")}
              hint={t("embedBuilder.autoplayHint")}
              checked={autoplay}
              onChange={(v) => {
                setAutoplay(v)
                // Browsers force autoplay-with-sound to fail; flip
                // muted on so the play actually starts.
                if (v) setMuted(true)
              }}
            />
            <ToggleRow
              label={t("embedBuilder.loop")}
              checked={loop}
              onChange={setLoop}
            />
            <ToggleRow
              label={t("embedBuilder.muted")}
              checked={muted}
              onChange={setMuted}
            />
            <ToggleRow
              label={t("embedBuilder.hideControls")}
              hint={t("embedBuilder.hideControlsHint")}
              checked={hideControls}
              onChange={setHideControls}
            />

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">
                {t("embedBuilder.start")}
              </Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={start}
                onChange={(e) =>
                  setStart(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </div>
          </div>

          {/* Live preview — keyed on `src` so option changes
              re-load the iframe with the new params. Aspect-fit
              into the column with a neutral background. */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">
              {t("embedBuilder.preview")}
            </Label>
            <div className="overflow-hidden rounded-lg border bg-black">
              <iframe
                key={src}
                src={src}
                title="Embed preview"
                className="block w-full"
                style={{
                  aspectRatio: `${width} / ${height}`,
                }}
                allow="autoplay; fullscreen; picture-in-picture"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              {t("embedBuilder.snippet")}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={copy}
              className="h-7 gap-1 px-2 text-[11px]"
            >
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {copied ? t("embedBuilder.copied") : t("embedBuilder.copy")}
            </Button>
          </div>
          <textarea
            readOnly
            value={snippet}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="resize-none rounded-md border bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-snug text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("embedBuilder.close")}
          </Button>
          <Button onClick={copy}>
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {copied
              ? t("embedBuilder.copied")
              : t("embedBuilder.copySnippet")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-muted/20 p-2.5">
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium">{label}</span>
        {hint ? (
          <span className="text-[10.5px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </label>
  )
}

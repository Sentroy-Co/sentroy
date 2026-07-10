"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { Sentroy, pickPresetThumbnailUrl, type Media } from "@sentroy-co/client-sdk"
import { MediaManagerTrigger } from "@sentroy-co/client-sdk/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ImageUpload01Icon,
  Cancel01Icon,
  Loading03Icon,
  Sent02Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import {
  RichEditor,
  type RichEditorHandle,
  type RichEditorValue,
} from "@workspace/console/components/social/rich-editor"

type Visibility = "public" | "members" | "admins" | "author"
const VISIBILITY_ORDER: Visibility[] = ["members", "public", "admins", "author"]

const MAX_TEXT = 1000
const MAX_ATTACHMENTS = 4

interface DraftAttachment {
  mediaId: string
  url: string
  width?: number
  height?: number
}

interface PostComposerProps {
  /** When provided the composer renders as a quote-style mini composer
   *  with an embedded source preview. The publish call sends `repostOf`
   *  pointing at this post. */
  repostOf?: { id: string }
  /** Optional viewer avatar shown inline. */
  viewerAvatarUrl?: string | null
  viewerName?: string | null
  /** Sentroy client for the MediaManager picker. Pass the company-bound
   *  client created by the parent — composer is presentational and does
   *  not own credentials. */
  sentroyClient: Sentroy | null
  /** `@mention` autocomplete endpoint — `?q=` ile çağrılır
   *  (örn. `/api/companies/<slug>/mention-search`). */
  mentionSearchUrl: string
  /** Async submit handler — must throw on failure so the composer can
   *  keep the draft text and re-enable the button. */
  onSubmit: (input: {
    text: string
    bodyHtml: string
    mentions: string[]
    visibility: Visibility
    attachments: DraftAttachment[]
    repostOf?: string
  }) => Promise<void>
  /** Optional auto-focus on mount (used in detail page where the user
   *  almost certainly wants to start typing). */
  autoFocus?: boolean
  placeholder?: string
  className?: string
}

/**
 * Twitter-style composer with image attach via MediaManager. Plain text
 * up to 1000 chars; attachments capped at 4. The composer is fully
 * controlled internally — parent only provides submit + sentroy client.
 */
export function PostComposer({
  repostOf,
  sentroyClient,
  mentionSearchUrl,
  onSubmit,
  autoFocus,
  placeholder,
  className,
}: PostComposerProps) {
  const t = useTranslations("social")
  const [rich, setRich] = useState<RichEditorValue>({
    html: "",
    text: "",
    mentions: [],
  })
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>("members")
  const editorRef = useRef<RichEditorHandle>(null)

  const visibilityLabel: Record<Visibility, string> = {
    public: t("visibilityPublic"),
    members: t("visibilityMembers"),
    admins: t("visibilityAdmins"),
    author: t("visibilityAuthor"),
  }

  const remaining = MAX_TEXT - rich.text.length
  const overLimit = remaining < 0
  const trimmed = rich.text.trim()
  const canSubmit =
    !submitting &&
    !overLimit &&
    (trimmed.length > 0 || attachments.length > 0 || !!repostOf)

  const placeholderResolved = placeholder ?? t("composerPlaceholder")

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus()
  }, [autoFocus])

  const handleAttachPick = useCallback(
    (media: Media[]) => {
      const next = [...attachments]
      let skipped = false
      for (const m of media) {
        if (next.length >= MAX_ATTACHMENTS) break
        // MediaManager kendi thumbnail'ında da bunu kullanır: public bucket
        // → durable CDN url; değilse downloadUrl. `m.url` private bucket'ta
        // undefined geldiği için doğrudan kullanılamaz (boş src + POST reddi).
        const url =
          pickPresetThumbnailUrl(m, "preview") ?? m.url ?? m.downloadUrl
        if (!url) {
          skipped = true
          continue
        }
        if (next.some((a) => a.mediaId === m.id || a.url === url)) continue
        next.push({
          mediaId: m.id,
          url,
          width: m.imageMeta?.width,
          height: m.imageMeta?.height,
        })
      }
      if (skipped) toast.error(t("attachNoUrl"))
      setAttachments(next)
    },
    [attachments, t],
  )

  const removeAttachment = useCallback((url: string) => {
    setAttachments((prev) => prev.filter((a) => a.url !== url))
  }, [])

  const submit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit({
        text: trimmed,
        bodyHtml: rich.html,
        mentions: rich.mentions,
        visibility,
        attachments,
        repostOf: repostOf?.id,
      })
      setRich({ html: "", text: "", mentions: [] })
      setAttachments([])
      editorRef.current?.clear()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("composerFailed"))
    } finally {
      setSubmitting(false)
    }
  }, [attachments, canSubmit, onSubmit, repostOf?.id, t, trimmed, rich.html, rich.mentions, visibility])

  const counterClass = useMemo(() => {
    if (overLimit) return "text-destructive"
    if (remaining < 50) return "text-amber-600 dark:text-amber-400"
    return "text-muted-foreground"
  }, [overLimit, remaining])

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <div
            onKeyDownCapture={(e) => {
              // Cmd/Ctrl+Enter submits — common Twitter affordance.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault()
                void submit()
              }
            }}
          >
            <RichEditor
              ref={editorRef}
              mentionSearchUrl={mentionSearchUrl}
              placeholder={placeholderResolved}
              onChange={setRich}
              disabled={submitting}
            />
          </div>
          {attachments.length > 0 && (
            <div
              className={cn(
                "grid gap-2",
                attachments.length === 1 && "grid-cols-1",
                attachments.length === 2 && "grid-cols-2",
                (attachments.length === 3 || attachments.length === 4) &&
                  "grid-cols-2",
              )}
            >
              <AnimatePresence>
                {attachments.map((a) => (
                  <motion.div
                    key={a.url}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.18 }}
                    className="group/attach relative aspect-video overflow-hidden rounded-xl border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.url)}
                      className="absolute end-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/attach:opacity-100"
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-1">
          {/* Gizlilik seçici — manuel label (SelectValue kullanma, §5.1) */}
          <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
            <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground">
              <span>{visibilityLabel[visibility]}</span>
            </SelectTrigger>
            <SelectContent>
              {VISIBILITY_ORDER.map((v) => (
                <SelectItem key={v} value={v}>
                  {visibilityLabel[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sentroyClient && (
            <MediaManagerTrigger
              client={sentroyClient}
              accept="image/*"
              maxItems={MAX_ATTACHMENTS - attachments.length}
              title={t("attachPickerTitle")}
              description={t("attachPickerDesc")}
              confirmLabel={t("attachPickerConfirm")}
              onSelect={(media) => handleAttachPick(media)}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                  aria-label={t("attachImages")}
                >
                  <HugeiconsIcon
                    icon={ImageUpload01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </Button>
              }
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className={cn("text-xs tabular-nums", counterClass)}>
            {remaining}
          </span>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-full"
          >
            {submitting ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="size-3.5 animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <HugeiconsIcon
                icon={Sent02Icon}
                strokeWidth={2}
                className="size-3.5"
                data-icon="inline-start"
              />
            )}
            {repostOf ? t("repostAction") : t("publish")}
          </Button>
        </div>
      </div>
    </div>
  )
}

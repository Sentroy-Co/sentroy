"use client"

// Triage app/components/tasks/task-comment-composer.tsx portu (PLAN §6).
// Not: fetcher.Form + requestSubmit yerine FormData'yı elle kurup
// fetcher.submit çağırıyoruz — shim'in Form bileşeni ref forward etmiyor.
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Cancel01FreeIcons } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { useFetcher } from "@/lib/router-compat"
import { MorphButton } from "@/components/motion/morph-button"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/editor/rich-text-editor"
import { normalizeActionResult, type FetcherResult } from "./action-result"

type Props = {
  issueId: string
  /**
   * Set edilirse composer bu yorum id'sine yanıt olarak post eder.
   * UI küçük bir "Yanıt: <önizleme>" başlığı + onCancel ile iptal butonu gösterir.
   */
  parentCommentId?: string
  parentPreview?: string
  onCancel?: () => void
  /**
   * Mount olunca otomatik focus (inline yanıt modunda kullanılır).
   */
  autoFocus?: boolean
  /**
   * Form action hedefi. Varsayılan olarak `/tasks/${issueId}` — böylece
   * composer hangi route'tan render edilirse edilsin (detay sayfası, Inbox
   * thread'i vb.) yorum doğru issue'nun action'ına gider, mevcut route'a değil.
   */
  action?: string
}

export function TaskCommentComposer({
  issueId,
  parentCommentId,
  parentPreview,
  onCancel,
  autoFocus = false,
  action,
}: Props) {
  const postAction = action ?? `/tasks/${issueId}`
  const fetcher = useFetcher<FetcherResult>()
  const t = useTranslations("linearLite")
  const submitting = fetcher.state !== "idle"
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    const data = normalizeActionResult<FetcherResult>(fetcher.data)
    if (!data) return
    if (data.ok) {
      toast.success(t("common.updated"))
      setValue("")
      editorRef.current?.applyContent("", "replace")
      if (parentCommentId && onCancel) onCancel()
    } else if (data.error) {
      toast.error(data.error)
    }
  }, [fetcher.data, t, parentCommentId, onCancel])

  const canSubmit = value.trim().length > 0 && !submitting
  const onSubmit = () => {
    if (!canSubmit) return
    const form = new FormData()
    form.set("intent", "comment")
    form.set("issueId", issueId)
    form.set("body", value)
    if (parentCommentId) form.set("parentId", parentCommentId)
    void fetcher.submit(form, { method: "post", action: postAction })
  }

  return (
    <div className="flex flex-col gap-0 rounded-2xl border border-border/60 bg-card transition-colors focus-within:border-border focus-within:ring-2 focus-within:ring-ring/15">
      {parentCommentId && parentPreview ? (
        <div className="flex items-start gap-2 border-b border-border/40 px-3 py-1.5 text-[11px]">
          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[9px] tracking-tight text-muted-foreground uppercase">
            {t("tasks.detail.replyBadge")}
          </span>
          <span className="line-clamp-1 flex-1 text-muted-foreground">
            {parentPreview}
          </span>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              aria-label={t("tasks.detail.cancelReply")}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon
                icon={Cancel01FreeIcons as IconSvgElement}
                size={11}
                strokeWidth={2}
              />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="px-4 pt-3 pb-2">
        <RichTextEditor
          ref={editorRef}
          value={value}
          onChange={setValue}
          onSubmit={onSubmit}
          placeholder={
            parentCommentId
              ? t("tasks.detail.replyPlaceholder")
              : t("tasks.detail.addComment")
          }
          ariaLabel={
            parentCommentId
              ? t("tasks.detail.replyAria")
              : t("tasks.detail.addCommentAria")
          }
          minHeight={parentCommentId ? 56 : 72}
          maxHeight={320}
          contentClassName="text-sm"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
        <KbdGroup className="text-[10px] text-muted-foreground">
          <span className="mr-1">{t("tasks.detail.sendComment")}</span>
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </KbdGroup>
        <MorphButton
          submitting={submitting}
          type="button"
          size="sm"
          layoutId={`comment-cta-${parentCommentId ?? issueId}`}
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {t("tasks.detail.sendComment")}
        </MorphButton>
      </div>
    </div>
  )
}

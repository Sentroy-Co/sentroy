"use client"

// Triage app/components/tasks/create-related-dialog.tsx portu (PLAN §6).
import { useEffect, useRef, useState } from "react"
import NextLink from "next/link"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  TaskAdd01FreeIcons,
  ArrowDownRight01FreeIcons,
  ArrowUpLeft01FreeIcons,
  CancelCircleFreeIcons,
  MinusSignCircleFreeIcons,
  LinkSquare02FreeIcons,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { useDashPaths, useFetcher } from "@/lib/router-compat"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { MorphButton } from "@/components/motion/morph-button"
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/editor/rich-text-editor"
import { normalizeActionResult, type ActionResult } from "./action-result"

export type RelatedKind =
  | "issue"
  | "sub"
  | "parent"
  | "blocking"
  | "blocked"
  | "related"

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  kind: RelatedKind
  sourceIssueId: string
  sourceIdentifier?: string
  /**
   * Set edilirse action buraya POST eder. Kaynak issue'nun route'unu
   * (örn. `/tasks/abc`) kullan ki sahiplik kontrolü geçsin; verilmezse
   * mevcut URL'e düşer.
   */
  action?: string
  prefillTitle?: string
  prefillDescription?: string
}

const META: Record<
  RelatedKind,
  {
    icon: IconSvgElement
    tone: string
  }
> = {
  issue: {
    icon: TaskAdd01FreeIcons as IconSvgElement,
    tone: "text-foreground",
  },
  sub: {
    icon: ArrowDownRight01FreeIcons as IconSvgElement,
    tone: "text-foreground",
  },
  parent: {
    icon: ArrowUpLeft01FreeIcons as IconSvgElement,
    tone: "text-foreground",
  },
  blocking: {
    icon: MinusSignCircleFreeIcons as IconSvgElement,
    tone: "text-amber-600 dark:text-amber-400",
  },
  blocked: {
    icon: CancelCircleFreeIcons as IconSvgElement,
    tone: "text-amber-600 dark:text-amber-400",
  },
  related: {
    icon: LinkSquare02FreeIcons as IconSvgElement,
    tone: "text-foreground",
  },
}

export function CreateRelatedDialog({
  open,
  onOpenChange,
  kind,
  sourceIssueId,
  sourceIdentifier,
  action,
  prefillTitle = "",
  prefillDescription = "",
}: Props) {
  const fetcher = useFetcher<ActionResult>()
  const t = useTranslations("linearLite")
  // Toast içeriği sonner portal'ında render edilir (DashRouterProvider dışı
  // olabilir) — bu yüzden href'i burada çözüp düz NextLink kullanıyoruz.
  const { href } = useDashPaths()
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [title, setTitle] = useState(prefillTitle)
  const [description, setDescription] = useState(prefillDescription)
  const submitting = fetcher.state !== "idle"
  const meta = META[kind]

  // Dialog (yeniden) açıldığında resetle/prefill'le — kind/kaynak değişmiş olabilir.
  useEffect(() => {
    if (!open) return
    setTitle(prefillTitle)
    setDescription(prefillDescription)
    editorRef.current?.applyContent(prefillDescription, "replace")
  }, [open, prefillTitle, prefillDescription])

  useEffect(() => {
    if (submitting) return
    const data = normalizeActionResult<ActionResult>(fetcher.data)
    if (!data) return
    if (data.ok && data.issueId) {
      toast.success(
        <span className="flex items-center gap-2">
          {t(`tasks.createRelated.${kind}Created`)}
          <NextLink
            href={href(`/tasks/${data.issueId}`)}
            className="text-xs underline underline-offset-2"
          >
            {data.identifier} →
          </NextLink>
        </span>,
      )
      onOpenChange(false)
    } else if (!data.ok && data.error) {
      toast.error(data.error)
    }
  }, [fetcher.data, submitting, onOpenChange, t, kind, href])

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return
    if (title.trim().length < 3) {
      toast.error(t("tasks.titleMinError"))
      return
    }
    const form = new FormData()
    form.set("intent", "create-related")
    form.set("kind", kind)
    form.set("issueId", sourceIssueId)
    form.set("title", title.trim())
    form.set("description", description)
    void fetcher.submit(form, { method: "post", action })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={meta.tone}>
              <HugeiconsIcon icon={meta.icon} size={16} strokeWidth={2} />
            </span>
            {t(`tasks.createRelated.${kind}Title`)}
          </DialogTitle>
          <DialogDescription>
            {t(`tasks.createRelated.${kind}Desc`)}
            {sourceIdentifier ? (
              <>
                {" "}
                {t("tasks.createRelated.source")}{" "}
                <span className="font-mono text-foreground">
                  {sourceIdentifier}
                </span>
                .
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rel-title">
              {t("tasks.createRelated.titleLabel")}
            </Label>
            <Input
              id="rel-title"
              type="text"
              required
              minLength={3}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("tasks.createRelated.titlePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rel-desc">
              {t("tasks.createRelated.descLabel")}
            </Label>
            <div className="rounded-lg border border-border/60 bg-background px-3 py-2 focus-within:border-border focus-within:ring-2 focus-within:ring-ring/15">
              <RichTextEditor
                ref={editorRef}
                value={description}
                onChange={setDescription}
                placeholder={t("tasks.createRelated.descPlaceholder")}
                minHeight={88}
                maxHeight={280}
                contentClassName="text-sm"
                ariaLabel={t("tasks.createRelated.descLabel")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <MorphButton submitting={submitting} type="submit" size="sm">
              {t("tasks.createRelated.submit")}
            </MorphButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

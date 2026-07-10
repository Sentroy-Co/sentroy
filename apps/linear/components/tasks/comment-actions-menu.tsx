"use client"

// Triage app/components/tasks/comment-actions-menu.tsx portu (PLAN §6).
import { useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  MoreHorizontalFreeIcons,
  TaskAdd01FreeIcons,
  ArrowDownRight01FreeIcons,
  Copy01FreeIcons,
  Edit02FreeIcons,
  Delete02FreeIcons,
  ArrowDownRightFreeIcons,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  CreateRelatedDialog,
  type RelatedKind,
} from "./create-related-dialog"
import { cn } from "@workspace/ui/lib/utils"
import type { IssueComment } from "@/lib/linear/types"

type Props = {
  comment: IssueComment
  sourceIssueId: string
  sourceIdentifier?: string
  onReply?: () => void
  onEdit?: () => void
  onDelete?: () => void
  className?: string
}

function firstLine(body: string, max = 80): string {
  const cleaned = body.replace(/\s+/g, " ").trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max).trimEnd() + "…"
}

export function CommentActionsMenu({
  comment,
  sourceIssueId,
  sourceIdentifier,
  onReply,
  onEdit,
  onDelete,
  className,
}: Props) {
  const t = useTranslations("linearLite")
  const [createKind, setCreateKind] = useState<RelatedKind | null>(null)

  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(comment.body)
      toast.success(t("tasks.comments.copied"))
    } catch {
      toast.error(t("tasks.menu.clipboardError"))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("tasks.comments.menuAria")}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              className,
            )}
          >
            <HugeiconsIcon
              icon={MoreHorizontalFreeIcons as IconSvgElement}
              size={12}
              strokeWidth={2}
            />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56">
        {onReply ? (
          <DropdownMenuItem onClick={onReply}>
            <HugeiconsIcon
              icon={ArrowDownRightFreeIcons as IconSvgElement}
              size={13}
              strokeWidth={2}
            />
            {t("tasks.comments.reply")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => setCreateKind("issue")}>
          <HugeiconsIcon
            icon={TaskAdd01FreeIcons as IconSvgElement}
            size={13}
            strokeWidth={2}
          />
          {t("tasks.comments.createFromComment")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setCreateKind("sub")}>
          <HugeiconsIcon
            icon={ArrowDownRight01FreeIcons as IconSvgElement}
            size={13}
            strokeWidth={2}
          />
          {t("tasks.comments.createSubFromComment")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {onEdit ? (
          <DropdownMenuItem onClick={onEdit}>
            <HugeiconsIcon
              icon={Edit02FreeIcons as IconSvgElement}
              size={13}
              strokeWidth={2}
            />
            {t("common.edit")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={copyBody}>
          <HugeiconsIcon
            icon={Copy01FreeIcons as IconSvgElement}
            size={13}
            strokeWidth={2}
          />
          {t("tasks.comments.copyComment")}
        </DropdownMenuItem>
        {onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <HugeiconsIcon
                icon={Delete02FreeIcons as IconSvgElement}
                size={13}
                strokeWidth={2}
              />
              {t("common.delete")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>

      <CreateRelatedDialog
        open={createKind !== null}
        onOpenChange={(v) => {
          if (!v) setCreateKind(null)
        }}
        kind={createKind ?? "issue"}
        sourceIssueId={sourceIssueId}
        sourceIdentifier={sourceIdentifier}
        action={`/tasks/${sourceIssueId}`}
        prefillTitle={firstLine(comment.body)}
        prefillDescription={comment.body}
      />
    </DropdownMenu>
  )
}

"use client"

// Triage app/components/tasks/comment-context-menu.tsx portu (PLAN §6).
import { useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  TaskAdd01FreeIcons,
  ArrowDownRight01FreeIcons,
  Copy01FreeIcons,
  Edit02FreeIcons,
  Delete02FreeIcons,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  CreateRelatedDialog,
  type RelatedKind,
} from "./create-related-dialog"
import type { IssueComment } from "@/lib/linear/types"

type Props = {
  comment: IssueComment
  sourceIssueId: string
  sourceIdentifier?: string
  onEdit?: () => void
  onDelete?: () => void
  children: React.ReactNode
}

function firstLine(body: string, max = 80): string {
  const cleaned = body.replace(/\s+/g, " ").trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max).trimEnd() + "…"
}

export function CommentContextMenu({
  comment,
  sourceIssueId,
  sourceIdentifier,
  onEdit,
  onDelete,
  children,
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
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        <ContextMenuItem onClick={() => setCreateKind("issue")}>
          <HugeiconsIcon
            icon={TaskAdd01FreeIcons as IconSvgElement}
            size={14}
            strokeWidth={2}
          />
          {t("tasks.comments.createFromComment")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setCreateKind("sub")}>
          <HugeiconsIcon
            icon={ArrowDownRight01FreeIcons as IconSvgElement}
            size={14}
            strokeWidth={2}
          />
          {t("tasks.comments.createSubFromComment")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {onEdit ? (
          <ContextMenuItem onClick={onEdit}>
            <HugeiconsIcon
              icon={Edit02FreeIcons as IconSvgElement}
              size={14}
              strokeWidth={2}
            />
            {t("common.edit")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onClick={copyBody}>
          <HugeiconsIcon
            icon={Copy01FreeIcons as IconSvgElement}
            size={14}
            strokeWidth={2}
          />
          {t("tasks.comments.copyComment")}
        </ContextMenuItem>
        {onDelete ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <HugeiconsIcon
                icon={Delete02FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("common.delete")}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>

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
    </ContextMenu>
  )
}

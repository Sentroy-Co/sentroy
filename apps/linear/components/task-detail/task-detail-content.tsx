"use client"

// Triage app/routes/tasks.$id.tsx default component'inin client portu
// (PLAN §3/§6). Loader verisi server page'den props olarak gelir; canlılık
// useAutoRevalidate (30s poll + focus/visible) ve useLinearSync (SSE,
// webhook-tabanlı) ikilisiyle sağlanır.
import { useCallback } from "react"
import { useTranslations } from "next-intl"

import { FadeIn } from "@/components/motion/fade-in"
import { TaskBreadcrumb } from "@/components/tasks/task-breadcrumb"
import { TaskDetail } from "@/components/tasks/task-detail"
import { AddSubTaskButton } from "@/components/tasks/add-sub-task-button"
import { TaskChildrenList } from "@/components/tasks/task-children-list"
import { TaskActivity } from "@/components/tasks/task-activity"
import { TaskAttachmentDialog } from "@/components/tasks/task-attachment-dialog"
import { TaskCommentComposer } from "@/components/tasks/task-comment-composer"
import { useAutoRevalidate } from "@/hooks/use-auto-revalidate"
import { useLinearSync, type SyncEvent } from "@/hooks/use-linear-sync"
import type {
  Issue,
  IssueAttachment,
  IssueChildRef,
  IssueComment,
  IssueHistoryEvent,
  IssueLabel,
  IssueState,
  IssueUser,
} from "@/lib/linear/types"

type Props = {
  issue: Issue
  comments: IssueComment[]
  attachments: IssueAttachment[]
  history: IssueHistoryEvent[]
  /** Alt talepler — React'in `children` prop'uyla çakışmasın diye bu ad. */
  childIssues: IssueChildRef[]
  cleanDescription: string
  states: IssueState[]
  labels: IssueLabel[]
  users: IssueUser[]
  showStatus: boolean
  showAssignee: boolean
  showLabels: boolean
  showLinkedIssues: boolean
}

export function TaskDetailContent({
  issue,
  comments,
  attachments,
  history,
  childIssues,
  cleanDescription,
  states,
  labels,
  users,
  showStatus,
  showAssignee,
  showLabels,
  showLinkedIssues,
}: Props) {
  const t = useTranslations("linearLite")

  // Linear yan-tarafta düzenleme yapılırsa otomatik yansıt. Sekmeye
  // dönüldüğünde anında, açıkken her 30s'de bir server verisi yenilenir.
  useAutoRevalidate({ intervalMs: 30_000 })

  // Webhook-tabanlı SSE: yalnız bu issue'yu ilgilendiren event'lerde
  // revalidate (issueId'siz genel event'ler de tetikler — güvenli taraf).
  const shouldRefresh = useCallback(
    (event: SyncEvent) => !event.issueId || event.issueId === issue.id,
    [issue.id],
  )
  useLinearSync({ shouldRefresh })

  const activityCount = comments.length + attachments.length

  return (
    <FadeIn className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <TaskBreadcrumb issue={issue} />
      <TaskDetail
        issue={issue}
        cleanDescription={cleanDescription}
        states={states}
        labels={labels}
        users={users}
        showStatus={showStatus}
        showAssignee={showAssignee}
        showLabels={showLabels}
      />
      {showLinkedIssues ? <AddSubTaskButton issueId={issue.id} /> : null}
      {/* Prop adı `children` (triage parity) — react/no-children-prop
          lint kuralına takılmamak için JSX children olarak geçilir. */}
      <TaskChildrenList>{childIssues}</TaskChildrenList>
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("tasks.detail.activity")}{" "}
            <span className="text-xs">({activityCount})</span>
          </h2>
          <TaskAttachmentDialog issueId={issue.id} />
        </div>
        <TaskActivity
          comments={comments}
          history={history}
          attachments={attachments}
          issueId={issue.id}
          issueIdentifier={issue.identifier}
        />
        <TaskCommentComposer issueId={issue.id} />
      </section>
    </FadeIn>
  )
}

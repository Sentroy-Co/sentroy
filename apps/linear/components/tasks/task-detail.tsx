"use client"

// Triage app/components/tasks/task-detail.tsx portu (PLAN §6).
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { useFetcher } from "@/lib/router-compat"
import { TaskStatusBadge } from "./task-status-badge"
import { TaskPriorityIcon } from "./task-priority-icon"
import { TaskContextMenu } from "./task-context-menu"
import { TaskActionsMenu } from "./task-actions-menu"
import { TaskDetailChips } from "./task-detail-chips"
import { normalizeActionResult, type FetcherResult } from "./action-result"
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/editor/rich-text-editor"
import type {
  Issue,
  IssueLabel,
  IssueState,
  IssueUser,
} from "@/lib/linear/types"

export type TaskDetailHandle = {
  startEdit: () => void
}

type Props = {
  issue: Issue
  cleanDescription: string
  states?: IssueState[]
  labels?: IssueLabel[]
  users?: IssueUser[]
  showStatus?: boolean
  showAssignee?: boolean
  showLabels?: boolean
}

export const TaskDetail = forwardRef<TaskDetailHandle, Props>(
  function TaskDetail(
    {
      issue,
      cleanDescription,
      states,
      labels,
      users,
      showStatus = true,
      showAssignee = true,
      showLabels = true,
    },
    ref,
  ) {
    const t = useTranslations("linearLite")
    const fetcher = useFetcher<FetcherResult>()
    const titleRef = useRef<HTMLInputElement>(null)
    const editorRef = useRef<RichTextEditorHandle>(null)
    const [title, setTitle] = useState(issue.title)
    const [body, setBody] = useState(cleanDescription)

    // Hangi alanların dirty olduğunu izle — blur PATCH'e karar verir.
    const lastSavedTitle = useRef(issue.title)
    const lastSavedBody = useRef(cleanDescription)

    useImperativeHandle(ref, () => ({
      startEdit: () => titleRef.current?.focus(),
    }))

    // Revalidate sonrası loader'dan senkronize et — ama sadece aktif olarak
    // düzenlemediğimiz alanlar için (lastSaved == issue değeri ⇒ resetlemek güvenli).
    useEffect(() => {
      if (lastSavedTitle.current === issue.title) setTitle(issue.title)
      lastSavedTitle.current = issue.title
    }, [issue.title])

    useEffect(() => {
      if (lastSavedBody.current === cleanDescription) setBody(cleanDescription)
      lastSavedBody.current = cleanDescription
    }, [cleanDescription])

    useEffect(() => {
      const data = normalizeActionResult<FetcherResult>(fetcher.data)
      if (!data) return
      if (data.ok === false && data.error) toast.error(data.error)
    }, [fetcher.data])

    const persist = (patch: { title?: string; description?: string }) => {
      const form = new FormData()
      form.set("intent", "edit-issue")
      form.set(
        "title",
        patch.title ?? lastSavedTitle.current ?? issue.title,
      )
      form.set(
        "description",
        patch.description ?? lastSavedBody.current ?? cleanDescription,
      )
      void fetcher.submit(form, { method: "post" })
    }

    // Canlı DOM değerini oku, state snapshot'ını değil — React controlled-input
    // güncellemeleri kuyruklanır; blur öncesi son tuş vuruşunu event target yansıtır.
    const commitTitle = (raw: string) => {
      const next = raw.trim()
      if (next.length < 3) {
        setTitle(lastSavedTitle.current)
        toast.error(t("tasks.titleMinError"))
        return
      }
      if (next === lastSavedTitle.current) return
      lastSavedTitle.current = next
      persist({ title: next })
    }

    const commitBody = (raw: string) => {
      if (raw === lastSavedBody.current) return
      lastSavedBody.current = raw
      persist({ description: raw })
    }

    const content = (
      <motion.article
        layoutId={`task-${issue.id}`}
        className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-6"
      >
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
              {issue.identifier}
            </span>
            {states && labels && users ? (
              <TaskDetailChips
                issue={issue}
                states={states}
                labels={labels}
                users={users}
                showStatus={showStatus}
                showAssignee={showAssignee}
                showLabels={showLabels}
              />
            ) : (
              <>
                {showStatus ? <TaskStatusBadge state={issue.state} /> : null}
                <TaskPriorityIcon priority={issue.priority} showLabel />
              </>
            )}
            <span className="ml-1 text-[11px] text-muted-foreground">
              {issue.team.name}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <input
              ref={titleRef}
              type="text"
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => commitTitle(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                  editorRef.current?.focus()
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  setTitle(lastSavedTitle.current)
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              aria-label={t("tasks.detail.titleAria")}
              className="-mx-2 flex-1 rounded-md border-0 bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight break-words text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors hover:bg-accent/30 focus:bg-accent/40"
            />
            {states && labels ? (
              <TaskActionsMenu
                issue={issue}
                states={states}
                labels={labels}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {fetcher.state !== "idle" ? (
              <span className="text-muted-foreground/70">
                {t("common.saving")}
              </span>
            ) : null}
          </div>
          {showLabels && (!states || !labels || !users) ? (
            issue.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {issue.labels.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    {l.name}
                  </span>
                ))}
              </div>
            ) : null
          ) : null}
        </header>
        <div className="border-t border-border/40 pt-4">
          <div
            // Native focusout (bubble'lanır) TipTap'ın kendi blur event'inden
            // daha güvenilir; focus wrapper'dan çıktığında commit et.
            onBlur={(e) => {
              const next = e.currentTarget as HTMLElement
              const incoming = e.relatedTarget as Node | null
              if (incoming && next.contains(incoming)) return
              commitBody(body)
            }}
            className="-mx-2 rounded-lg px-2 py-1 transition-colors hover:bg-accent/20 focus-within:bg-accent/20"
          >
            <RichTextEditor
              ref={editorRef}
              value={body}
              onChange={setBody}
              onBlur={commitBody}
              placeholder={t("tasks.detail.descriptionPlaceholder")}
              minHeight={120}
              maxHeight={520}
              contentClassName="text-sm"
              ariaLabel={t("tasks.detail.descriptionAria")}
            />
          </div>
        </div>
      </motion.article>
    )

    if (!states || !labels) return content

    return (
      <TaskContextMenu issue={issue} states={states} labels={labels}>
        {content}
      </TaskContextMenu>
    )
  },
)

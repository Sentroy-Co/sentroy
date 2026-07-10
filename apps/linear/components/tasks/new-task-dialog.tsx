"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { useFetcher, useNavigate } from "@/lib/router-compat"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { TaskForm } from "./task-form"
import { normalizeActionResult } from "./action-result"
import { useDraftConfirm } from "@/hooks/use-draft-confirm"
import type {
  IssueLabel,
  IssueState,
  IssueTeam,
  IssueTemplate,
  IssueUser,
} from "@/lib/linear/types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Yeni-talep form payload'u — triage'da tasks.new route loader'ı döndürüyordu.
 * Linear Lite'ta `GET ${apiBase}/issues` bu payload'u döner (jsonSuccess
 * zarfı normalizeActionResult ile açılır).
 */
export type NewTaskFormPayload =
  | {
      ok: true
      teams: IssueTeam[]
      defaultTeamId: string
      defaultStateId: string | null
      defaultStateName: string | null
      statesByTeam: Record<string, IssueState[]>
      labelsByTeam: Record<string, IssueLabel[]>
      templatesByTeam: Record<string, IssueTemplate[]>
      users: IssueUser[]
      showStatus: boolean
      showAssignee: boolean
      showLabels: boolean
    }
  | { ok: false; error: string }

/**
 * Wraps the new-task form as a dialog. We fetch the form payload via
 * useFetcher().load() so we don't duplicate data-fetching logic; the same
 * teams/states/labels/users/templates payload flows in.
 */
export function NewTaskDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("linearLite.tasks.new")
  const navigate = useNavigate()
  const fetcher = useFetcher<unknown>()
  const { confirmClose } = useDraftConfirm()

  // Load on first open; cache hangs around for re-opens.
  useEffect(() => {
    if (!open) return
    if (fetcher.state !== "idle") return
    if (!fetcher.data) void fetcher.load("/tasks/new")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const data = normalizeActionResult<NewTaskFormPayload>(fetcher.data)
  const loading = fetcher.state === "loading" && !data

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else void confirmClose(() => onOpenChange(false))
      }}
    >
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-full flex-col overflow-hidden p-0 gap-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pt-6 pb-4">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="text-xs">
            {t("dialog_description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          {loading ? (
            <div className="flex flex-col gap-3 px-6 py-5">
              <div className="h-9 animate-pulse rounded-md bg-muted" />
              <div className="h-24 animate-pulse rounded-md bg-muted" />
              <div className="h-8 animate-pulse rounded-md bg-muted/60" />
            </div>
          ) : data && data.ok ? (
            <TaskForm
              teams={data.teams}
              defaultTeamId={data.defaultTeamId}
              defaultStateId={data.defaultStateId}
              defaultStateName={data.defaultStateName}
              statesByTeam={data.statesByTeam}
              labelsByTeam={data.labelsByTeam}
              templatesByTeam={data.templatesByTeam}
              users={data.users}
              showStatus={data.showStatus}
              showAssignee={data.showAssignee}
              showLabels={data.showLabels}
              layout="dialog"
              onCreated={(issueId) => {
                onOpenChange(false)
                navigate(`/tasks/${issueId}`)
              }}
            />
          ) : data && !data.ok ? (
            <p className="px-6 py-5 text-sm text-destructive">{data.error}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

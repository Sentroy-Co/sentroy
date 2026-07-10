"use client"

/**
 * Yeni Talep sayfası içeriği (triage tasks.new.tsx default export portu).
 *
 * Loader verisi server component'ten (tasks/new/page.tsx) props ile gelir.
 * Başarıda TaskForm kendi içinde draft'ı temizler + `/tasks/{issueId}`e
 * navigate eder (onCreated verilmedi → varsayılan davranış).
 */

import { useTranslations } from "next-intl"
import { Link } from "@/lib/router-compat"
import { FadeIn } from "@/components/motion/fade-in"
import { TaskForm } from "@/components/tasks/task-form"
import { ErrorState } from "@/components/common/error-state"
import { useDraftConfirm } from "@/hooks/use-draft-confirm"
import type {
  IssueLabel,
  IssueParentRef,
  IssueState,
  IssueTeam,
  IssueTemplate,
  IssueUser,
} from "@/lib/linear/types"

export type NewTaskLoaderData =
  | {
      ok: true
      teams: IssueTeam[]
      defaultTeamId: string
      defaultStateId: string | null
      /** defaultStateName ayarı — takım değişince başlangıç durumunu isimle çözmek için. */
      defaultStateName: string | null
      /** Takım id → state'ler. Form seçili takımın setini gösterir. */
      statesByTeam: Record<string, IssueState[]>
      /** Takım id → etiketler. */
      labelsByTeam: Record<string, IssueLabel[]>
      /** Takım id → issue şablonları. */
      templatesByTeam: Record<string, IssueTemplate[]>
      users: IssueUser[]
      showStatus: boolean
      showAssignee: boolean
      showLabels: boolean
      parent: IssueParentRef | null
    }
  | {
      ok: false
      /** i18n anahtarı — linearLite.newTask.errors.* altında çözülür. */
      errorKey: "noTeams" | "loadFailed"
    }

export function NewTaskContent({ data }: { data: NewTaskLoaderData }) {
  const t = useTranslations("linearLite.newTask")
  const tTasks = useTranslations("linearLite.tasks")

  // Sayfadan çıkarken doldurulan taslak varsa "Sakla / Sil" sor.
  // (Next'te route-blocking yok; routeMode uyumluluk için etkisiz.)
  useDraftConfirm({ routeMode: true })

  const parent = data.ok ? data.parent : null

  return (
    <FadeIn className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {parent ? t("subTaskTitle") : tTasks("new.title")}
        </h1>
        {parent ? (
          <p className="text-xs text-muted-foreground">
            {t("parentLabel")}{" "}
            <Link
              to={`/tasks/${parent.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-accent/50"
            >
              {parent.identifier}
              <span className="font-sans text-[11px] text-muted-foreground">
                {parent.title}
              </span>
            </Link>
          </p>
        ) : null}
      </header>

      {data.ok ? (
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
          parentId={parent?.id ?? null}
        />
      ) : (
        <ErrorState description={t(`errors.${data.errorKey}`)} />
      )}
    </FadeIn>
  )
}

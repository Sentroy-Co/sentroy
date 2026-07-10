// Yeni-talep formu için ortak veri yükleyici. Hem server sayfası
// (app/[lang]/d/[company-slug]/tasks/new/page.tsx) hem dialog için GET
// endpoint'i (app/api/companies/[slug]/issues/route.ts) bunu kullanır —
// takım/state/label/şablon/kullanıcı seti + varsayılan takım ve başlangıç
// durumu tek yerde hesaplanır (triage tasks.new loader mantığı).
import type { LinearContext } from "./linear/context"
import {
  getLabelsByTeam,
  getStatesByTeam,
  getTeams,
  getTemplatesByTeam,
} from "./linear/metadata"
import { getAllLinearUsers } from "./linear/users"
import { getUiFlagsForCompany } from "./settings"
import type {
  IssueLabel,
  IssueState,
  IssueTeam,
  IssueTemplate,
  IssueUser,
} from "./linear/types"

export type NewTaskFormCore = {
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

export type NewTaskFormLoad =
  | ({ ok: true } & NewTaskFormCore)
  | { ok: false; errorKey: "noTeams" }

/**
 * Formun ihtiyaç duyduğu tüm metadata'yı yükler. `preferTeamId` verilirse
 * (örn. alt-talepte üst talebin takımı) varsayılan takım o olur; aksi halde
 * ctx.defaultTeamId, o da yoksa ilk takım. Hiç takım yoksa `noTeams`.
 */
export async function loadNewTaskForm(
  ctx: LinearContext,
  companyId: string,
  opts: { preferTeamId?: string | null } = {},
): Promise<NewTaskFormLoad> {
  const teams = await getTeams(ctx)
  const defaultTeamId =
    opts.preferTeamId ?? ctx.defaultTeamId ?? teams[0]?.id ?? ""
  if (!defaultTeamId) {
    return { ok: false, errorKey: "noTeams" }
  }

  const [statesByTeam, labelsByTeam, templatesByTeam, users, uiFlags] =
    await Promise.all([
      getStatesByTeam(ctx),
      getLabelsByTeam(ctx),
      getTemplatesByTeam(ctx),
      getAllLinearUsers(ctx),
      getUiFlagsForCompany(companyId),
    ])

  const defaultStateName = ctx.defaultStateName?.trim() || null
  const defaultStates = statesByTeam[defaultTeamId] ?? []
  const startState =
    (defaultStateName
      ? defaultStates.find(
          (s) => s.name.trim().toLowerCase() === defaultStateName.toLowerCase(),
        )
      : undefined) ??
    defaultStates.find((s) => s.type === "unstarted") ??
    defaultStates.find((s) => s.type === "backlog") ??
    defaultStates[0] ??
    null

  return {
    ok: true,
    teams,
    defaultTeamId,
    defaultStateId: startState?.id ?? null,
    defaultStateName,
    statesByTeam,
    labelsByTeam,
    templatesByTeam,
    users,
    showStatus: uiFlags.showStatus,
    showAssignee: uiFlags.showAssignee,
    showLabels: uiFlags.showLabels,
  }
}

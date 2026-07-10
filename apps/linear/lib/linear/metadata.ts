/**
 * Linear takım/state/etiket/şablon metadata'sı (triage metadata.server.ts
 * portu, ctx'li). Cache key'leri ctx.companyId ile prefix'lidir.
 */

import { cache, TTL } from "../cache"
import { linearGraphQL } from "./client"
import {
  TEAMS_QUERY,
  TEAM_LABELS_QUERY,
  TEAM_STATES_QUERY,
  TEAM_TEMPLATES_QUERY,
} from "./queries"
import type { LinearContext } from "./context"
import type {
  IssueLabel,
  IssueState,
  IssueTeam,
  IssueTemplate,
} from "./types"

export type { IssueTemplate } from "./types"

type TeamsResponse = { teams: { nodes: IssueTeam[] } }
type StatesResponse = { team: { states: { nodes: IssueState[] } } }
type RawLabel = {
  id: string
  name: string
  color: string
  isGroup?: boolean
  parent?: { id: string } | null
}
type LabelsResponse = { team: { labels: { nodes: RawLabel[] } } }

export async function getTeams(ctx: LinearContext): Promise<IssueTeam[]> {
  return cache.wrap(`${ctx.companyId}:linear:teams`, TTL.HOUR, async () => {
    const data = await linearGraphQL<TeamsResponse>(ctx, TEAMS_QUERY)
    return data.teams.nodes
  })
}

export async function getTeamStates(
  ctx: LinearContext,
  teamId: string,
): Promise<IssueState[]> {
  return cache.wrap(
    `${ctx.companyId}:linear:states:${teamId}`,
    TTL.QUARTER_HOUR,
    async () => {
      const data = await linearGraphQL<StatesResponse>(ctx, TEAM_STATES_QUERY, {
        teamId,
      })
      return data.team.states.nodes
    },
  )
}

type RawTemplate = {
  id: string
  name: string
  description: string | null
  type: string | null
  templateData: string | null
}
type TemplatesResponse = {
  team: { templates: { nodes: RawTemplate[] } | null } | null
}

export async function getTeamTemplates(
  ctx: LinearContext,
  teamId: string,
): Promise<IssueTemplate[]> {
  return cache.wrap(
    `${ctx.companyId}:linear:templates:${teamId}`,
    TTL.QUARTER_HOUR,
    async () => {
      const data = await linearGraphQL<TemplatesResponse>(
        ctx,
        TEAM_TEMPLATES_QUERY,
        { teamId },
      ).catch(() => null)
      const nodes = data?.team?.templates?.nodes ?? []
      return nodes
        .filter((t) => !t.type || t.type === "issue")
        .map((t): IssueTemplate => {
          let parsed: IssueTemplate["data"] = null
          if (t.templateData) {
            try {
              parsed = JSON.parse(t.templateData)
            } catch {
              parsed = null
            }
          }
          return {
            id: t.id,
            name: t.name,
            description: t.description,
            data: parsed,
          }
        })
    },
  )
}

export async function getTeamLabels(
  ctx: LinearContext,
  teamId: string,
): Promise<IssueLabel[]> {
  return cache.wrap(
    `${ctx.companyId}:linear:labels:${teamId}`,
    TTL.QUARTER_HOUR,
    async () => {
      const data = await linearGraphQL<LabelsResponse>(ctx, TEAM_LABELS_QUERY, {
        teamId,
      })
      return data.team.labels.nodes.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        isGroup: l.isGroup ?? false,
        parentId: l.parent?.id ?? null,
      }))
    },
  )
}

/**
 * Workspace'teki TÜM takımların workflow state'lerini takım id'sine göre
 * döndürür. Linear'da state'ler takıma özeldir; çok-takımlı dashboard'da
 * (kanban + kart menüleri) her issue kendi takımının state'leriyle
 * eşlenmeli. Per-team `getTeamStates` cache'ini kullanır, bu yüzden
 * tekrar çağrılarda ek istek doğurmaz.
 */
export async function getStatesByTeam(
  ctx: LinearContext,
): Promise<Record<string, IssueState[]>> {
  const teams = await getTeams(ctx)
  const entries = await Promise.all(
    teams.map(
      async (t) => [t.id, await getTeamStates(ctx, t.id)] as const,
    ),
  )
  return Object.fromEntries(entries)
}

/**
 * Tüm takımların etiketlerini takım id'sine göre döndürür. Kart
 * menülerinde issue'nun takımına ait etiketleri göstermek için.
 */
export async function getLabelsByTeam(
  ctx: LinearContext,
): Promise<Record<string, IssueLabel[]>> {
  const teams = await getTeams(ctx)
  const entries = await Promise.all(
    teams.map(
      async (t) => [t.id, await getTeamLabels(ctx, t.id)] as const,
    ),
  )
  return Object.fromEntries(entries)
}

/**
 * Tüm takımların issue şablonlarını takım id'sine göre döndürür. Yeni
 * talep formunda takım seçilince o takımın şablonlarını sunmak için.
 */
export async function getTemplatesByTeam(
  ctx: LinearContext,
): Promise<Record<string, IssueTemplate[]>> {
  const teams = await getTeams(ctx)
  const entries = await Promise.all(
    teams.map(
      async (t) =>
        [t.id, await getTeamTemplates(ctx, t.id).catch(() => [])] as const,
    ),
  )
  return Object.fromEntries(entries)
}

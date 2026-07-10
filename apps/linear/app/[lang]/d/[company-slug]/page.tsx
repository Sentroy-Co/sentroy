/**
 * Panel (liste/kanban) — triage home.tsx loader'ının server component portu.
 *
 * Akış: session → company → LinearContext (yoksa <NotConnected/>) →
 * requester çözümü → listIssues + takım metadata'sı paralel fetch →
 * client <PanelContent> (JSX/etkileşim orada).
 */

import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { hasPermission } from "@workspace/auth/server/permissions"
import { getDb } from "@workspace/db/client"
import { getLinearContext } from "@/lib/linear/context"
import { resolveRequester } from "@/lib/linear/mapping"
import { listIssues, type ListIssuesScope } from "@/lib/linear/issues"
import {
  getLabelsByTeam,
  getStatesByTeam,
  getTeams,
} from "@/lib/linear/metadata"
import { getAllLinearUsers } from "@/lib/linear/users"
import { getUiFlagsForCompany } from "@/lib/settings"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { NotConnected } from "@/components/not-connected"
import {
  PanelContent,
  type PanelData,
} from "@/components/panel/panel-content"
import type { IssueLabel, IssueUser } from "@/lib/linear/types"

type SearchParams = Record<string, string | string[] | undefined>

/** `?assignee=a&assignee=b` → ["a","b"]; tek değer → [değer]. */
function pickAll(value: string | string[] | undefined): string[] {
  const arr = Array.isArray(value) ? value : value !== undefined ? [value] : []
  return arr.map((v) => v.trim()).filter(Boolean)
}

function pickOne(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function PanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
  searchParams: Promise<SearchParams>
}) {
  const { "company-slug": slug } = await params
  const sp = await searchParams

  // Layout yalnız aktif üyelik guard'ı uyguluyor; kök segment ("") shared
  // route-permissions tablosunda "*" (herhangi bir üye) olduğundan client
  // RouteGuard de geçer. Linear verisi linear.* yetkisi gerektirir → burada
  // server-side gerçek kapıyı koy (yetkisiz üyeye workspace sızmasın).
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) notFound()
  const allowed = await hasPermission(session, slug, "linear.view")
  if (!allowed) notFound()

  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  if (!company) notFound()
  const companyId = company._id.toString()

  // Linear bağlı değil (API key yok / decrypt edilemedi) → bağlantı CTA'sı.
  const ctx = await getLinearContext(companyId)
  if (!ctx) {
    return <NotConnected />
  }

  // --- Filtre paramları (triage loader birebir) -----------------------------
  const stateParam = pickOne(sp.state)
  const stateType: "open" | "closed" | "all" =
    stateParam === "open" || stateParam === "closed" ? stateParam : "all"
  const cursor = pickOne(sp.cursor)
  const scopeParam = pickOne(sp.scope)
  const scope: ListIssuesScope = scopeParam === "mine" ? "mine" : "workspace"
  const assigneeIds = pickAll(sp.assignee)
  const labelIds = pickAll(sp.label)
  const teamParam = pickOne(sp.team)

  // uiFlags: showAllIssues (panel-dışı issue'lar) server tarafında listIssues'a
  // geçer; groupByTeam client'ta panel-content'te takım sekmeleri gösterir.
  const uiFlags = await getUiFlagsForCompany(companyId)

  let data: PanelData
  try {
    const requester = await resolveRequester(ctx, {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    })
    const teams = await getTeams(ctx)
    const defaultTeamId = ctx.defaultTeamId?.trim() || teams[0]?.id || null
    // groupByTeam açıkken seçili takım (?team) sunucu tarafında filtrelenir;
    // geçersiz/olmayan id'yi yok say.
    const activeTeamId =
      uiFlags.groupByTeam && teamParam && teams.some((t) => t.id === teamParam)
        ? teamParam
        : null
    // Issue listesi workspace genelindedir (tüm takımlar); kanban kolonları
    // ve kart menüleri için her takımın state/label setine ihtiyaç var.
    // Linear'da state'ler takıma özel olduğundan tek takımla gruplarsak
    // diğer takımların kartları kanban'da hiçbir kolona düşmez.
    const [page, statesByTeam, labelsByTeam, users] = await Promise.all([
      listIssues(ctx, {
        requester,
        scope,
        cursor,
        stateType,
        pageSize: 50,
        teamId: activeTeamId ?? undefined,
        assigneeIds: assigneeIds.length ? assigneeIds : undefined,
        labelIds: labelIds.length ? labelIds : undefined,
        showAllIssues: uiFlags.showAllIssues,
      }),
      getStatesByTeam(ctx),
      getLabelsByTeam(ctx),
      getAllLinearUsers(ctx).catch(() => [] as IssueUser[]),
    ])
    // Filtre menüsü etiketleri tüm takımların birleşimi (id'ye göre tekille).
    const labelMap = new Map<string, IssueLabel>()
    for (const list of Object.values(labelsByTeam)) {
      for (const l of list) if (!labelMap.has(l.id)) labelMap.set(l.id, l)
    }
    const labels = Array.from(labelMap.values())

    data = {
      ok: true,
      issues: page.nodes,
      statesByTeam,
      labelsByTeam,
      labels,
      teams,
      defaultTeamId,
      users,
      requester: requester.kind,
      hasNextPage: page.pageInfo.hasNextPage,
      cursor: page.pageInfo.endCursor,
      filters: {
        scope,
        state: stateType,
        assigneeIds,
        labelIds,
        teamId: activeTeamId,
      },
    }
  } catch (err) {
    logger.error({
      source: "linear",
      route: "panel",
      companyId,
      message: (err as Error).message,
    })
    const t = await getTranslations("linearLite.panel")
    data = {
      ok: false,
      error:
        err instanceof LinearError ? err.message : t("connectionError"),
    }
  }

  return <PanelContent data={data} />
}

import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getLinearContext } from "@/lib/linear/context"
import { getTeams } from "@/lib/linear/metadata"
import { getUiFlagsForCompany } from "@/lib/settings"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /teams — takım keşif uç noktası (triage api.teams portu, SADECE JSON —
 * HTML görünümü port edilmedi). linear.view.
 *
 * Workspace'teki Linear takımları (id / key / name) ve hangi takımın "etkin
 * varsayılan" olduğu döner. showTeamPicker kapalıyken yeni talepler
 * defaultTeamId ile açılır; o da boşsa ilk takım kullanılır. Triage'daki
 * env satırı (`LINEAR_DEFAULT_TEAM_ID=…`) kalktı — varsayılan takım artık
 * env değil, linear-settings dokümanından (defaultTeamId) yönetilir.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  try {
    const [teams, uiFlags] = await Promise.all([
      getTeams(ctx),
      getUiFlagsForCompany(access.companyId),
    ])
    const configuredDefault = ctx.defaultTeamId?.trim() || null
    const effectiveDefaultId = configuredDefault ?? teams[0]?.id ?? null

    return jsonSuccess({
      showTeamPicker: uiFlags.showTeamPicker,
      configuredDefaultTeamId: configuredDefault,
      effectiveDefaultTeamId: effectiveDefaultId,
      teams: teams.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        isConfiguredDefault: t.id === configuredDefault,
        isEffectiveDefault: t.id === effectiveDefaultId,
      })),
    })
  } catch (err) {
    logger.error({
      source: "linear",
      route: "teams",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    return jsonError("Failed to fetch teams", 502)
  }
}

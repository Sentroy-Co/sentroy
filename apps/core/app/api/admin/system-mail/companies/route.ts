import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { companyModel } from "@workspace/db/models"
import { SYSTEM_COMPANY_SLUG } from "@workspace/db/constants"

/**
 * Admin assign dialog'u için sade company picker endpoint'i. `__system`
 * shadow company hariç tutulur; sadece id+name+slug+sentroyApiKey-presence
 * dönüyoruz (UI'da "this company has no API key, provision required"
 * gibi disabled state için).
 *
 * Mevcut `/api/admin/companies` paginated + zengin; picker için ayrı + sade
 * endpoint açtık ki dropdown her açılışta minimal payload alsın.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const all = await companyModel.findAll()
  const filtered = all
    .filter((c) => c.slug !== SYSTEM_COMPANY_SLUG)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      hasSentroyKey: Boolean(c.sentroyApiKey),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return jsonSuccess(filtered)
}

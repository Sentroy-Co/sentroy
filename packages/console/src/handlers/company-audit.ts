import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import { listCompanyAudit } from "@workspace/console/lib/audit"

/**
 * GET /api/companies/[slug]/audit?limit=&skip=
 *
 * Sadece owner/admin görebilir — audit log üyelik değişiklikleri,
 * kim hangi davetiyeyi gönderdi/iptal etti, settings/avatar güncellendi
 * gibi sensitive bilgi içerir.
 */
export async function listCompanyAuditHandler(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error

  const sp = request.nextUrl.searchParams
  const limit = Math.min(Number(sp.get("limit") || "100"), 200)
  const skip = Number(sp.get("skip") || "0")

  const items = await listCompanyAudit(access.companyId, { limit, skip })
  return jsonSuccess(items)
}

export { listCompanyAuditHandler as GET }

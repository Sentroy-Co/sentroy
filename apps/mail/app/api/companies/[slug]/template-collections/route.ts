export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { systemTemplateCollectionModel } from "@workspace/db/models"

/**
 * GET /api/companies/[slug]/template-collections
 *
 * Public template koleksiyon listesi — user library dialog koleksiyon
 * filter dropdown'unu doldurmak için. Auth: company member.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const items = await systemTemplateCollectionModel.list({ onlyPublic: true })
  return jsonSuccess(items)
}

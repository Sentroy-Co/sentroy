import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { noteWidgetPlacementModel } from "@workspace/db/models"

/**
 * GET — caller'ın bu şirketteki masaüstü not widget yerleşimleri (pin listesi +
 * konumlar). Cihazlar-arası senkron: OS mount'ta bunu çekip pinli widget'ları
 * konumlarında render eder.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const placements = await noteWidgetPlacementModel.listForUser(
    access.companyId,
    access.session.user.id,
  )
  return jsonSuccess({ placements })
}

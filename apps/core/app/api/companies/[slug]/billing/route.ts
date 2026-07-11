export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { companyModel, planModel } from "@workspace/db/models"

/**
 * GET /api/companies/[slug]/billing — mevcut plan + abonelik özeti.
 * Üyeler görüntüleyebilir; yönetim (checkout/portal) owner/admin gerektirir.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const company = await companyModel.findById(access.companyId)
  const plan = company?.planId
    ? await planModel.findById(company.planId)
    : null

  return jsonSuccess({
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          price: plan.price,
          yearlyPrice: plan.yearlyPrice ?? null,
        }
      : null,
    subscription: company?.subscription ?? null,
  })
}

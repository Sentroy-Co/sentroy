export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import { audit } from "@workspace/console/lib/audit"
import { companyModel } from "@workspace/db/models"
import { getPolarClient } from "@/lib/polar/client"

export const runtime = "nodejs"

/**
 * POST /api/companies/[slug]/billing/portal — Polar müşteri portalı için
 * kısa ömürlü bir session oluşturup hosted portal URL'ini döner. Company,
 * `external_customer_id` (= company.id) ile çözülür. İptal / ödeme yöntemi /
 * fatura yönetimi portalda yapılır.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error

  const company = await companyModel.findById(access.companyId)
  if (!company) return jsonError("Company not found", 404)

  if (!company.subscription && !company.polarCustomerId) {
    return jsonError("No active subscription to manage", 400)
  }

  const resolved = await getPolarClient()
  if (!resolved) return jsonError("Polar is not configured", 400)

  try {
    // Otoriter Polar customer ID'si varsa önce onu dene (gerçek abonelik
    // geçmişine açılır). ANCAK stored customerId bayat olabilir — silinmiş,
    // sandbox↔prod ortam uyuşmazlığı ya da yeniden yaratılmış müşteri →
    // Polar "Customer does not exist" döner. Bu durumda GÜVENİLİR external_id
    // (= company.id) ile çöz: checkout `externalCustomerId: company.id`
    // kullandığından bu daima doğru müşteriye eşleşir. (DB'ye yazmıyoruz;
    // webhook polarCustomerId'yi zamanla düzeltir.)
    let session
    if (company.polarCustomerId) {
      try {
        session = await resolved.client.customerSessions.create({
          customerId: company.polarCustomerId,
        })
      } catch {
        session = await resolved.client.customerSessions.create({
          externalCustomerId: company.id,
        })
      }
    } else {
      session = await resolved.client.customerSessions.create({
        externalCustomerId: company.id,
      })
    }

    await audit({
      userId: access.session?.user.id ?? "system",
      companyId: company.id,
      action: "billing.portal.open",
      resource: "polar-customer",
      details: { mode: resolved.mode },
      request,
    }).catch(() => {})

    return jsonSuccess({ url: session.customerPortalUrl })
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to open customer portal",
      502,
    )
  }
}

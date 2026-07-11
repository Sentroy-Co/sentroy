export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import { companyModel } from "@workspace/db/models"
import { cleanupMail } from "@/lib/cleanup"

/**
 * Server-to-server cleanup endpoint'i. Core, company DELETE sırasında
 * `INTERNAL_API_SECRET` + `x-internal-secret` header'ıyla bu endpoint'e
 * POST atar. Kullanıcı oturumu kullanılmaz — core zaten kendi tarafında
 * yetkilendirmeyi yaptı.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authFail = verifyInternalRequest(request)
  if (authFail) return authFail

  const { slug } = await params
  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  try {
    const result = await cleanupMail(company)
    return jsonSuccess(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[cleanup-mail] failed:", msg)
    return jsonError(`Mail cleanup failed: ${msg}`, 502)
  }
}

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { isValidInternalSecret } from "@workspace/console/lib/internal-auth"
import { companyModel } from "@workspace/db/models"
import { ensureMailProvisioned } from "@/lib/provision"

/**
 * Mail provisioning endpoint'i — iki auth modu kabul eder:
 *
 *   1. **Server-to-server** — `x-internal-secret` header'ı varsa ve
 *      `INTERNAL_API_SECRET` ile eşleşirse session doğrulaması atlanır.
 *      Core'un company create flow'u atomik olarak bu modu kullanır.
 *
 *   2. **Session-based** — Header yoksa normal cookie session + owner/admin
 *      kontrolü. UI "retry" butonu bu modu kullanır (nadir edge case —
 *      create-time provision fail olduysa kullanıcı manuel tetikleyebilir).
 *
 * Her iki modda da idempotent: key zaten varsa hiçbir şey yapılmaz.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Mode 1: server-to-server (sabit-zamanlı secret kontrolü — timing attack'e kapalı)
  const isInternal = isValidInternalSecret(
    request.headers.get("x-internal-secret"),
  )

  // Mode 2: session
  if (!isInternal) {
    const access = await assertCompanyAccess(request, slug)
    if ("error" in access) return access.error
    if (
      !access.member ||
      (access.member.role !== "owner" && access.member.role !== "admin")
    ) {
      return jsonError("Only owner/admin can provision mail", 403)
    }
  }

  const company = await companyModel.findBySlug(slug)
  if (!company) return jsonError("Company not found", 404)

  const alreadyProvisioned = Boolean(company.sentroyApiKey)

  try {
    const updated = await ensureMailProvisioned(company)
    return jsonSuccess({
      provisioned: !alreadyProvisioned,
      reason: alreadyProvisioned ? "already_provisioned" : "created",
      company: updated,
    })
  } catch (err: unknown) {
    const e = err as {
      statusCode?: number
      body?: { message?: string; error?: string }
      message?: string
    }
    console.error("[provision-mail] failed:", {
      statusCode: e.statusCode,
      message: e.message,
      body: e.body,
    })
    const detail =
      e.body?.error || e.body?.message || e.message || "Unknown error"
    return jsonError(`Mail provision failed: ${detail}`, 502)
  }
}

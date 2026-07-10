import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { whatsappAudienceModel } from "@workspace/db/models"
import { parseEntries } from "@/lib/audience-entries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /audiences — şirketin hedef kitleleri. whatsapp.view. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error
  const audiences = await whatsappAudienceModel.findByCompany(access.companyId)
  return jsonSuccess(audiences)
}

/** POST /audiences — yeni hedef kitle. whatsapp.manage. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error

  let body: { name?: string; description?: string; entries?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return jsonError("'name' is required")

  const created = await whatsappAudienceModel.create({
    companyId: access.companyId,
    name: name.slice(0, 120),
    description:
      typeof body.description === "string" ? body.description.trim() : null,
    entries: parseEntries(body.entries),
  })

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.audience.create",
    resource: "whatsapp-audience",
    resourceId: created.id,
    details: { name, entryCount: created.entryCount },
  })
  return jsonSuccess(created, 201)
}

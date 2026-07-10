import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { whatsappAudienceModel } from "@workspace/db/models"
import { parseEntries } from "@/lib/audience-entries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /audiences/[id]. whatsapp.view. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error
  const aud = await whatsappAudienceModel.findById(access.companyId, id)
  if (!aud) return jsonError("Audience not found", 404)
  return jsonSuccess(aud)
}

/** PATCH /audiences/[id]. whatsapp.manage. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error

  let body: { name?: string; description?: string | null; entries?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Parameters<typeof whatsappAudienceModel.updateById>[2] = {}
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 120)
  if (body.description !== undefined)
    patch.description =
      typeof body.description === "string" ? body.description.trim() : null
  if (body.entries !== undefined) patch.entries = parseEntries(body.entries)

  const updated = await whatsappAudienceModel.updateById(
    access.companyId,
    id,
    patch,
  )
  if (!updated) return jsonError("Audience not found", 404)

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.audience.update",
    resource: "whatsapp-audience",
    resourceId: id,
  })
  return jsonSuccess(updated)
}

/** DELETE /audiences/[id]. whatsapp.manage. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error
  const ok = await whatsappAudienceModel.deleteById(access.companyId, id)
  if (!ok) return jsonError("Audience not found", 404)
  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.audience.delete",
    resource: "whatsapp-audience",
    resourceId: id,
  })
  return jsonSuccess({ deleted: true })
}

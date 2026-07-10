import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { whatsappTemplateModel } from "@workspace/db/models"
import { parseEmailTemplate } from "@workspace/ui/lib/email-template"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /templates/[id] — tek şablon. whatsapp.view. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error
  const tpl = await whatsappTemplateModel.findById(access.companyId, id)
  if (!tpl) return jsonError("Template not found", 404)
  return jsonSuccess(tpl)
}

/** PATCH /templates/[id] — güncelle (body değişirse değişkenler yeniden çıkarılır). whatsapp.manage. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error

  let body: {
    name?: string
    body?: string
    mediaUrl?: string | null
    category?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Parameters<typeof whatsappTemplateModel.updateById>[2] = {}
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 120)
  if (typeof body.body === "string") {
    if (!body.body.trim()) return jsonError("'body' cannot be empty")
    patch.body = body.body
    patch.variables = parseEmailTemplate(body.body).scalars
  }
  if (body.mediaUrl !== undefined)
    patch.mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : null
  if (body.category !== undefined)
    patch.category = typeof body.category === "string" ? body.category.trim() : null

  const updated = await whatsappTemplateModel.updateById(
    access.companyId,
    id,
    patch,
  )
  if (!updated) return jsonError("Template not found", 404)

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.template.update",
    resource: "whatsapp-template",
    resourceId: id,
  })
  return jsonSuccess(updated)
}

/** DELETE /templates/[id]. whatsapp.manage. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error
  const ok = await whatsappTemplateModel.deleteById(access.companyId, id)
  if (!ok) return jsonError("Template not found", 404)
  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.template.delete",
    resource: "whatsapp-template",
    resourceId: id,
  })
  return jsonSuccess({ deleted: true })
}

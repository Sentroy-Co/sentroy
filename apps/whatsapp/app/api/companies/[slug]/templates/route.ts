import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { whatsappTemplateModel } from "@workspace/db/models"
import { parseEmailTemplate } from "@workspace/ui/lib/email-template"
import {
  whatsappTemplateLimit,
  isOverLimit,
} from "@workspace/console/lib/whatsapp-limits"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /templates — şirketin WhatsApp şablonları. whatsapp.view. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error
  const templates = await whatsappTemplateModel.findByCompany(access.companyId)
  return jsonSuccess(templates)
}

/** POST /templates — yeni şablon (plan limiti kontrollü). whatsapp.manage. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error

  let body: {
    name?: string
    body?: string
    mediaUrl?: string
    category?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const tplBody = typeof body.body === "string" ? body.body : ""
  if (!name) return jsonError("'name' is required")
  if (!tplBody.trim()) return jsonError("'body' is required")

  // Plan limiti — company'deki maxWhatsappTemplates (denormalize).
  const count = await whatsappTemplateModel.countByCompany(access.companyId)
  const limit = whatsappTemplateLimit(access.company)
  if (isOverLimit(count, limit)) {
    return jsonError(
      `WhatsApp template limit reached (${count}/${limit}). Upgrade your plan.`,
      403,
    )
  }

  const variables = parseEmailTemplate(tplBody).scalars
  const created = await whatsappTemplateModel.create({
    companyId: access.companyId,
    name: name.slice(0, 120),
    body: tplBody,
    variables,
    mediaUrl: typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : null,
    category: typeof body.category === "string" ? body.category.trim() : null,
  })

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.template.create",
    resource: "whatsapp-template",
    resourceId: created.id,
    details: { name },
  })

  return jsonSuccess(created, 201)
}

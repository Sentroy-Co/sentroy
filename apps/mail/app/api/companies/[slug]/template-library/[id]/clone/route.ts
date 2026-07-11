export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  systemEmailTemplateModel,
  mailTemplateSourceModel,
} from "@workspace/db/models"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import type { LocalizedString } from "@sentroy-co/sdk"

/**
 * POST /api/companies/[slug]/template-library/[id]/clone
 * Body: { domainId: string }
 *
 * System library template'i sentroy üzerinde kullanıcının company catalog'una
 * yazar. Template tek seferde oluşturulur — sonra kullanıcı normal templates
 * UI'sından düzenler. Library bağlantısı tutulmaz (snapshot copy).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error

  let body: { domainId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.domainId || typeof body.domainId !== "string") {
    return jsonError("domainId is required")
  }

  const tpl = await systemEmailTemplateModel.findById(id)
  if (!tpl || !tpl.isPublic) return jsonError("Template not found", 404)

  try {
    const created = await result.sentroy!.templates.create({
      name: tpl.name as LocalizedString,
      subject: tpl.subject as LocalizedString,
      // Sentroy SDK alanı `mjmlBody` adında ama bizim taraf raw HTML
      // tutuyor — mail-server `<mjml>` wrapper yoksa raw HTML olarak işler.
      mjmlBody: tpl.htmlBody as LocalizedString,
      domainId: body.domainId,
    })
    const newId = (created.data as { id?: string } | null)?.id
    if (newId) {
      await mailTemplateSourceModel
        .upsert({
          companyId: result.companyId!,
          templateId: newId,
          name: tpl.name as LocalizedString,
          subject: tpl.subject as LocalizedString,
          body: tpl.htmlBody as LocalizedString,
          sourceSystemTemplateId: tpl.id,
          sourceCollectionId: tpl.collectionId ?? null,
          category: tpl.category,
        })
        .catch((e) =>
          console.warn("[clone] source persist failed:", e),
        )
    }
    return jsonSuccess(created.data, 201)
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Clone failed",
      502,
    )
  }
}

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  systemEmailTemplateModel,
  systemTemplateCollectionModel,
  mailTemplateSourceModel,
} from "@workspace/db/models"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import type { LocalizedString } from "@sentroy-co/sdk"

/**
 * POST /api/companies/[slug]/template-collections/[id]/clone
 * Body: { domainId: string }
 *
 * Koleksiyondaki tüm public template'leri kullanıcının catalog'una sentroy
 * üzerinden create eder. Atomic değil — bir template fail olursa diğerleri
 * yine create edilir; cevapta tek tek sonuç döner ki UI hata mesajı
 * gösterebilsin.
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

  const collection = await systemTemplateCollectionModel.findById(id)
  if (!collection || !collection.isPublic) {
    return jsonError("Collection not found", 404)
  }

  const templates = await systemEmailTemplateModel.list({
    onlyPublic: true,
    collectionId: id,
  })
  if (templates.length === 0) {
    return jsonSuccess({ created: 0, failed: 0, results: [] })
  }

  const sentroy = result.sentroy!
  const settled = await Promise.allSettled(
    templates.map((tpl) =>
      sentroy.templates.create({
        name: tpl.name as LocalizedString,
        subject: tpl.subject as LocalizedString,
        mjmlBody: tpl.htmlBody as LocalizedString,
        domainId: body.domainId!,
      }),
    ),
  )

  // Source persistence — başarılı her clone için ayrı koleksiyona ham
  // içerik yazılır (round-trip safety, mail-server normalize ederse bizden
  // override edilir). Tek tek upsert; fail bypass.
  const companyId = result.companyId!
  await Promise.all(
    settled.map(async (s, i) => {
      if (s.status !== "fulfilled") return
      const newId = (s.value.data as { id?: string } | null)?.id
      if (!newId) return
      await mailTemplateSourceModel
        .upsert({
          companyId,
          templateId: newId,
          name: templates[i].name as LocalizedString,
          subject: templates[i].subject as LocalizedString,
          body: templates[i].htmlBody as LocalizedString,
        })
        .catch(() => {})
    }),
  )

  const results = settled.map((s, i) => ({
    key: templates[i].key,
    ok: s.status === "fulfilled",
    error: s.status === "rejected" ? String(s.reason) : null,
  }))

  return jsonSuccess({
    collection: collection.key,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  })
}

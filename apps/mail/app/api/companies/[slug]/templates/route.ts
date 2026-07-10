import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  mailTemplateThumbnailModel,
  mailTemplateSourceModel,
} from "@workspace/db/models"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import type { LocalizedString } from "@sentroy-co/sdk"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error

  try {
    const url = new URL(request.url)
    const domainId = url.searchParams.get("domainId") ?? undefined
    const templates = await result.sentroy!.templates.list({ domainId })
    const list = templates.data ?? []

    // Thumbnail + source override'ı ayrı koleksiyonlardan toplu çek + her
    // template'e enrich. Sentroy template doc'una touch etmiyoruz; source
    // varsa name/subject/mjmlBody onu override eder (round-trip safety) —
    // editor'de yazılan ham içerik korunur.
    const ids = list
      .map((t) => (t as { id?: string }).id)
      .filter((v): v is string => typeof v === "string")
    const [thumbs, sources] = await Promise.all([
      mailTemplateThumbnailModel.findManyByTemplates(result.companyId!, ids),
      mailTemplateSourceModel.findManyByTemplates(result.companyId!, ids),
    ])
    const thumbByTemplate = new Map(thumbs.map((t) => [t.templateId, t.url]))
    const sourceByTemplate = new Map(
      sources.map((s) => [s.templateId, s] as const),
    )
    const enriched = list.map((t) => {
      const id = (t as { id?: string }).id
      if (!id) return t
      const src = sourceByTemplate.get(id)
      const thumb = thumbByTemplate.get(id)
      if (!src && !thumb) return t
      return {
        ...t,
        ...(src && {
          name: src.name as never,
          subject: src.subject as never,
          mjmlBody: src.body as never,
          ...(src.sourceSystemTemplateId && {
            sourceSystemTemplateId: src.sourceSystemTemplateId,
          }),
          ...(src.sourceCollectionId && {
            sourceCollectionId: src.sourceCollectionId,
          }),
          ...(src.category && { category: src.category }),
        }),
        ...(thumb && { thumbnailUrl: thumb }),
      }
    })

    return jsonSuccess(enriched)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list templates"
    return jsonError(message, 500)
  }
}

function normalizeLocalized(
  value: unknown,
): LocalizedString | undefined {
  if (!value) return undefined
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj: Record<string, string> = {}
    for (const [lang, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) {
        obj[lang] = v.trim()
      }
    }
    return Object.keys(obj).length > 0 ? obj : undefined
  }
  return undefined
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const name = normalizeLocalized(body.name)
  const subject = normalizeLocalized(body.subject)
  const mjmlBody = normalizeLocalized(body.mjmlBody)

  if (!name) return jsonError("Template name is required")
  if (!subject) return jsonError("Subject line is required")
  if (!mjmlBody) return jsonError("MJML body is required")
  if (!body.domainId || typeof body.domainId !== "string") {
    return jsonError("Domain is required")
  }

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error

  try {
    const created = await result.sentroy!.templates.create({
      name,
      subject,
      mjmlBody,
      domainId: body.domainId,
    })
    const id = (created.data as { id?: string } | null)?.id
    if (id) {
      // Source-of-truth — round-trip safety. Sentroy normalize edebilir,
      // bizim kayıt orijinal kullanıcı girdisini korur. Fail bypass
      // (cosmetic — yine sentroy'daki kayıt kullanılabilir).
      await mailTemplateSourceModel
        .upsert({
          companyId: result.companyId!,
          templateId: id,
          name,
          subject,
          body: mjmlBody,
        })
        .catch((e) => console.warn("[templates] source persist failed:", e))
    }
    return jsonSuccess(created.data, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create template"
    return jsonError(message, 500)
  }
}

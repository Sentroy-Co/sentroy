import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { mailTemplateSourceModel } from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import { composeMailTemplate } from "@workspace/ai-assistant/tasks/mail-compose"
import { AssistantError } from "@workspace/ai-assistant/assistant"

/**
 * POST /api/companies/[slug]/templates/ai-compose
 * Body: {
 *   subjectPrompt: string,         // ne hakkında bir mail istediği
 *   locales: string[],             // hangi dilleri istediği (örn ["en","tr"])
 *   exampleTemplateId?: string,    // referans alınacak mevcut template id
 *   notes?: string,                // ek talimat
 * }
 *
 * Returns: { name, subject, body }  — hepsi LocalizedString.
 *
 * Caller `templates.manage` perm'ine sahip olmalı (template yaratabilenler
 * AI ile üretsin). Audit loglanır.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error

  let body: {
    subjectPrompt?: string
    locales?: string[]
    exampleTemplateId?: string
    notes?: string
    brand?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const subjectPrompt = (body.subjectPrompt ?? "").trim()
  if (!subjectPrompt) return jsonError("subjectPrompt is required")

  const locales = (body.locales ?? []).filter(
    (l): l is string => typeof l === "string" && l.length > 0,
  )
  if (locales.length === 0) return jsonError("locales must include at least one")

  // Örnek template — caller eski bir template'i referans olarak veriyorsa
  // sentroy'dan alıp source-of-truth (bizim kayıt) ile override edip
  // gönderelim. Round-trip safety zaten buradan geliyor.
  type LocalizedLike = string | Record<string, string> | null | undefined
  let exampleTemplate:
    | { name?: LocalizedLike; subject?: LocalizedLike; body?: LocalizedLike }
    | undefined
  if (body.exampleTemplateId) {
    try {
      const tpl = await result.sentroy!.templates.get(body.exampleTemplateId)
      if (tpl.data) {
        const source = await mailTemplateSourceModel.findByTemplate(
          result.companyId!,
          body.exampleTemplateId,
        )
        const data = tpl.data as unknown as {
          name?: LocalizedLike
          subject?: LocalizedLike
          mjmlBody?: LocalizedLike
        }
        exampleTemplate = {
          name: (source?.name as LocalizedLike) ?? data.name,
          subject: (source?.subject as LocalizedLike) ?? data.subject,
          body: (source?.body as LocalizedLike) ?? data.mjmlBody,
        }
      }
    } catch (err) {
      // Örnek alınamadıysa not değil — model fallback üretsin.
      console.warn("[ai-compose] example fetch failed:", err)
    }
  }

  try {
    const composed = await composeMailTemplate({
      subjectPrompt,
      locales,
      brand: body.brand,
      notes: body.notes,
      exampleTemplate,
    })

    audit({
      request,
      userId: result.session?.user.id ?? "",
      companyId: result.companyId,
      action: "ai.compose-mail",
      resource: "template",
      details: {
        subjectPrompt,
        locales,
        usedExample: !!exampleTemplate,
        attempts: composed.attempts,
        tokens: composed.usage?.totalTokens,
      },
    })

    return jsonSuccess({
      ...composed.output,
      meta: {
        attempts: composed.attempts,
        usage: composed.usage,
      },
    })
  } catch (err) {
    if (err instanceof AssistantError) {
      const status =
        err.code === "missing-api-key"
          ? 503
          : err.code === "schema-validation"
          ? 422
          : 500
      return jsonError(err.message, status)
    }
    return jsonError(err instanceof Error ? err.message : "AI compose failed", 500)
  }
}

import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { systemEmailTemplateModel, auditLogModel } from "@workspace/db/models"
import { composeMailTemplate } from "@workspace/ai-assistant/tasks/mail-compose"
import { AssistantError } from "@workspace/ai-assistant/assistant"

/**
 * Reasoning models on the gateway (Claude Sonnet 4.6 thinking,
 * Gemini 2.5 Pro) routinely take 60–90s for a full multi-locale
 * compose. The Next.js default function budget of 30s was killing
 * those requests in flight; bump to 120s so the slowest models can
 * finish, and so the wizard's batch-fill loop never trips on a
 * single laggy iteration.
 */
export const maxDuration = 120

/**
 * POST /api/admin/template-library/ai-compose
 * Body: {
 *   subjectPrompt: string,
 *   locales: string[],
 *   exampleTemplateId?: string,  // mevcut SYSTEM template id (admin kütüphanesinden)
 *   notes?: string,
 *   brand?: string,
 * }
 *
 * Admin-only — system template kütüphanesi için AI ile içerik üretir.
 * User-side `/api/companies/[slug]/templates/ai-compose` endpoint'inin
 * admin equivalent'i: company scope yok, örnek template'i system
 * koleksiyonundan çeker, audit log user-id altında tutar.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let body: {
    subjectPrompt?: string
    locales?: string[]
    exampleTemplateId?: string
    /** Bypass DB lookup — caller already has a freshly-generated
     *  template they want to use as the style guide for the next
     *  iteration (collection AI fill wizard). */
    exampleInline?: {
      name?: Record<string, string> | string | null
      subject?: Record<string, string> | string | null
      body?: Record<string, string> | string | null
    }
    notes?: string
    brand?: string
    /** Optional logo URL — when set the prompt instructs the model to
     *  emit an `<img src="{logoUrl}">` header. When empty, the model
     *  falls back to a `<h1>{brand}</h1>` text header. The conditional
     *  rendering happens at runtime via the template parser's inverted
     *  sections, so the produced template is reusable across senders
     *  with or without a logo. */
    logoUrl?: string
    model?: string
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
  if (locales.length === 0) {
    return jsonError("locales must include at least one")
  }

  // Örnek template — caller's inline payload first (wizard hands us
  // the just-generated welcome template, no DB round-trip), otherwise
  // a system template id (single-template editor flow).
  type LocalizedLike = string | Record<string, string> | null | undefined
  let exampleTemplate:
    | { name?: LocalizedLike; subject?: LocalizedLike; body?: LocalizedLike }
    | undefined
  if (body.exampleInline) {
    exampleTemplate = body.exampleInline
  } else if (body.exampleTemplateId) {
    try {
      const tpl = await systemEmailTemplateModel.findById(body.exampleTemplateId)
      if (tpl) {
        exampleTemplate = {
          name: tpl.name as LocalizedLike,
          subject: tpl.subject as LocalizedLike,
          body: tpl.htmlBody as LocalizedLike,
        }
      }
    } catch (err) {
      console.warn("[admin/ai-compose] example fetch failed:", err)
    }
  }

  try {
    const composed = await composeMailTemplate({
      subjectPrompt,
      locales,
      brand: body.brand,
      logoUrl: body.logoUrl,
      notes: body.notes,
      exampleTemplate,
      model: body.model,
    })

    auditLogModel
      .insert({
        userId: session.user.id,
        action: "admin.ai.compose-mail",
        resource: "system-template",
        details: {
          subjectPrompt,
          locales,
          usedExample: !!exampleTemplate,
          model: body.model,
          attempts: composed.attempts,
          tokens: composed.usage?.totalTokens,
        },
      })
      .catch(() => {})

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
    return jsonError(
      err instanceof Error ? err.message : "AI compose failed",
      500,
    )
  }
}

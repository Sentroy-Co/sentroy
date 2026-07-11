export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { audit } from "@workspace/console/lib/audit"
import { runMailAssistant } from "@workspace/ai-assistant/tasks/mail-assistant"
import { AssistantError } from "@workspace/ai-assistant/assistant"

/**
 * POST /api/companies/[slug]/compose-ai
 * Composer AI assistant — yeni mail oluşturma & mevcut taslağı geliştirme.
 *
 * Body discriminated union:
 *   { kind: "compose", prompt, outputLang?, tone?, senderName?, recipientHint?, model? }
 *   { kind: "enhance", bodyHtml, subject?, outputLang?, notes?, model? }
 *   { kind: "change-tone", bodyHtml, subject?, tone, outputLang?, model? }
 *
 * Permission: `send.execute` — compose AI yalnızca mail göndermeye yetkili
 * üyelerin işine yarıyor; reply-draft ile aynı eşik. Audit her çağrıda yazılır.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const access = await resolveCompanyAccess(request, slug, "send.execute")
  if ("error" in access) return access.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const kind = body.kind as string
  if (kind !== "compose" && kind !== "enhance" && kind !== "change-tone") {
    return jsonError("kind must be one of: compose, enhance, change-tone")
  }

  try {
    let result: Awaited<ReturnType<typeof runMailAssistant>>

    if (kind === "compose") {
      const prompt = String(body.prompt ?? "").trim()
      if (!prompt) return jsonError("prompt is required")
      result = await runMailAssistant({
        kind: "compose",
        input: {
          prompt,
          outputLang: body.outputLang as string | undefined,
          tone: body.tone as
            | "concise"
            | "warm"
            | "formal"
            | "apologetic"
            | "decline"
            | "marketing"
            | undefined,
          senderName: body.senderName as string | undefined,
          recipientHint: body.recipientHint as string | undefined,
          model: body.model as string | undefined,
        },
      })
    } else if (kind === "enhance") {
      const bodyHtml = String(body.bodyHtml ?? "").trim()
      if (!bodyHtml) return jsonError("bodyHtml is required")
      result = await runMailAssistant({
        kind: "enhance",
        input: {
          bodyHtml,
          subject: body.subject as string | undefined,
          outputLang: body.outputLang as string | undefined,
          notes: body.notes as string | undefined,
          model: body.model as string | undefined,
        },
      })
    } else {
      const bodyHtml = String(body.bodyHtml ?? "").trim()
      const tone = body.tone as string
      const validTones = [
        "concise",
        "warm",
        "formal",
        "apologetic",
        "decline",
        "casual",
        "marketing",
      ] as const
      if (!bodyHtml) return jsonError("bodyHtml is required")
      if (!validTones.includes(tone as (typeof validTones)[number])) {
        return jsonError(`tone must be one of: ${validTones.join(", ")}`)
      }
      result = await runMailAssistant({
        kind: "change-tone",
        input: {
          bodyHtml,
          subject: body.subject as string | undefined,
          tone: tone as (typeof validTones)[number],
          outputLang: body.outputLang as string | undefined,
          model: body.model as string | undefined,
        },
      })
    }

    audit({
      request,
      userId: access.callerUserId,
      companyId: access.companyId,
      action: `ai.compose.${kind}`,
      resource: "compose",
      details: {
        attempts: result.attempts,
        tokens: result.usage?.totalTokens,
      },
    })

    return jsonSuccess({
      ...result.output,
      meta: {
        attempts: result.attempts,
        usage: result.usage,
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

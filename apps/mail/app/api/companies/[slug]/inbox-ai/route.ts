import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { audit } from "@workspace/console/lib/audit"
import { runMailAssistant } from "@workspace/ai-assistant/tasks/mail-assistant"
import { AssistantError } from "@workspace/ai-assistant/assistant"

/**
 * POST /api/companies/[slug]/inbox-ai
 * Inbox AI assistant — translate / summarize / reply-draft.
 *
 * Body shape (discriminated union üzerinden `kind` ile dallanır):
 *   { kind: "translate", subject, bodyHtml, targetLang, model? }
 *   { kind: "summarize", subject, bodyText, outputLang?, senderLabel?, model? }
 *   { kind: "reply", originalSubject, originalBody, tone, intent,
 *     outputLang?, senderName?, model? }
 *
 * Permission: `inbox.read` — kullanıcı kendi mailbox'undaki mailleri zaten
 * okuyabiliyorsa AI yardımı da alabilsin. Audit her çağrıda yazılır.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const access = await resolveCompanyAccess(request, slug, "inbox.view")
  if ("error" in access) return access.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const kind = body.kind as string
  if (kind !== "translate" && kind !== "summarize" && kind !== "reply") {
    return jsonError("kind must be one of: translate, summarize, reply")
  }

  try {
    let result: Awaited<ReturnType<typeof runMailAssistant>>

    if (kind === "translate") {
      const subject = String(body.subject ?? "").trim()
      const bodyHtml = String(body.bodyHtml ?? "").trim()
      const targetLang = String(body.targetLang ?? "").trim()
      if (!subject || !bodyHtml || !targetLang) {
        return jsonError("subject, bodyHtml and targetLang are required")
      }
      result = await runMailAssistant({
        kind: "translate",
        input: {
          subject,
          bodyHtml,
          targetLang,
          model: body.model as string | undefined,
        },
      })
    } else if (kind === "summarize") {
      const subject = String(body.subject ?? "").trim()
      const bodyText = String(body.bodyText ?? "").trim()
      if (!subject || !bodyText) {
        return jsonError("subject and bodyText are required")
      }
      result = await runMailAssistant({
        kind: "summarize",
        input: {
          subject,
          bodyText,
          outputLang: body.outputLang as string | undefined,
          senderLabel: body.senderLabel as string | undefined,
          model: body.model as string | undefined,
        },
      })
    } else {
      const originalSubject = String(body.originalSubject ?? "").trim()
      const originalBody = String(body.originalBody ?? "").trim()
      const tone = body.tone as string
      const intent = String(body.intent ?? "").trim()
      const validTones = [
        "concise",
        "warm",
        "formal",
        "apologetic",
        "decline",
      ] as const
      if (!originalSubject || !originalBody || !intent) {
        return jsonError(
          "originalSubject, originalBody and intent are required",
        )
      }
      if (!validTones.includes(tone as (typeof validTones)[number])) {
        return jsonError(
          `tone must be one of: ${validTones.join(", ")}`,
        )
      }
      result = await runMailAssistant({
        kind: "reply",
        input: {
          originalSubject,
          originalBody,
          tone: tone as (typeof validTones)[number],
          intent,
          outputLang: body.outputLang as string | undefined,
          senderName: body.senderName as string | undefined,
          model: body.model as string | undefined,
        },
      })
    }

    audit({
      request,
      userId: access.callerUserId,
      companyId: access.companyId,
      action: `ai.inbox.${kind}`,
      resource: "message",
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
      err instanceof Error ? err.message : "AI assistant failed",
      500,
    )
  }
}

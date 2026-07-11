export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { runMailAssistant } from "@workspace/ai-assistant/tasks/mail-assistant"
import { AssistantError } from "@workspace/ai-assistant/assistant"

/**
 * POST /api/admin/system-mail/ai
 *
 * System mail event template (admin) için AI yardımcısı — mevcut HTML
 * gövdesini iyileştirmek (`enhance`) veya tonunu değiştirmek
 * (`change-tone`). Compose'tan farklı: yeni mail oluşturma yok, çünkü
 * event registry'sine yeni event eklemek admin'in işi değil — sadece
 * mevcut event'in copy'sini düzenliyor.
 *
 * Auth: yalnızca system admin (`role === "admin"`). Diğer route'larla
 * aynı eşik.
 *
 * Body discriminated union:
 *   { kind: "enhance", bodyHtml, subject?, outputLang?, notes?, model? }
 *   { kind: "change-tone", bodyHtml, subject?, tone, outputLang?, model? }
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const kind = body.kind as string
  if (kind !== "enhance" && kind !== "change-tone") {
    return jsonError("kind must be one of: enhance, change-tone")
  }

  try {
    let result: Awaited<ReturnType<typeof runMailAssistant>>

    if (kind === "enhance") {
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
      err instanceof Error ? err.message : "AI request failed",
      500,
    )
  }
}

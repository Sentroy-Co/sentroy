import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import {
  whatsappSessionModel,
  whatsappTemplateModel,
  whatsappAudienceModel,
  whatsappSendLogModel,
} from "@workspace/db/models"
import {
  parseEmailTemplate,
  renderEmailTemplate,
} from "@workspace/ui/lib/email-template"
import {
  whatsappMonthlyLimit,
  startOfMonthUtc,
} from "@workspace/console/lib/whatsapp-limits"
import { gatewayUrl, gatewayJsonHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Recipient {
  to: string
  variables: Record<string, string>
}

/**
 * POST /send — template (veya ham body) ile tekil VEYA audience'e toplu WhatsApp
 * mesajı. SDK `whatsapp.send()` + CLI `whatsapp send`. whatsapp.send.
 *
 * Body: `{ from?, to?, audienceId?, templateId?, body?, variables? }`
 * - `from`: gönderilecek numara (sessionId veya phoneNumber); yoksa tek bağlı numara.
 * - `to` VEYA `audienceId` (biri zorunlu).
 * - `templateId` VEYA `body` (biri zorunlu). Değişkenler render edilir.
 * Toplu gönderim gateway'de rate-limit'li; her alıcı için send-log satırı.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.send")
  if ("error" in access) return access.error

  let body: {
    from?: string
    to?: string
    audienceId?: string
    templateId?: string
    body?: string
    variables?: Record<string, string>
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  // 1) from → bağlı (connected) bir numara
  const sessions = await whatsappSessionModel.listByCompany(access.companyId)
  const connected = sessions.filter((s) => s.status === "connected")
  if (connected.length === 0)
    return jsonError("No connected WhatsApp number. Connect a number first.", 400)
  const session = body.from
    ? connected.find(
        (s) => s.sessionId === body.from || s.phoneNumber === body.from,
      )
    : connected[0]
  if (!session)
    return jsonError(`'from' number is not connected: ${body.from ?? ""}`, 400)

  // 2) gövde: template veya ham body
  let bodyText: string
  let templateId: string | null = null
  if (body.templateId) {
    const tpl = await whatsappTemplateModel.findById(
      access.companyId,
      body.templateId,
    )
    if (!tpl) return jsonError("Template not found", 404)
    bodyText = tpl.body
    templateId = tpl.id
  } else if (typeof body.body === "string" && body.body.trim()) {
    bodyText = body.body
  } else {
    return jsonError("Either 'templateId' or 'body' is required", 422)
  }
  const requiredVars = parseEmailTemplate(bodyText).scalars

  // 3) alıcılar: tekil (to) veya toplu (audienceId)
  const globalVars =
    body.variables && typeof body.variables === "object" ? body.variables : {}
  let recipients: Recipient[] = []
  let audienceId: string | null = null
  if (body.audienceId) {
    const aud = await whatsappAudienceModel.findById(
      access.companyId,
      body.audienceId,
    )
    if (!aud) return jsonError("Audience not found", 404)
    audienceId = aud.id
    recipients = aud.entries.map((e) => ({
      to: e.phone,
      variables: { ...globalVars, ...(e.variables ?? {}) },
    }))
  } else if (typeof body.to === "string" && body.to.trim()) {
    recipients = [{ to: body.to.trim(), variables: globalVars }]
  } else {
    return jsonError("Either 'to' or 'audienceId' is required", 422)
  }
  if (recipients.length === 0)
    return jsonError("Audience has no recipients", 422)

  // 4) eksik değişken kontrolü (herhangi bir alıcı eksikse 422)
  for (const r of recipients) {
    const missing = requiredVars.filter((v) => !(v in r.variables))
    if (missing.length)
      return jsonError(
        `Missing template variables for ${r.to}: ${missing.join(", ")}`,
        422,
      )
  }

  // 5) aylık plan limiti (send-log ay-başı sayımı; -1 sınırsız)
  const monthlyLimit = whatsappMonthlyLimit(access.company)
  if (monthlyLimit >= 0) {
    const used = await whatsappSendLogModel.countSince(
      access.companyId,
      startOfMonthUtc(),
    )
    if (used + recipients.length > monthlyLimit)
      return jsonError(
        `Monthly WhatsApp send limit reached (${used}/${monthlyLimit}). Upgrade your plan.`,
        403,
      )
  }

  // 6) gönderim döngüsü (sıralı; gateway rate-limit'li). Per-alıcı log.
  let sent = 0
  let failed = 0
  const results: Array<{
    to: string
    status: "sent" | "failed"
    waMessageId?: string
    error?: string
  }> = []

  for (const r of recipients) {
    const text = renderEmailTemplate(bodyText, r.variables)
    let waMessageId: string | null = null
    let error: string | null = null
    try {
      const res = await fetch(
        gatewayUrl(`/sessions/${access.companyId}/${session.sessionId}/send`),
        {
          method: "POST",
          headers: gatewayJsonHeaders(),
          body: JSON.stringify({ to: r.to, text }),
        },
      )
      const payload = (await res.json().catch(() => ({}))) as {
        waMessageId?: string
        error?: string
      }
      if (!res.ok) error = payload.error || `HTTP ${res.status}`
      else waMessageId = payload.waMessageId ?? null
    } catch {
      error = "gateway unreachable"
    }

    const status: "sent" | "failed" = error ? "failed" : "sent"
    if (error) failed++
    else sent++

    await whatsappSendLogModel.create({
      companyId: access.companyId,
      sessionId: session.sessionId,
      to: r.to,
      templateId,
      audienceId,
      status,
      waMessageId,
      error,
      createdBy: access.callerUserId,
    })
    results.push({
      to: r.to,
      status,
      ...(waMessageId ? { waMessageId } : {}),
      ...(error ? { error } : {}),
    })
  }

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.send",
    resource: "whatsapp-send",
    resourceId: templateId ?? undefined,
    details: {
      sessionId: session.sessionId,
      total: recipients.length,
      sent,
      failed,
      audienceId,
    },
  })

  return jsonSuccess(
    { total: recipients.length, sent, failed, results },
    sent > 0 ? 201 : 502,
  )
}

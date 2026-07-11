export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { contactModel } from "@workspace/db/models"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { hasPermission } from "@workspace/auth/server/permissions"
import type { Permission } from "@workspace/db/types"

import { parseEmailTemplate } from "@workspace/ui/lib/email-template"

/** Returns scalar + section variable names referenced in a template string. */
function extractVariableNames(str: string): string[] {
  const parsed = parseEmailTemplate(str)
  return [...parsed.scalars, ...parsed.sections.map((s) => s.name)]
}

/** Pulls placeholder names out of LocalizedString | string | unknown values. */
function collectVariableNames(values: unknown[]): string[] {
  const all = new Set<string>()
  for (const v of values) {
    if (!v) continue
    if (typeof v === "string") {
      extractVariableNames(v).forEach((n) => all.add(n))
    } else if (typeof v === "object") {
      for (const inner of Object.values(v as Record<string, unknown>)) {
        if (typeof inner === "string") {
          extractVariableNames(inner).forEach((n) => all.add(n))
        }
      }
    }
  }
  return Array.from(all)
}

/** Returns the variable names that are required by the template but missing
 *  from the send payload. For batch mode (per-recipient variables), a name
 *  is "missing" only if NO recipient supplies it — and global body.variables
 *  also lacks it; that lets a batch fill names per-row without false
 *  positives.
 */
function isFilled(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "string") return value.length > 0
  if (typeof value === "number" || typeof value === "boolean") return true
  if (Array.isArray(value)) return value.length > 0
  return false
}

function findMissingVariables(
  required: string[],
  body: Record<string, unknown>,
): string[] {
  if (required.length === 0) return []
  const globals = (body.variables ?? {}) as Record<string, unknown>
  const recipients = Array.isArray(body.recipients)
    ? (body.recipients as Array<{ variables?: Record<string, unknown> }>)
    : []
  return required.filter((name) => {
    if (isFilled(globals[name])) return false
    if (recipients.length === 0) return true
    return !recipients.every((r) => isFilled(r.variables?.[name]))
  })
}

async function saveRecipients(slug: string, body: Record<string, unknown>) {
  const emails: string[] = []
  if (body.to) emails.push(body.to as string)
  if (Array.isArray(body.recipients)) {
    for (const r of body.recipients as { to: string }[]) {
      if (r.to) emails.push(r.to)
    }
  }
  if (body.cc) {
    const ccList = Array.isArray(body.cc)
      ? (body.cc as string[])
      : (body.cc as string).split(",").map((e: string) => e.trim())
    emails.push(...ccList.filter(Boolean))
  }

  if (emails.length === 0) return

  try {
    const db = await getDb()
    const company = await db.collection("companies").findOne({ slug })
    if (!company) return
    const companyId = company._id.toString()
    await Promise.all(
      emails.map((email) =>
        contactModel.upsertByEmail(companyId, email, {
          status: "active",
          lastEmailedAt: new Date(),
        } as any)
      )
    )
  } catch {
    // silent — don't fail the send
  }
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

  // Yetki kontrolu: global `send.execute` veya `from` mailbox'una inbox erisimi.
  // `hasPermission("inbox.mailbox:<from>")` kapsamli scope'u ve global
  // `inbox.view`'i otomatik olarak kapsar — dolayisiyla yanit yazabilmek icin
  // ayrica bir send yetkisi gerekmez (RFC davranisi: kutuyu okuyan yanitlar).
  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  const fromAddress =
    typeof body.from === "string" ? body.from.trim().toLowerCase() : ""

  // Access token ile erisimde permission kontrolu atlanir
  if (!result.isTokenAccess) {
    const canSendGlobal = await hasPermission(
      result.session!,
      slug,
      "send.execute",
    )
    const canSendFromMailbox = fromAddress
      ? await hasPermission(
          result.session!,
          slug,
          `inbox.mailbox:${fromAddress}` as Permission,
        )
      : false

    if (!canSendGlobal && !canSendFromMailbox) {
      return jsonError("Insufficient permissions", 403)
    }
  }

  // Aylik email limiti kontrolu
  const company = result.company as {
    monthlyEmailLimit?: number
    monthlyEmailsSent?: number
  }
  const monthlyLimit = company.monthlyEmailLimit ?? 0
  if (monthlyLimit > 0) {
    const sent = company.monthlyEmailsSent ?? 0
    const sending = Array.isArray(body.recipients)
      ? (body.recipients as unknown[]).length
      : 1
    if (sent + sending > monthlyLimit) {
      return jsonError(
        `Monthly email limit reached (${sent}/${monthlyLimit})`,
        403,
      )
    }
  }

  // Template variable validation — kullanıcı `{{userName}}` gibi placeholder
  // tanımlamış ama send payload'da değer geçmediyse mail literal placeholder
  // ile gider. Production kalitesi için sıkı reddet (422); UI ya değeri
  // sağlar ya hata mesajını gösterir. SDK consumer'lar için de aynı sözleşme
  // geçerli, bu doğru yer.
  if (typeof body.templateId === "string" && body.templateId) {
    try {
      const tpl = await result.sentroy!.templates.get(body.templateId)
      const data = tpl.data as
        | { subject?: unknown; mjmlBody?: unknown }
        | undefined
      if (data) {
        const required = collectVariableNames([data.subject, data.mjmlBody])
        const missing = findMissingVariables(required, body)
        if (missing.length > 0) {
          return jsonError(
            `Missing template variables: ${missing.join(", ")}`,
            422,
          )
        }
      }
    } catch (err) {
      // Template fetch fail edince validate edemeyiz — sentroy yanıtsızsa
      // send zaten patlar; burada sessiz geçip downstream error'a güveniriz.
      console.warn("[send] template variable check skipped:", err)
    }
  }

  try {
    let response

    if (Array.isArray(body.recipients)) {
      const res = await result.sentroy!.send.batch({
        recipients: body.recipients as Array<{
          to: string
          variables?: Record<string, string>
        }>,
        from: body.from as string,
        cc: body.cc as string | string[] | undefined,
        subject: body.subject as string,
        domainId: body.domainId as string,
        templateId: body.templateId as string | undefined,
        lang: body.lang as string | undefined,
        html: body.html as string | undefined,
        text: body.text as string | undefined,
        replyTo: body.replyTo as string | undefined,
        attachments: body.attachments as
          | { filename: string; content: string; contentType?: string }[]
          | undefined,
        scheduledAt: body.scheduledAt as string | undefined,
        headers: body.headers as Record<string, string> | undefined,
      })
      response = res.data
    } else {
      const res = await result.sentroy!.send.single({
        to: body.to as string,
        from: body.from as string,
        cc: body.cc as string | string[] | undefined,
        subject: body.subject as string,
        domainId: body.domainId as string,
        templateId: body.templateId as string | undefined,
        lang: body.lang as string | undefined,
        html: body.html as string | undefined,
        text: body.text as string | undefined,
        variables: body.variables as Record<string, string> | undefined,
        replyTo: body.replyTo as string | undefined,
        attachments: body.attachments as
          | { filename: string; content: string; contentType?: string }[]
          | undefined,
        scheduledAt: body.scheduledAt as string | undefined,
        headers: body.headers as Record<string, string> | undefined,
        inReplyTo: body.inReplyTo as string | undefined,
        references: body.references as string[] | undefined,
      })
      response = res.data
    }

    // Auto-save recipients as contacts (fire-and-forget)
    saveRecipients(slug, body)

    // monthlyEmailsSent counter — atomic $inc, fire-and-forget. Send
    // route limit kontrolünü zaten yukarıda yaptı; burada artırmak
    // sayacın kullanıcı tarafında doğru görünmesi için.
    const sentCount = Array.isArray(body.recipients)
      ? (body.recipients as unknown[]).length
      : 1
    if (result.companyId && sentCount > 0) {
      const { companyModel } = await import("@workspace/db/models")
      companyModel
        .incrementEmailsSent(result.companyId, sentCount)
        .catch((err) =>
          console.warn("[send] incrementEmailsSent failed:", err),
        )
    }

    return jsonSuccess(response, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to send email"
    return jsonError(message, 500)
  }
}

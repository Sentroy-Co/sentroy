import { SentroyClient } from "@sentroy-co/sdk"
import {
  companyModel,
  systemMailSettingsModel,
  domainAssignmentModel,
} from "@workspace/db/models"
import { SYSTEM_COMPANY_SLUG } from "@workspace/db/constants"

/**
 * auth2 process'i için system mail sender — apps/core/lib/system-mail.ts
 * ile aynı pattern. Auth project'lerin transactional mail'leri (verify-
 * email, password-reset, magic-link, new-device-alert) bu fonksiyon
 * üzerinden Sentroy mail platform'una gider.
 *
 * Resolver pattern apps/auth2/instrumentation.ts'te kayıt edilir:
 *   setSystemMailSender(sendSystemEmail)
 *
 * Provisioning: system company + key apps/core/admin'den önceden
 * kurulur. auth2 sadece tüketici — kurulu değilse silently no-op
 * (`no-domain-configured` / `not-provisioned`), auth flow patlamaz.
 */

const SENTROY_BASE = (
  process.env.NEXT_PUBLIC_SENTROY_API_URL || "http://localhost:3000/api/v1"
).replace(/\/api\/v\d+\/?$/, "")

async function getSystemSentroyClientReadonly(): Promise<SentroyClient | null> {
  const company = await companyModel.findBySlug(SYSTEM_COMPANY_SLUG)
  if (!company?.sentroyApiKey) return null
  return new SentroyClient({ baseUrl: SENTROY_BASE, apiKey: company.sentroyApiKey })
}

async function getDomainOwnerSentroyClient(
  domainId: string,
): Promise<SentroyClient | null> {
  const assignment = await domainAssignmentModel.findByDomainId(domainId)
  if (assignment) {
    const owner = await companyModel.findById(assignment.ownerCompanyId)
    if (owner?.sentroyApiKey) {
      return new SentroyClient({
        baseUrl: SENTROY_BASE,
        apiKey: owner.sentroyApiKey,
      })
    }
    console.warn(
      `[system-mail/auth2] domain ${domainId} assigned to ${assignment.ownerCompanyId} but target has no API key; falling back to system client`,
    )
  }
  return getSystemSentroyClientReadonly()
}

export interface SendSystemEmailInput {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export async function sendSystemEmail(
  input: SendSystemEmailInput,
): Promise<{ sent: boolean; reason?: string }> {
  const settings = await systemMailSettingsModel.get()
  if (!settings.systemMailDomainId) {
    console.warn("[system-mail/auth2] no domain configured, skipping send to", input.to)
    return { sent: false, reason: "no-domain-configured" }
  }

  const sentroy = await getDomainOwnerSentroyClient(
    settings.systemMailDomainId,
  )
  if (!sentroy) {
    console.warn("[system-mail/auth2] no client available for domain owner")
    return { sent: false, reason: "not-provisioned" }
  }

  let domainName: string
  try {
    const dRes = await sentroy.domains.get(settings.systemMailDomainId)
    if (!dRes.data?.domain) throw new Error("domain not found")
    domainName = dRes.data.domain
  } catch (err) {
    console.warn("[system-mail/auth2] domain lookup failed:", err)
    return { sent: false, reason: "domain-lookup-failed" }
  }

  const from = `${settings.fromAddress}@${domainName}`
  try {
    await sentroy.send.single({
      to: input.to,
      from,
      subject: input.subject,
      domainId: settings.systemMailDomainId,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      // Transactional auth project mail'leri — link integrity kritik.
      // Open/click tracking off; per-send override domain default'unu ezer.
      trackOpens: false,
      trackClicks: false,
    })
    return { sent: true }
  } catch (err) {
    console.error("[system-mail/auth2] send failed:", err)
    return { sent: false, reason: "send-failed" }
  }
}

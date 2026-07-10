import { NextRequest, NextResponse } from "next/server"
import { ensureSystemMailSender } from "@/lib/ensure-system-mail-sender"
import {
  getSystemMailSender,
} from "@workspace/auth/server/system-mail-sender"
import {
  getSystemMailEventResolver,
  sendSystemMailEvent,
} from "@workspace/auth/server/system-mail-events"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import { companyModel, systemMailSettingsModel } from "@workspace/db/models"
import { SYSTEM_COMPANY_SLUG } from "@workspace/db/constants"

ensureSystemMailSender()

/**
 * Diagnostic — mail sender pipeline'ın durumu. Internal-secret korumalı.
 *
 * Curl örnek:
 *   curl -H "x-internal-secret: $INTERNAL_API_SECRET" \
 *     https://status.sentroy.com/api/internal/diag/mail-sender
 *
 * `?send=email@test.com` query param verilirse o adrese gerçek test
 * verify mail tetikler ve sendResult döner.
 */
export async function GET(request: NextRequest) {
  const ok = await verifyInternalRequest(request)
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const senderRegistered = !!getSystemMailSender()
  const resolverRegistered = !!getSystemMailEventResolver()

  const systemCompany = await companyModel.findBySlug(SYSTEM_COMPANY_SLUG)
  const settings = await systemMailSettingsModel.get()

  const url = new URL(request.url)
  const sendTo = url.searchParams.get("send")
  let sendResult: { sent: boolean; reason?: string } | null = null
  if (sendTo) {
    sendResult = await sendSystemMailEvent("status.subscriber.verify-email", {
      to: sendTo,
      variables: {
        pageName: "Diag",
        subscriberEmail: sendTo,
        verifyUrl: "https://status.sentroy.com/diag-verify",
        unsubscribeUrl: "https://status.sentroy.com/diag-unsubscribe",
      },
    })
  }

  return NextResponse.json({
    senderRegistered,
    resolverRegistered,
    systemCompany: {
      found: !!systemCompany,
      hasApiKey: !!systemCompany?.sentroyApiKey,
      apiKeyPrefix: systemCompany?.sentroyApiKey?.slice(0, 8) ?? null,
    },
    systemMailSettings: {
      domainId: settings.systemMailDomainId ?? null,
      fromAddress: settings.fromAddress ?? null,
    },
    env: {
      SENTROY_API_URL: process.env.NEXT_PUBLIC_SENTROY_API_URL ?? null,
      hasInternalSecret: !!process.env.INTERNAL_API_SECRET,
    },
    sendResult,
  })
}

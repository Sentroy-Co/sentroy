import { NextRequest } from "next/server"
import { randomBytes } from "node:crypto"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { whatsappSessionModel } from "@workspace/db/models"
import type { WhatsappSession } from "@workspace/db/models/whatsapp-session"
import { gatewayUrl, gatewayJsonHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** credsBlob'ı asla dışarı sızdırma. */
function safe(s: WhatsappSession) {
  return {
    sessionId: s.sessionId,
    label: s.label,
    status: s.status,
    phoneNumber: s.phoneNumber,
    pushName: s.pushName,
    lastConnectedAt: s.lastConnectedAt,
    createdAt: s.createdAt,
  }
}

/** GET — şirketin bağlı numaraları (oturumları). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const sessions = await whatsappSessionModel.listByCompany(access.companyId)
  return jsonSuccess(sessions.map(safe))
}

/** POST — yeni numara/oturum oluştur + bağlantı başlat (QR). whatsapp.manage. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error

  let body: { label?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* label opsiyonel — boş body kabul */
  }

  const sessionId = randomBytes(8).toString("hex")
  const session = await whatsappSessionModel.create(
    access.companyId,
    sessionId,
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 60)
      : null,
  )

  // Gateway'de socket aç → QR akışı SSE ile gelir.
  try {
    await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/connect`),
      { method: "POST", headers: gatewayJsonHeaders() },
    )
  } catch {
    return jsonError("WhatsApp gateway unreachable", 503)
  }

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.session.create",
    resource: "whatsapp-session",
    resourceId: sessionId,
    details: { label: session.label },
  })

  return jsonSuccess(safe(session), 201)
}

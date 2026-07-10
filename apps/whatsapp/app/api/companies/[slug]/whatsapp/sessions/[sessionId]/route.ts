import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import {
  whatsappSessionModel,
  whatsappAuthKeyModel,
  whatsappContactModel,
  whatsappMessageModel,
} from "@workspace/db/models"
import { gatewayUrl, gatewayHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — tek oturumun durumu (canlı gateway + DB fallback). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const dbSession = await whatsappSessionModel.getBySession(
    access.companyId,
    sessionId,
  )
  if (!dbSession) return jsonError("Session not found", 404)

  let live: Record<string, unknown> | null = null
  try {
    const res = await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/status`),
      { headers: gatewayHeaders(), cache: "no-store" },
    )
    if (res.ok) live = await res.json()
  } catch {
    /* gateway down → DB snapshot */
  }

  return jsonSuccess({
    sessionId,
    label: dbSession.label,
    status: live?.status ?? dbSession.status,
    phoneNumber: live?.phoneNumber ?? dbSession.phoneNumber,
    pushName: live?.pushName ?? dbSession.pushName,
    hasQr: live?.hasQr ?? false,
    gatewayReachable: live !== null,
  })
}

/** POST — mevcut oturumu yeniden bağla (QR akışı SSE ile). whatsapp.manage. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error

  const dbSession = await whatsappSessionModel.getBySession(
    access.companyId,
    sessionId,
  )
  if (!dbSession) return jsonError("Session not found", 404)

  try {
    await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/connect`),
      { method: "POST", headers: gatewayHeaders() },
    )
  } catch {
    return jsonError("WhatsApp gateway unreachable", 503)
  }

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.session.reconnect",
    resource: "whatsapp-session",
    resourceId: sessionId,
  })

  return jsonSuccess({ ok: true })
}

/**
 * DELETE — oturumu kapat (logout). `?purge=true` ise numarayı tamamen kaldır
 * (auth keys + contacts + messages + session doc silinir). whatsapp.manage.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.manage")
  if ("error" in access) return access.error

  const purge = request.nextUrl.searchParams.get("purge") === "true"

  try {
    await fetch(gatewayUrl(`/sessions/${access.companyId}/${sessionId}`), {
      method: "DELETE",
      headers: gatewayHeaders(),
    })
  } catch {
    // gateway down olsa bile DB'yi temizle
    await whatsappSessionModel.clearSession(access.companyId, sessionId)
  }

  if (purge) {
    await Promise.all([
      whatsappAuthKeyModel.clearBySession(access.companyId, sessionId),
      whatsappContactModel.deleteBySession(access.companyId, sessionId),
      whatsappMessageModel.deleteBySession(access.companyId, sessionId),
    ])
    await whatsappSessionModel.deleteSession(access.companyId, sessionId)
  }

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: purge ? "whatsapp.session.purge" : "whatsapp.session.logout",
    resource: "whatsapp-session",
    resourceId: sessionId,
  })

  return jsonSuccess({ ok: true })
}

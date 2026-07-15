export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { checkRateLimit, rateLimitResponse } from "@workspace/console/lib/rate-limit"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { serverRootDomain, subAppOrigin } from "@workspace/auth/lib/domains"
import { audit } from "@workspace/console/lib/audit"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// meet.sentroy.com/call/<oda> — sanitizeRoom ile aynı alfabe ([a-z0-9-], ≤64).
const ROOM_RE = /^[a-z0-9-]{1,64}$/

/**
 * Sentroy Meet daveti — mobil/OS istemcisi bir oda üretir, alıcıya sistem
 * maili ile katılım linki gönderilir. Mailer'ın keyfi link taşıyıcısına
 * dönüşmemesi için URL yalnız `https://meet.<root>/call/<oda>` formatında
 * kabul edilir ve oda adından SERVER tarafında yeniden kurulur.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  // Oturumlu kullanıcı başına da spam duvarı: 10 davet / 10 dk / IP.
  const rl = checkRateLimit(request, { key: "meet-invite", window: 600, max: 10 })
  if (!rl.allowed) return rateLimitResponse(rl)

  let body: { email?: string; url?: string } = {}
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const email = (body.email ?? "").trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return jsonError("Valid recipient email required", 400)
  }

  const meetOrigin = subAppOrigin(serverRootDomain(), "meet")
  const rawUrl = (body.url ?? "").trim()
  if (!rawUrl.startsWith(`${meetOrigin}/call/`)) {
    return jsonError("url must be a Sentroy Meet call link", 400)
  }
  const room = rawUrl.slice(`${meetOrigin}/call/`.length).replace(/[?#].*$/, "")
  if (!ROOM_RE.test(room)) return jsonError("Invalid meeting room", 400)
  const url = `${meetOrigin}/call/${room}`

  const mail = await sendSystemMailEvent("meet.invitation", {
    to: email,
    variables: {
      inviterName: session.user.name || session.user.email || "A Sentroy user",
      url,
    },
  })
  if (!mail.sent) {
    return jsonError(`Invitation could not be sent (${mail.reason ?? "unknown"})`, 502)
  }

  await audit({
    userId: session.user.id,
    action: "meet.invite-sent",
    resource: "meet",
    resourceId: room,
    details: { recipient: email },
  })

  return jsonSuccess({ sent: true, url })
}

export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getClientIp, checkRateLimit, rateLimitResponse } from "@workspace/console/lib/rate-limit"
import { fetchIpInfo, type IpInfoResult } from "@workspace/auth/lib/ipinfo"
import { verifyTurnstileToken } from "@workspace/auth/server/security-protections"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { contactMessageModel } from "@workspace/db/models"
import { isContactCategory, htmlifyMultiline } from "@/lib/contact"

export const runtime = "nodejs"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/contact/messages — public iletişim formu gönderimi. Cloudflare
 * Turnstile ile korunur (spam), gönderenin IP/cihaz meta'sını (ipAddress/
 * userAgent/ipInfo) saklar (login ile aynı yakalama), mesajı contact_messages'a
 * yazar ve e-posta verildiyse "mesajınız alındı" (contact.received) mailini yollar.
 * Yatırımcılar bu formu değil, /contact'taki Turnstile-korumalı e-posta seçeneğini kullanır.
 */
export async function POST(req: NextRequest) {
  // IP başına backstop — Turnstile secret'siz/disabled ise fail-open olur;
  // rate-limit yine de sınırsız insert/mail/fetchIpInfo'yu kapatır (newsletter deseni).
  const rl = checkRateLimit(req, { key: "public:contact", window: 600, max: 5 })
  if (!rl.allowed) return rateLimitResponse(rl)

  let body: {
    name?: string
    email?: string
    category?: string
    subject?: string
    message?: string
    token?: string
    locale?: string
  }
  try {
    body = await req.json()
  } catch {
    return jsonError("Invalid body")
  }

  const name = (body.name ?? "").trim().slice(0, 120)
  const email = (body.email ?? "").trim().slice(0, 200)
  const category = (body.category ?? "general").trim()
  const subject = (body.subject ?? "").trim().slice(0, 200)
  const message = (body.message ?? "").trim().slice(0, 5000)
  const locale = body.locale === "tr" ? "tr" : "en"

  if (!name) return jsonError("Name is required")
  if (message.length < 2) return jsonError("Message is required")
  if (!isContactCategory(category)) return jsonError("Invalid category")
  if (email && !EMAIL_RE.test(email)) return jsonError("Invalid email")

  // Turnstile (login ile aynı helper). Disabled/secret-yok ise {ok:true}.
  const human = await verifyTurnstileToken(body.token, getClientIp(req))
  if (!human.ok) return jsonError("Verification failed", 403)

  // Gönderen meta (login session-hook ile aynı yakalama).
  const rawIp = getClientIp(req)
  const ip = rawIp && rawIp !== "unknown" ? rawIp : undefined
  const userAgent = req.headers.get("user-agent") || undefined
  let ipInfo: IpInfoResult | null = null
  if (ip) {
    try {
      ipInfo = await fetchIpInfo(ip)
    } catch {
      /* geo best-effort */
    }
  }

  const created = await contactMessageModel.create({
    name,
    email: email || null,
    category,
    subject: subject || null,
    message,
    locale,
    ipAddress: ip ?? null,
    userAgent: userAgent ?? null,
    ipInfo: ipInfo ?? null,
  })

  // "Mesajınız alındı" — yalnız e-posta verildiyse (fire-and-forget).
  if (email) {
    void sendSystemMailEvent("contact.received", {
      to: email,
      locale,
      variables: { name, message: htmlifyMultiline(message) },
    })
  }

  return jsonSuccess({ id: created.id }, 201)
}

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  checkRateLimit,
  rateLimitResponse,
} from "@workspace/console/lib/rate-limit"
import { newsletterSubscriberModel } from "@workspace/db/models"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/public/newsletter
 * Public: kullanicinin e-posta adresiyle newsletter listesine kayit.
 * Auth yok → IP başına rate-limit zorunlu (subscriber spam + DB şişirme
 * koruması). 10 dk pencerede 5 kayıt; gerçek ziyaretçi tek sefer abone olur.
 */
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, {
    key: "public:newsletter",
    window: 600,
    max: 5,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  let body: { email?: string; locale?: string; source?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const email = (body.email || "").trim().toLowerCase()
  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonError("A valid email is required")
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  const userAgent = request.headers.get("user-agent") || null

  const { created, subscriber } = await newsletterSubscriberModel.subscribe({
    email,
    locale: body.locale ?? null,
    source: body.source ?? "landing",
    ipAddress,
    userAgent,
  })

  return jsonSuccess({ created, email: subscriber.email })
}

export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import {
  companyModel,
  companyMemberModel,
} from "@workspace/db/models"
import { auth } from "@workspace/auth/server/auth"
import { ObjectId } from "mongodb"
import {
  checkRateLimit,
  rateLimitResponse,
} from "@workspace/console/lib/rate-limit"

/**
 * POST /api/auth/recover-by-slug
 *
 * Şifresini ve hangi e-postayla kayıt olduğunu unutan kullanıcılar için
 * iki adımlı endpoint:
 *
 *   • Adım 1 — Body `{ slug }`: company slug'ı altındaki owner + member
 *     hesaplarının e-postaları maskelenmiş (örn. `aks***@gmail.com`)
 *     listelenir. Slug yoksa boş liste döner — varlık doğrulanmaz.
 *
 *   • Adım 2 — Body `{ slug, candidateId }`: kullanıcının seçtiği masked
 *     adres ID'si server-side gerçek e-postaya çözülür ve better-auth'un
 *     reset link gönderme akışı tetiklenir. Generic success cevabı döner;
 *     eşleşme tutmuyorsa bile aynı cevap (timing leak önemli değil burada,
 *     candidateId zaten az önce listeden geldi).
 *
 * Hesap numaralandırma riski: slug listesi public bilgi sayılır (URL'de
 * görünür), ama e-posta sahiplerinin hangi adresler olduğu maskelenir;
 * gerçek adres asla cevapta dönmez.
 */

interface UserDoc {
  _id: ObjectId
  email?: string
  name?: string
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return "***"
  const visible = local.slice(0, Math.min(3, local.length))
  return `${visible}${local.length > 3 ? "***" : ""}@${domain}`
}

export async function POST(request: NextRequest) {
  // Rate limit — slug enumeration + reset spam koruması. better-auth'un
  // `/request-password-reset` endpoint'inde 3/saat var; burada da paralel
  // bir rota olduğu için aynı limiti uyguluyoruz. Yarışma değil — adım 1
  // (slug lookup) ve adım 2 (reset tetikleme) ortak counter'da; her ikisi
  // de aynı IP'den geliyor.
  const rl = checkRateLimit(request, {
    key: "auth:recover-by-slug",
    window: 3600,
    max: 5,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  let body: { slug?: string; candidateId?: string; redirectTo?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const slug = (body.slug ?? "").trim().toLowerCase()
  if (!slug) return jsonError("slug required")

  const company = await companyModel.findBySlug(slug)
  if (!company) {
    // Existence enumeration etme — boş liste / generic done dön.
    if (body.candidateId) return jsonSuccess({ done: true })
    return jsonSuccess({ candidates: [] })
  }

  const members = await companyMemberModel.findByCompany(company.id)
  const userIds = new Set<string>([company.ownerId, ...members.map((m) => m.userId)])
  if (userIds.size === 0) {
    if (body.candidateId) return jsonSuccess({ done: true })
    return jsonSuccess({ candidates: [] })
  }

  const db = await getDb()
  const userDocs = await db
    .collection<UserDoc>("user")
    .find({ _id: { $in: Array.from(userIds).map((id) => new ObjectId(id)) } })
    .project({ email: 1, name: 1 })
    .toArray()

  const candidates = userDocs
    .filter((u) => u.email)
    .map((u) => ({
      id: u._id.toString(),
      masked: maskEmail(u.email!),
      role:
        u._id.toString() === company.ownerId
          ? ("owner" as const)
          : ("member" as const),
    }))

  // ── Adım 2: reset tetikleme ────────────────────────────────────────────
  if (body.candidateId) {
    const picked = userDocs.find((u) => u._id.toString() === body.candidateId)
    if (!picked || !picked.email) {
      // Generic done — kullanıcıya "id geçersiz" leak etme.
      return jsonSuccess({ done: true })
    }
    try {
      // Better-auth'un kendi endpoint'ini çağır — token üretir, mail callback
      // (sendResetPassword) sistem mail sender üzerinden gönderir.
      await auth.api.requestPasswordReset({
        body: {
          email: picked.email,
          ...(body.redirectTo && { redirectTo: body.redirectTo }),
        },
        headers: request.headers,
      })
    } catch (err) {
      // Best-effort: mail sender kurulu değilse veya başka bir sebeple
      // patlasa kullanıcıya leak etme — generic success.
      console.warn("[recover-by-slug] requestPasswordReset failed:", err)
    }
    return jsonSuccess({ done: true })
  }

  // ── Adım 1: aday listesi ───────────────────────────────────────────────
  return jsonSuccess({ candidates })
}

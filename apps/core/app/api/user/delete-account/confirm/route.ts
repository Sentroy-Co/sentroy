export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { accountDeletionModel, companyModel, companyMemberModel } from "@workspace/db/models"
import { deleteCompanyCascade } from "@/lib/delete-company"
import { purgeUserData } from "@/lib/user-purge"
import { audit } from "@workspace/console/lib/audit"

/**
 * Hesap silme — 2. adım: e-postadaki 6 haneli kodla KALICI silme.
 *
 * Sıra:
 *   1. Kod doğrula (tek kullanımlık, 15 dk, 5 deneme).
 *   2. Kullanıcının SAHİBİ olduğu her şirket → tam kaskad
 *      (mail cleanup → storage purge → tüm şirket verisi → üyeler + şirket).
 *      Herhangi biri patlarsa DURUR — hesap silinmez, hata döner
 *      (yarım silinen hesap bırakmayız; şirketler idempotent, tekrar denenir).
 *   3. Kalan üyelikler + kullanıcı verisi + better-auth kayıtları + user dokümanı.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id || !session.user.email) {
    return jsonError("Unauthorized", 401)
  }
  const userId = session.user.id
  const email = session.user.email

  let body: { code?: string } = {}
  try {
    body = await request.json()
  } catch {}
  const code = (body.code ?? "").trim()
  if (!/^\d{6}$/.test(code)) {
    return jsonError("Enter the 6-digit code from your email", 400)
  }

  const verify = await accountDeletionModel.verifyAndConsume(userId, code)
  if (verify.status === "none") {
    return jsonError("No pending deletion request — request a new code", 400)
  }
  if (verify.status === "wrong") {
    return jsonError("Wrong code", 400)
  }

  // ── Sahip olunan şirketleri kaskadla sil ──
  const memberships = await companyMemberModel.findByUser(userId)
  const deletedCompanies: string[] = []
  for (const m of memberships) {
    const company = await companyModel.findById(m.companyId)
    if (!company || company.ownerId !== userId) continue
    const result = await deleteCompanyCascade(company, { actorUserId: userId })
    if (!result.ok) {
      return jsonError(
        `Company "${company.name}" could not be deleted (${result.error}). ` +
          `Account NOT deleted — already-deleted companies: [${deletedCompanies.join(", ") || "none"}]. ` +
          `Fix the issue and request a new code.`,
        502,
      )
    }
    deletedCompanies.push(company.slug)
  }

  // ── Kullanıcı verisi + auth kayıtları + user dokümanı ──
  const purge = await purgeUserData(userId, email)
  if (purge.errors.length > 0) {
    console.warn(`[account:delete] purge partial errors for ${userId}:`, purge.errors.join("; "))
  }

  // Audit — hesap silindikten sonra userId dangling kalır; kayıt uyum içindir.
  await audit({
    userId,
    action: "account.deleted",
    resource: "user",
    resourceId: userId,
    details: { deletedCompanies, purged: purge.deleted },
  })

  return jsonSuccess({ deleted: true, deletedCompanies })
}

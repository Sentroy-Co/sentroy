export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { accountDeletionModel, companyModel, companyMemberModel } from "@workspace/db/models"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { audit } from "@workspace/console/lib/audit"

/**
 * Hesap silme — 1. adım: kayıtlı e-postaya 6 haneli doğrulama kodu gönder.
 * Yanıt, kullanıcının SAHİBİ olduğu (hesapla birlikte silinecek) şirketleri
 * de döner — UI onay ekranında listeler. Kod 15 dk geçerli, hash'li saklanır.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id || !session.user.email) {
    return jsonError("Unauthorized", 401)
  }
  const userId = session.user.id

  // Silinecek şirketler: ownerId == user (tek sahip modeli — transfer-ownership
  // ile devredilmemiş her şirket kullanıcıya aittir).
  const memberships = await companyMemberModel.findByUser(userId)
  const owned: Array<{ slug: string; name: string }> = []
  for (const m of memberships) {
    const company = await companyModel.findById(m.companyId)
    if (company && company.ownerId === userId) {
      owned.push({ slug: company.slug, name: company.name })
    }
  }

  const code = await accountDeletionModel.create(userId)
  const mail = await sendSystemMailEvent("account.deletion-code", {
    to: session.user.email,
    variables: {
      userName: session.user.name || session.user.email,
      code,
      companyCount: String(owned.length),
    },
  })
  if (!mail.sent) {
    await accountDeletionModel.cancel(userId)
    return jsonError(
      `Verification email could not be sent (${mail.reason ?? "unknown"}) — account deletion aborted`,
      502,
    )
  }

  await audit({
    userId,
    action: "account.deletion-requested",
    resource: "user",
    resourceId: userId,
    details: { ownedCompanies: owned.map((c) => c.slug) },
  })

  return jsonSuccess({ sent: true, ownedCompanies: owned })
}

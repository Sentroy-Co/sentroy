import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { companyInvitationModel, companyModel } from "@workspace/db/models"

/**
 * Oturum açan kullanıcının e-postasına gelen TÜM bekleyen davetler.
 * First-run (şirket oluşturma) ekranında listelenir; kullanıcı buradan
 * doğrudan kabul edip çalışma alanına katılabilir. Token peek gerektirmez —
 * davet e-postası eşleşmesiyle server-side sorgulanır.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const email = (session.user.email ?? "").toLowerCase()
  if (!email) return jsonSuccess([])

  const invites = await companyInvitationModel.findAllPendingByEmail(email)

  const enriched = await Promise.all(
    invites.map(async (inv) => {
      const company = await companyModel.findById(inv.companyId)
      if (!company) return null
      return {
        token: inv.token,
        role: inv.role,
        expiresAt: inv.expiresAt,
        company: {
          name: company.name,
          slug: company.slug,
          avatarUrl: company.avatarUrl ?? null,
        },
      }
    }),
  )

  return jsonSuccess(enriched.filter(Boolean))
}

import { companyModel } from "@workspace/db/models"
import type { Company } from "@workspace/db/types"

/**
 * Bir kullanıcının sahip olabileceği FREE-plan şirket sayısı üst sınırı.
 * Hem şirket oluşturmada hem sahiplik devrinde (alıcı için) uygulanır.
 */
export const MAX_FREE_COMPANIES = 2

/**
 * Şirket free-plan mı? Aktif/trialing Polar aboneliği YOKSA free sayılır
 * (iptal/past_due de ücretli erişimini kaybettiği için free tarafında).
 */
export function isFreeCompany(company: Pick<Company, "subscription">): boolean {
  const sub = company.subscription
  return !sub || !["active", "trialing"].includes(sub.status)
}

/** Kullanıcının sahibi olduğu free-plan şirket sayısı. */
export async function countFreeOwnedCompanies(userId: string): Promise<number> {
  const owned = await companyModel.findByOwnerId(userId)
  return owned.filter(isFreeCompany).length
}

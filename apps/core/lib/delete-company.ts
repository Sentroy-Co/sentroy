// Company delete kaskadı — hem DELETE /api/companies/[slug] hem hesap silme
// (kullanıcının sahibi olduğu şirketler) tarafından kullanılır.
//
// Sıralama BİLİNÇLİ (2026-07-15 denetim düzeltmesi):
//   1. Mail cleanup ÖNCE — abort edebilen adım en başta; eski sırada storage
//      geri dönüşsüz purge edildikten sonra mail cleanup patlayınca şirket
//      "storage'ı yok edilmiş ama silinmemiş" limbo'da kalıyordu.
//   2. Storage purge (S3 + media + buckets).
//   3. purgeCompanyData — kalan TÜM şirket verisi (auth projects, oauth,
//      env vault, whatsapp, status page, polar iptali, ...).
//   4. Üyeler + company dokümanı.
import { companyMemberModel, companyModel, bucketModel } from "@workspace/db/models"
import type { Company } from "@workspace/db/types"
import { cdnPurgeBucket } from "@workspace/cdn-client"
import { internalAuthHeaders } from "@workspace/console/lib/internal-auth"
import { purgeCompanyData, type CompanyPurgeResult } from "./company-purge"

export interface CascadeResult {
  ok: boolean
  /** ok=false ise kullanıcıya gösterilecek hata (şirket SİLİNMEDİ). */
  error?: string
  bucketsDeleted?: number
  mailCleanup?: unknown
  purge?: CompanyPurgeResult
}

export async function deleteCompanyCascade(
  company: Company,
  opts: { actorUserId: string },
): Promise<CascadeResult> {
  // ── 1. Mail cleanup (abort edebilir — İLK adım) ──
  let mailCleanup: unknown = null
  if (company.sentroyApiKey) {
    const mailUrl = process.env.MAIL_APP_URL
    if (!mailUrl) {
      return { ok: false, error: "MAIL_APP_URL not configured — cannot cleanup mail resources" }
    }
    try {
      const res = await fetch(
        `${mailUrl.replace(/\/+$/, "")}/api/companies/${company.slug}/cleanup-mail`,
        { method: "POST", headers: internalAuthHeaders() },
      )
      const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: string }
      if (!res.ok) {
        return { ok: false, error: `Mail cleanup failed: ${json.error || res.status}. Company not deleted.` }
      }
      mailCleanup = json.data
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `Mail cleanup request failed: ${msg}. Company not deleted.` }
    }
  }

  // ── 2. Storage purge (S3 + media docs), sonra bucket dokümanları ──
  const buckets = await bucketModel.findByCompany(company.id)
  const purgeFailures: string[] = []
  for (const bucket of buckets) {
    try {
      const result = await cdnPurgeBucket({
        companyId: company.id,
        bucketId: bucket.id,
        userId: opts.actorUserId,
      })
      if (!result.success || result.docsRemaining > 0) {
        purgeFailures.push(`${bucket.id}: s3Failed=${result.s3Failed.length} docsRemaining=${result.docsRemaining}`)
      }
    } catch (err) {
      purgeFailures.push(`${bucket.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (purgeFailures.length > 0) {
    return {
      ok: false,
      error: `Storage purge failed for ${purgeFailures.length} bucket(s); company not deleted. ${purgeFailures.join("; ")}`,
    }
  }
  for (const bucket of buckets) {
    await bucketModel.deleteById(bucket.id)
  }

  // ── 3. Kalan tüm şirket verisi (denetim düzeltmesi) ──
  const purge = await purgeCompanyData(company)
  if (purge.errors.length > 0) {
    // Kısmi temizlik hatası silmeyi durdurmaz (tekrar süpürülebilir) ama iz bırak.
    console.warn(`[company:delete] purge partial errors for ${company.id}:`, purge.errors.join("; "))
  }

  // ── 4. Üyeler + company ──
  const members = await companyMemberModel.findByCompany(company.id)
  await Promise.all(members.map((m) => companyMemberModel.deleteById(m.id)))
  await companyModel.deleteById(company.id)

  return { ok: true, bucketsDeleted: buckets.length, mailCleanup, purge }
}

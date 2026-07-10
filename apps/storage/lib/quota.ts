import {
  bucketModel,
  companyModel,
  planModel,
} from "@workspace/db/models"

export interface StorageQuota {
  /** Bu company'nin tüm bucket'larında kullanılan byte toplamı. */
  used: number
  /** Plan tarafından tanımlanan byte üst sınırı (0 = sınırsız). */
  limit: number
  /** Mail tarafında kullanılan byte (aynı havuzdan paylaşılıyor). */
  mailUsed: number
  /** Plan adı (UI'de bilgi için). */
  planName?: string
}

/**
 * Company'nin storage quota'sını hesaplar. Mail ve storage aynı
 * `plan.storageLimit` havuzunu paylaşır — mail'in kullandığı byte
 * `company.mailStorageUsed`, storage'ınki bucket'ların toplam
 * `storageUsed` değeri.
 */
export async function getStorageQuota(companyId: string): Promise<StorageQuota> {
  const company = await companyModel.findById(companyId)
  if (!company) {
    return { used: 0, limit: 0, mailUsed: 0 }
  }

  const buckets = await bucketModel.findByCompany(companyId)
  const used = buckets.reduce((sum, b) => sum + b.storageUsed, 0)

  let limit = 0
  let planName: string | undefined
  if (company.planId) {
    const plan = await planModel.findById(company.planId)
    if (plan) {
      limit = plan.storageLimit
      planName = plan.name?.en || plan.name?.tr
    }
  }

  return {
    used,
    limit,
    mailUsed: company.mailStorageUsed ?? 0,
    planName,
  }
}

/**
 * Upload öncesi quota kontrolü. Yeni dosyanın byte'ını eklediğimizde
 * toplam limit'i aşarsa hata mesajı döner; geçerliyse `null`. Image
 * işleme sonrası gerçek byte daha küçük olabilir, bu yüzden "ön-kontrol"
 * ismi — kesin tüketim upload sonrası usage increment'iyle düşülür.
 */
export function checkQuotaHeadroom(
  quota: StorageQuota,
  incomingBytes: number,
): string | null {
  if (quota.limit <= 0) return null
  const totalAfter = quota.used + quota.mailUsed + incomingBytes
  if (totalAfter > quota.limit) {
    return `Storage quota exceeded: ${formatBytes(totalAfter)} > ${formatBytes(
      quota.limit,
    )}`
  }
  return null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

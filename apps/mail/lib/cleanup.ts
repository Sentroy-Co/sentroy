import type { Company } from "@workspace/db/types"
import { createSentroyClient } from "@/lib/sentroy"

export interface MailCleanupResult {
  /** Silinen domain sayısı (mailbox'larıyla). */
  domainsDeleted: number
  /** İptal edilen API key sayısı (caller key dahil). */
  keysRevoked: number
  /** Silinemeyen kaynakların kısa açıklama listesi (best-effort). */
  warnings: string[]
}

/**
 * Company silinirken mail sentroy server'da bıraktığımız kaynakları
 * temizler: domain'ler → domain'in mailbox'ları → domain'in kendisi →
 * company'nin tüm API key'leri. Caller'ın kullandığı key en son iptal
 * edilir ki sıra tamamlanana kadar 401 almayalım.
 *
 * Best-effort: tek tek kaynaklar için fail olsa bile devam eder, sonuçta
 * hangileri başarısız oldu listesini döner. Sentroy mail server erişilemez
 * ise throw eder — çağıran kararı verir (core company DELETE'inde throw
 * fail sayılır ve silme işlemi durur).
 */
export async function cleanupMail(company: Company): Promise<MailCleanupResult> {
  if (!company.sentroyApiKey) {
    // Provision edilmemiş company → temizlenecek bir şey yok
    return { domainsDeleted: 0, keysRevoked: 0, warnings: [] }
  }

  const sentroy = createSentroyClient(company.sentroyApiKey)
  const warnings: string[] = []
  let domainsDeleted = 0
  let keysRevoked = 0

  // 1. Domain'ler — her birinin mailbox'larını sil, sonra domain'in kendisini
  const domainsRes = await sentroy.domains.list({ limit: 1000 })
  const domains = domainsRes.data ?? []

  for (const d of domains) {
    try {
      await sentroy.mailboxes.deleteByDomain(d.id)
    } catch (err) {
      warnings.push(`mailbox cleanup failed for ${d.domain}: ${errMsg(err)}`)
    }
    try {
      await sentroy.domains.delete(d.id)
      domainsDeleted++
    } catch (err) {
      warnings.push(`domain delete failed for ${d.domain}: ${errMsg(err)}`)
    }
  }

  // 2. API key'ler — kendi key'imizi en sona bırak
  const keysRes = await sentroy.apiKeys.list()
  const keys = keysRes.data ?? []
  const callerKeyId = (await sentroy.apiKeys.me().catch(() => null))?.data?.id
  const ordered = [
    ...keys.filter((k) => k.id !== callerKeyId),
    ...keys.filter((k) => k.id === callerKeyId),
  ]
  for (const k of ordered) {
    try {
      await sentroy.apiKeys.revoke(k.id)
      keysRevoked++
    } catch (err) {
      warnings.push(`api key revoke failed for ${k.id}: ${errMsg(err)}`)
    }
  }

  return { domainsDeleted, keysRevoked, warnings }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

import { companyModel } from "@workspace/db/models"
import type { Company } from "@workspace/db/types"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"
import { createSentroyClient } from "@/lib/sentroy"

/**
 * Mail ürünü için lazy provisioning. Company'nin `sentroyApiKey`'i yoksa
 * sentroy mail server'da bir API key oluşturup company dokümanına yazar.
 * İdempotent — key zaten varsa hiçbir şey yapmaz, mevcut company döner.
 *
 * Layout'ta server-side çağrıldığında: user mail.sentroy.com'a ilk kez
 * girdiği company için otomatik provision olur, ilk sayfa render'ında key
 * hazırdır.
 */
export async function ensureMailProvisioned(
  company: Company,
): Promise<Company> {
  if (company.sentroyApiKey) return company

  const adminKey = await getEnvWithFallback("SENTROY_ADMIN_API_KEY")
  if (!adminKey) {
    throw new Error("SENTROY_ADMIN_API_KEY not configured")
  }

  const sentroy = createSentroyClient(adminKey)
  const keyResult = await sentroy.apiKeys.create({
    name: `${company.name} (${company.id})`,
    scopes: ["send", "read", "admin"],
    companyId: company.id,
  } as Parameters<typeof sentroy.apiKeys.create>[0])

  if (!keyResult.data?.key) {
    throw new Error("Mail server returned no key")
  }

  const updated = await companyModel.updateById(company.id, {
    sentroyApiKey: keyResult.data.key,
  } as any)

  return updated ?? { ...company, sentroyApiKey: keyResult.data.key }
}

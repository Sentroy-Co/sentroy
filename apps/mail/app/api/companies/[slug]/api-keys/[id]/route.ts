export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { createSentroyClient } from "@/lib/sentroy"

// Master admin key ID'sini tespit etmek için cache (aynı `api-keys/route.ts` ile
// paralel — buradaki kendi cache'i kullanılıyor, süreç boyunca değişmez)
let masterKeyIdCache: string | null | undefined = undefined

async function getMasterKeyId(): Promise<string | null> {
  if (masterKeyIdCache !== undefined) return masterKeyIdCache
  const adminKey = await getEnvWithFallback("SENTROY_ADMIN_API_KEY")
  if (!adminKey) {
    masterKeyIdCache = null
    return null
  }
  try {
    const admin = createSentroyClient(adminKey)
    const me = await admin.apiKeys.me()
    masterKeyIdCache = me.data?.id ?? null
  } catch {
    masterKeyIdCache = null
  }
  return masterKeyIdCache
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  // Master admin key revoke edilemez — güvenlik önlemi
  const masterId = await getMasterKeyId()
  if (masterId && id === masterId) {
    return jsonError("This key cannot be revoked", 403)
  }

  const result = await getSentroyForCompany(request, slug, "api-keys.manage")
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.apiKeys.revoke(id)
    return jsonSuccess({ message: "API key revoked" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to revoke API key"
    return jsonError(message, 500)
  }
}

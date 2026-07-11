export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { createSentroyClient } from "@/lib/sentroy"

// Master admin key ID cache — process yaşam boyu geçerli, değişmez
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const result = await getSentroyForCompany(request, slug, "api-keys.manage")
  if ("error" in result && result.error) return result.error

  try {
    const [keysRes, masterId] = await Promise.all([
      result.sentroy!.apiKeys.list(),
      getMasterKeyId(),
    ])

    let keys = keysRes.data ?? []
    if (masterId) {
      keys = keys.filter((k) => k.id !== masterId)
    }

    return jsonSuccess(keys)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list API keys"
    return jsonError(message, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: {
    name?: string
    scopes?: string[]
    domainId?: string
    expiresAt?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("Name is required")
  }

  if (!body.scopes || !Array.isArray(body.scopes) || body.scopes.length === 0) {
    return jsonError("At least one scope is required")
  }

  const result = await getSentroyForCompany(request, slug, "api-keys.manage")
  if ("error" in result && result.error) return result.error

  try {
    const created = await result.sentroy!.apiKeys.create({
      name: body.name.trim(),
      scopes: body.scopes as ("send" | "read" | "admin")[],
      domainId: body.domainId,
      expiresAt: body.expiresAt,
    })
    return jsonSuccess(created.data, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create API key"
    return jsonError(message, 500)
  }
}

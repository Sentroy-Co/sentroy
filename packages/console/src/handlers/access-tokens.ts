import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import * as AccessTokenModel from "@workspace/db/models/access-token"

/** `tokenHash`'i response'tan çıkar — client'a asla gönderilmez (SHA-256
 *  hash'i sızdırmak gereksiz saldırı yüzeyi; plaintext zaten yalnız create'te
 *  bir kez `plainToken` ile döner). oauth-clients handler ile aynı patern. */
function stripHash<T extends { tokenHash?: unknown }>(t: T): Omit<T, "tokenHash"> {
  const { tokenHash: _omit, ...rest } = t
  void _omit
  return rest
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error

  const tokens = await AccessTokenModel.findByCompany(access.companyId)
  return jsonSuccess(tokens.map(stripHash))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error

  let body: { name?: string; expiresAt?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const name = body.name?.trim()
  if (!name) return jsonError("Token name is required")

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null

  const { token, plainToken } = await AccessTokenModel.create({
    companyId: access.companyId,
    name,
    createdById: access.session?.user.id ?? "",
    expiresAt,
  })

  return jsonSuccess({ ...stripHash(token), plainToken }, 201)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in access) return access.error

  const tokenId = request.nextUrl.searchParams.get("id")
  if (!tokenId) return jsonError("Token id is required")

  // IDOR guard: yalnız bu company'nin token'ı silinebilir — başka
  // company'nin token'ı _id tahminiyle silinemez.
  const owned = await AccessTokenModel.findByCompany(access.companyId)
  if (!owned.some((tok) => tok.id === tokenId)) {
    return jsonError("Token not found", 404)
  }

  const deleted = await AccessTokenModel.deleteById(tokenId)
  if (!deleted) return jsonError("Token not found", 404)

  return jsonSuccess({ message: "Token revoked" })
}

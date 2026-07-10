import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { companyModel, companyMemberModel } from "@workspace/db/models"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"
import type { Permission } from "@workspace/db/types"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const access = await assertCompanyAccess(request, slug, "members.manage")
  if ("error" in access) return access.error

  const members = await companyMemberModel.findByCompany(access.companyId)

  const db = await getDb()
  const userIds = members.map((m) => m.userId)
  const users = await db
    .collection("user")
    .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
    .toArray()

  const userMap = new Map(
    users.map((u) => [
      u._id.toString(),
      { name: u.name, email: u.email, image: u.image },
    ]),
  )

  // Son aktif konum — her üyenin en yeni session'ının ipInfo'su (tek sorgu,
  // kullanıcı başına en yeni). session.userId string veya ObjectId olabilir.
  const idForms: (string | ObjectId)[] = userIds.flatMap((id) =>
    ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id],
  )
  const sessions = await db
    .collection("session")
    .find({ userId: { $in: idForms } })
    .project({ userId: 1, ipInfo: 1, updatedAt: 1 })
    .sort({ updatedAt: -1 })
    .toArray()
  const lastByUser = new Map<string, { location: string | null; at: Date | null }>()
  for (const s of sessions) {
    const uid = typeof s.userId === "string" ? s.userId : s.userId?.toString()
    if (!uid || lastByUser.has(uid)) continue // sorted desc → ilk = en yeni
    const ip = s.ipInfo as { city?: string; region?: string; country?: string } | null | undefined
    const location = ip
      ? [ip.city, ip.region, ip.country].filter((v): v is string => Boolean(v)).join(", ") || null
      : null
    lastByUser.set(uid, { location, at: (s.updatedAt as Date) ?? null })
  }

  const callerId = access.session?.user.id
  const enriched = members.map((m) => ({
    ...m,
    user: userMap.get(m.userId) || { name: "Unknown", email: "", image: null },
    lastActive: lastByUser.get(m.userId) ?? { location: null, at: null },
    isSelf: m.userId === callerId,
  }))

  return jsonSuccess(enriched)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const access = await assertCompanyAccess(request, slug, "members.manage")
  if ("error" in access) return access.error

  let body: { email?: string; role?: string; permissions?: string[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.email || typeof body.email !== "string" || !body.email.trim()) {
    return jsonError("Email is required")
  }

  const role = body.role === "admin" ? "admin" : "member"
  const permissions = (body.permissions || []) as Permission[]

  const db = await getDb()
  const user = await db
    .collection("user")
    .findOne({ email: body.email.trim() })
  if (!user) {
    return jsonError("User not found with this email", 404)
  }

  const userId = user._id.toString()

  const existing = await companyMemberModel.findByCompanyAndUser(
    access.companyId,
    userId,
  )
  if (existing) {
    return jsonError("User is already a member of this company")
  }

  // Plan limiti kontrolu
  const company = await companyModel.findById(access.companyId)
  const maxMembers = company?.maxMembers ?? 0
  if (maxMembers > 0) {
    const members = await companyMemberModel.findByCompany(access.companyId)
    if (members.length >= maxMembers) {
      return jsonError(
        `Member limit reached (${members.length}/${maxMembers})`,
        403,
      )
    }
  }

  const created = await companyMemberModel.create({
    companyId: access.companyId,
    userId,
    role,
    status: "active",
    permissions,
  })

  return jsonSuccess(
    {
      ...created,
      user: { name: user.name, email: user.email, image: user.image },
    },
    201,
  )
}

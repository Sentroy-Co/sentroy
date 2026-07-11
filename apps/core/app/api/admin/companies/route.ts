export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }
  if (session.user.role !== "admin") {
    return jsonError("Forbidden", 403)
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const search = searchParams.get("search") ?? ""

  const db = await getDb()
  const filter: Record<string, unknown> = {}

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
    ]
  }

  const total = await db.collection("companies").countDocuments(filter)
  const skip = (page - 1) * limit

  const companies = await db
    .collection("companies")
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()

  const ownerIds = [...new Set(companies.map((c) => c.ownerId))]
  const ownerObjectIds = ownerIds.map((id) => {
    try { return new ObjectId(id) } catch { return id }
  })
  const owners = await db
    .collection("user")
    .find({ _id: { $in: ownerObjectIds } })
    .toArray()

  const ownerMap = new Map<string, { name: string; email: string }>()
  for (const o of owners) {
    ownerMap.set(o._id.toString(), { name: o.name, email: o.email })
  }

  const companyIds = companies.map((c) => c._id.toString())
  const memberCounts = await db
    .collection("company_members")
    .aggregate([
      { $match: { companyId: { $in: companyIds } } },
      { $group: { _id: "$companyId", count: { $sum: 1 } } },
    ])
    .toArray()

  const memberCountMap = new Map<string, number>()
  for (const m of memberCounts) {
    memberCountMap.set(m._id, m.count)
  }

  // Storage kullanımı — her company'nin bucket'larındaki storageUsed toplamı.
  // (Önceden hiç hesaplanmıyordu → admin panelde her zaman 0 görünüyordu.)
  const storageAgg = await db
    .collection("buckets")
    .aggregate([
      { $match: { companyId: { $in: companyIds } } },
      {
        $group: {
          _id: "$companyId",
          storageUsed: { $sum: "$storageUsed" },
          fileCount: { $sum: "$fileCount" },
        },
      },
    ])
    .toArray()
  const storageMap = new Map<string, { storageUsed: number; fileCount: number }>()
  for (const s of storageAgg) {
    storageMap.set(s._id, {
      storageUsed: s.storageUsed ?? 0,
      fileCount: s.fileCount ?? 0,
    })
  }

  // Plan adı + limiti (plan company'ye atanır; kullanıcıya değil).
  const planIds = [
    ...new Set(companies.map((c) => c.planId).filter(Boolean) as string[]),
  ]
  const planObjectIds = planIds.flatMap((pid) => {
    try {
      return [new ObjectId(pid)]
    } catch {
      return []
    }
  })
  const plans = planIds.length
    ? await db
        .collection("plans")
        .find({ _id: { $in: planObjectIds } })
        .toArray()
    : []
  const planMap = new Map<string, { name?: Record<string, string>; storageLimit?: number }>()
  for (const p of plans) {
    planMap.set(p._id.toString(), {
      name: p.name,
      storageLimit: p.storageLimit,
    })
  }

  const mapped = companies.map((c) => {
    const { _id, ...rest } = c
    const id = _id.toString()
    const storage = storageMap.get(id) ?? { storageUsed: 0, fileCount: 0 }
    const plan = rest.planId ? planMap.get(rest.planId) : null
    return {
      id,
      ...rest,
      owner: ownerMap.get(rest.ownerId) ?? null,
      membersCount: memberCountMap.get(id) ?? 0,
      storageUsed: storage.storageUsed,
      fileCount: storage.fileCount,
      mailStorageUsed: rest.mailStorageUsed ?? 0,
      planName: plan ? plan.name?.en ?? plan.name?.tr ?? null : null,
      storageLimit: plan?.storageLimit ?? 0,
    }
  })

  return jsonSuccess({
    companies: mapped,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

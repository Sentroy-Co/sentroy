import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface SubRow {
  companyId: string
  companyName: string
  slug: string
  avatarUrl: string | null
  owner: { name: string; email: string } | null
  planId: string | null
  planName: string | null
  interval: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  environment: string
  price: number
  monthly: number
}

/**
 * GET — tüm aktif/eski Polar abonelikleri (admin billing). Kim, hangi plan,
 * ne zaman bitiyor, iptal işaretli mi + MRR özeti. Finansal görünürlük.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const db = await getDb()
  const companies = await db
    .collection("companies")
    .find({ subscription: { $ne: null } })
    .sort({ "subscription.updatedAt": -1 })
    .toArray()

  // Owner lookup
  const ownerIds = [...new Set(companies.map((c) => c.ownerId).filter(Boolean))]
  const ownerObjectIds = ownerIds.flatMap((id) => {
    try {
      return [new ObjectId(id)]
    } catch {
      return []
    }
  })
  const owners = ownerObjectIds.length
    ? await db.collection("user").find({ _id: { $in: ownerObjectIds } }).toArray()
    : []
  const ownerMap = new Map<string, { name: string; email: string }>()
  for (const o of owners) {
    ownerMap.set(o._id.toString(), { name: o.name, email: o.email })
  }

  // Plan lookup (ad + fiyat → MRR)
  const planIds = [
    ...new Set(
      companies
        .map((c) => c.subscription?.planId)
        .filter(Boolean) as string[],
    ),
  ]
  const planObjectIds = planIds.flatMap((id) => {
    try {
      return [new ObjectId(id)]
    } catch {
      return []
    }
  })
  const plans = planObjectIds.length
    ? await db.collection("plans").find({ _id: { $in: planObjectIds } }).toArray()
    : []
  const planMap = new Map<
    string,
    { name?: Record<string, string>; price?: number; yearlyPrice?: number }
  >()
  for (const p of plans) {
    planMap.set(p._id.toString(), {
      name: p.name,
      price: p.price,
      yearlyPrice: p.yearlyPrice,
    })
  }

  const subscriptions: SubRow[] = companies.map((c) => {
    const s = c.subscription ?? {}
    const plan = s.planId ? planMap.get(s.planId) : undefined
    const isPaying = s.status === "active" || s.status === "trialing"
    const price = plan?.price ?? 0
    let monthly = 0
    if (isPaying) {
      monthly =
        s.interval === "year"
          ? plan?.yearlyPrice
            ? plan.yearlyPrice / 12
            : price
          : price
    }
    return {
      companyId: c._id.toString(),
      companyName: c.name,
      slug: c.slug,
      avatarUrl: c.avatarUrl ?? null,
      owner: ownerMap.get(c.ownerId) ?? null,
      planId: s.planId ?? null,
      planName: plan ? (plan.name?.en ?? plan.name?.tr ?? null) : null,
      interval: s.interval ?? "month",
      status: s.status ?? "unknown",
      currentPeriodEnd: s.currentPeriodEnd
        ? new Date(s.currentPeriodEnd).toISOString()
        : null,
      cancelAtPeriodEnd: !!s.cancelAtPeriodEnd,
      environment: s.environment ?? "production",
      price,
      monthly,
    }
  })

  const summary = {
    total: subscriptions.length,
    active: subscriptions.filter(
      (s) => s.status === "active" || s.status === "trialing",
    ).length,
    trialing: subscriptions.filter((s) => s.status === "trialing").length,
    cancelingSoon: subscriptions.filter(
      (s) => s.cancelAtPeriodEnd && s.status === "active",
    ).length,
    pastDue: subscriptions.filter(
      (s) => s.status === "past_due" || s.status === "unpaid",
    ).length,
    mrr: Math.round(
      subscriptions.reduce((sum, s) => sum + s.monthly, 0) * 100,
    ) / 100,
  }

  return jsonSuccess({ subscriptions, summary })
}

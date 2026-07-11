export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { sanitizeLocalizedInput } from "@workspace/db/types"
import type { LocalizedString, PlanPolarMapping } from "@workspace/db/types"

/** Çok dilli özellik listesini sanitize et — boş satırları at. */
export function sanitizeFeatures(input: unknown): LocalizedString[] {
  if (!Array.isArray(input)) return []
  return input
    .map((f) => sanitizeLocalizedInput(f))
    .filter((f) => Object.values(f).some((v) => v.trim().length > 0))
}

/** Polar product eşlemesini normalize et (her ortam × interval). */
export function sanitizePolar(input: unknown): PlanPolarMapping | undefined {
  if (!input || typeof input !== "object") return undefined
  const i = input as Record<string, { monthlyProductId?: unknown; yearlyProductId?: unknown }>
  const env = (e?: { monthlyProductId?: unknown; yearlyProductId?: unknown }) => ({
    monthlyProductId:
      typeof e?.monthlyProductId === "string" ? e.monthlyProductId.trim() : "",
    yearlyProductId:
      typeof e?.yearlyProductId === "string" ? e.yearlyProductId.trim() : "",
  })
  return { sandbox: env(i.sandbox), production: env(i.production) }
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }
  if (session.user.role !== "admin") {
    return jsonError("Forbidden", 403)
  }

  const db = await getDb()
  const plans = await db
    .collection("plans")
    .find({})
    .sort({ createdAt: -1 })
    .toArray()

  const mapped = plans.map((p) => {
    const { _id, ...rest } = p
    return { id: _id.toString(), ...rest }
  })

  return jsonSuccess(mapped)
}

export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }
  if (session.user.role !== "admin") {
    return jsonError("Forbidden", 403)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.name || typeof body.name !== "object") {
    return jsonError("Plan name is required (LocalizedString)")
  }

  const now = new Date()
  const polar = sanitizePolar(body.polar)
  const plan: Record<string, unknown> = {
    name: body.name,
    description: body.description ?? { en: "", tr: "" },
    maxCompanies: typeof body.maxCompanies === "number" ? body.maxCompanies : 1,
    maxDomainsPerCompany: typeof body.maxDomainsPerCompany === "number" ? body.maxDomainsPerCompany : 1,
    maxMembersPerCompany: typeof body.maxMembersPerCompany === "number" ? body.maxMembersPerCompany : 5,
    maxMailboxesPerCompany: typeof body.maxMailboxesPerCompany === "number" ? body.maxMailboxesPerCompany : 5,
    maxContacts: typeof body.maxContacts === "number" ? body.maxContacts : 500,
    storageLimit: typeof body.storageLimit === "number" ? body.storageLimit : 1073741824,
    trashRetentionDays: typeof body.trashRetentionDays === "number" ? body.trashRetentionDays : 30,
    monthlyEmailLimit: typeof body.monthlyEmailLimit === "number" ? body.monthlyEmailLimit : 1000,
    maxWhatsappNumbers: typeof body.maxWhatsappNumbers === "number" ? body.maxWhatsappNumbers : 1,
    maxWhatsappTemplates: typeof body.maxWhatsappTemplates === "number" ? body.maxWhatsappTemplates : 5,
    monthlyWhatsappLimit: typeof body.monthlyWhatsappLimit === "number" ? body.monthlyWhatsappLimit : 200,
    features: sanitizeFeatures(body.features),
    price: typeof body.price === "number" ? body.price : 0,
    isDefault: body.isDefault === true,
    isActive: body.isActive !== false,
    createdAt: now,
    updatedAt: now,
  }
  if (typeof body.yearlyPrice === "number" && body.yearlyPrice > 0) {
    plan.yearlyPrice = body.yearlyPrice
  }
  if (polar) {
    plan.polar = polar
  }

  const db = await getDb()
  const result = await db.collection("plans").insertOne(plan)

  return jsonSuccess(
    { id: result.insertedId.toString(), ...plan },
    201,
  )
}

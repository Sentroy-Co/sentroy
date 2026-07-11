export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { contactMessageModel } from "@workspace/db/models"
import type { ContactMessageStatus } from "@workspace/db/models/contact-message"

export const runtime = "nodejs"

const STATUSES: ContactMessageStatus[] = ["new", "open", "replied", "closed"]

/** GET /api/admin/contact-messages — admin gelen-kutusu listesi + filtreler +
 *  atanabilir admin kullanıcılar + durum sayaçları. Sistem admin'e özel. */
export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const sp = request.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 30))
  const search = (sp.get("search") ?? "").trim() || undefined
  const statusParam = sp.get("status") ?? ""
  const status = STATUSES.includes(statusParam as ContactMessageStatus)
    ? (statusParam as ContactMessageStatus)
    : undefined
  const category = (sp.get("category") ?? "").trim() || undefined

  const [messages, total, statusCounts] = await Promise.all([
    contactMessageModel.list({ status, category, search, limit, skip: (page - 1) * limit }),
    contactMessageModel.count({ status, category, search }),
    contactMessageModel.statusCounts(),
  ])

  // Atanabilir adminler (assign dropdown'u).
  const db = await getDb()
  const adminDocs = await db
    .collection("user")
    .find({ role: "admin" }, { projection: { name: 1, email: 1 } })
    .limit(100)
    .toArray()
  const assignees = adminDocs.map((u) => ({
    id: u._id.toString(),
    name: (u.name as string) || (u.email as string) || "Admin",
    email: (u.email as string) || "",
  }))

  return jsonSuccess({
    messages,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    assignees,
    statusCounts,
  })
}

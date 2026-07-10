import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { getDb } from "@workspace/db/client"
import { companyMemberModel } from "@workspace/db/models"

/** Mention edilebilir Sentroy uygulamaları (OS ürün app'leri). id = `app:<key>`. */
const MENTIONABLE_APPS: { id: string; name: string }[] = [
  { id: "app:mail", name: "Mail" },
  { id: "app:storage", name: "Storage" },
  { id: "app:auth", name: "Auth" },
  { id: "app:status", name: "Status" },
  { id: "app:studio", name: "Studio" },
  { id: "app:whatsapp", name: "WhatsApp" },
  { id: "app:opencut", name: "OpenCut" },
  { id: "app:meet", name: "Meet" },
  { id: "app:tools", name: "Tools" },
]

/**
 * GET /api/companies/[slug]/mention-search?q=  — composer `@mention`
 * autocomplete. Aktif şirket ÜYELERİNİ + Sentroy UYGULAMALARINI ad'a göre
 * filtreler. Üyelik zorunlu (assertCompanyAccess).
 * Döner: { id, name, image, kind: "user"|"app" } (id: user → userId, app → `app:<key>`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase()

  const members = await companyMemberModel.findByCompany(access.companyId)
  const activeIds = members
    .filter((m) => m.status === "active")
    .map((m) => m.userId)
    .filter((id) => ObjectId.isValid(id))
  if (activeIds.length === 0) return jsonSuccess([])

  const db = await getDb()
  const users = await db
    .collection("user")
    .find(
      { _id: { $in: activeIds.map((id) => new ObjectId(id)) } },
      { projection: { name: 1, email: 1, image: 1, profileSlug: 1 } },
    )
    .toArray()

  const userHits = users
    .map((u) => ({
      id: u._id.toString(),
      name: (u.name as string) || (u.email as string) || "—",
      image: (u.image as string | null) ?? null,
      kind: "user" as const,
    }))
    .filter((u) => !q || u.name.toLowerCase().includes(q))
    .slice(0, 6)

  const appHits = MENTIONABLE_APPS.filter(
    (a) => !q || a.name.toLowerCase().includes(q),
  ).map((a) => ({ id: a.id, name: a.name, image: null as string | null, kind: "app" as const }))

  // Önce kullanıcılar, sonra app'ler; toplam 8.
  return jsonSuccess([...userHits, ...appHits].slice(0, 8))
}

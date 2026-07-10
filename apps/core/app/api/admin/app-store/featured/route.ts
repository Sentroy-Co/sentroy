import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { featuredAppsModel, sentroyAppModel } from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import { FIRST_PARTY_APPS } from "@/lib/app-store/first-party-catalog"

/**
 * Admin — App Store "Editor's Choice" birleşik sıralı seçkisi.
 * GET → mevcut sıralı liste + kurulabilir aday app'ler (first-party katalog +
 *       approved/public/enabled 3rd-party).
 * PUT { editorsChoice: string[] } → sıralı listeyi kaydeder.
 * Yalnız system admin.
 */

interface Candidate {
  appId: string
  name: string
  logoUrl: string
  color: string
  category: string
  firstParty: boolean
}

async function candidates(): Promise<Candidate[]> {
  const fp: Candidate[] = FIRST_PARTY_APPS.map((a) => ({
    appId: a.appId,
    name: a.name.en,
    logoUrl: a.logoUrl,
    color: a.color,
    category: a.category,
    firstParty: true,
  }))
  const approved = await sentroyAppModel.listPublic()
  const third: Candidate[] = approved.map((a) => ({
    appId: a.appId,
    name: a.name,
    logoUrl: a.appearance.logoUrl,
    color: a.appearance.color,
    category: a.appearance.category,
    firstParty: false,
  }))
  return [...fp, ...third]
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const [editorsChoice, list] = await Promise.all([featuredAppsModel.getEditorsChoice(), candidates()])
  // Ölü id'leri (kaldırılmış/suspend edilmiş app) filtrele — sıra korunur.
  const valid = new Set(list.map((c) => c.appId))
  return jsonSuccess({ editorsChoice: editorsChoice.filter((id) => valid.has(id)), candidates: list })
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let body: { editorsChoice?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonError("Invalid JSON", 400)
  }
  if (!Array.isArray(body.editorsChoice) || body.editorsChoice.some((x) => typeof x !== "string")) {
    return jsonError("editorsChoice must be a string array", 400)
  }
  // Yalnız geçerli aday id'leri kabul et (bilinmeyen id enjekte edilmesin).
  const valid = new Set((await candidates()).map((c) => c.appId))
  const cleaned = (body.editorsChoice as string[]).filter((id) => valid.has(id))

  const saved = await featuredAppsModel.setEditorsChoice(cleaned)

  await audit({
    userId: session.user.id,
    action: "app-store.featured.update",
    resource: "featured_apps",
    details: { count: cleaned.length, editorsChoice: cleaned },
    request: req,
  })

  return jsonSuccess({ editorsChoice: saved.editorsChoice })
}

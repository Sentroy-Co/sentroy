import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { sentroyAppModel, companyModel, companyMemberModel, appInstallModel, featuredAppsModel, registryStateModel } from "@workspace/db/models"
import { getDb } from "@workspace/db/client"
import { FIRST_PARTY_APPS, firstPartyInstallId } from "@/lib/app-store/first-party-catalog"
import { isHostedInstance, isSelfHostCapable } from "@/lib/app-store/self-host-capability"

/**
 * Mağaza listesi. First-party katalog (status/whatsapp/studio/opencut) SERVER
 * tarafında 3rd-party (onaylı + public + enabled) app'lerle MERGE edilir.
 *
 * `?category=&search=` VARKEN düz liste (`apps`, `sections: null`). YOKKEN
 * Apple-tarzı bölümler (`sections`): editorsChoice (featured_apps sıralı),
 * new (addedAt/createdAt desc), mostDownloaded (installCount desc).
 * `?lang=` first-party metinlerini çözer (default "en"). `?company=` aktif
 * şirketin private app'lerini ekler + install durumunu işaretler.
 */

interface Card {
  appId: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string
  color: string
  category: string
  ratingAvg: number
  ratingCount: number
  installCount: number
  pricing: { model: string }
  developer: { name: string; slug: string } | null
  /** registry satırlarında global istatistikler (yerel installCount'tan ayrı). */
  globalStats?: { installCount: number; ratingAvg: number; ratingCount: number } | null
  firstParty: boolean
  publisher: string | null
  installed: boolean
  /** Sıralama için ISO tarih (first-party addedAt, 3rd-party createdAt). */
  addedAt: string
  /** first-party detay (client-side render); 3rd-party'de undefined. */
  description?: string
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession(req)
  if (!session) return jsonError("Unauthorized", 401)

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category") || undefined
  const search = (searchParams.get("search") || "").trim().toLowerCase()
  const companySlug = searchParams.get("company") || undefined
  const lang = searchParams.get("lang") === "tr" ? "tr" : "en"
  const filtering = Boolean(category || search)

  // ── Aktif şirket + kullanıcının kurulu app id'leri ──────────────────────
  let companyId: string | null = null
  let installedIds = new Set<string>()
  if (companySlug) {
    const company = await companyModel.findBySlug(companySlug)
    if (company) {
      const member = await companyMemberModel.findByCompanyAndUser(company.id, session.user.id)
      if (member && member.status === "active") {
        companyId = company.id
        const installs = await appInstallModel.findByUserCompany(session.user.id, company.id)
        installedIds = new Set(installs.map((i) => i.appId))
      }
    }
  }

  // ── First-party katalog kartları ────────────────────────────────────────
  const fpCounts = await Promise.all(FIRST_PARTY_APPS.map((a) => appInstallModel.countActiveForApp(firstPartyInstallId(a.appId))))
  const firstPartyCards: Card[] = FIRST_PARTY_APPS.map((a, i) => ({
    appId: a.appId,
    slug: a.appId,
    name: a.name[lang],
    tagline: a.tagline[lang],
    logoUrl: a.logoUrl,
    color: a.color,
    category: a.category,
    ratingAvg: 0,
    ratingCount: 0,
    installCount: fpCounts[i] ?? 0,
    pricing: { model: "free" },
    developer: null,
    firstParty: true,
    publisher: a.publisher,
    installed: installedIds.has(firstPartyInstallId(a.appId)),
    addedAt: a.addedAt,
    description: a.description[lang],
  }))

  // ── 3rd-party app'ler ───────────────────────────────────────────────────
  let apps3 = await sentroyAppModel.listPublic(category ? { category } : undefined)
  if (companyId) {
    apps3 = [...apps3, ...(await sentroyAppModel.listPrivateForCompany(companyId, category ? { category } : undefined))]
  }

  // C1 self-host uyumluluk kapısı: self-host'ta backend'i auth.sentroy.com'a
  // pinlenmiş token/oauth app'leri sunma (401 verirdi). Hosted'da hepsi geçer
  // → mevcut liste değişmez.
  const hosted = isHostedInstance()
  apps3 = apps3.filter((a) => isSelfHostCapable(a, { isHosted: hosted }))

  // Geliştirici şirket adlarını toplu çöz (registry satırları developerCompanyId
  // null → sorgudan hariç; onlar registryDeveloper subdoc'undan çözülür).
  const devIds = Array.from(
    new Set(
      apps3
        .map((a) => a.developerCompanyId)
        .filter((x): x is string => typeof x === "string" && ObjectId.isValid(x)),
    ),
  )
  const db = await getDb()
  const companies = devIds.length
    ? await db.collection("companies").find({ _id: { $in: devIds.map((i) => new ObjectId(i)) } }).project({ name: 1, slug: 1 }).toArray()
    : []
  const companyMap = new Map(companies.map((c) => [c._id.toString(), { name: c.name as string, slug: c.slug as string }]))

  const thirdPartyCards: Card[] = apps3.map((a) => {
    const isRegistry = a.source === "registry"
    const developer = isRegistry
      ? a.registryDeveloper
        ? { name: a.registryDeveloper.name, slug: a.registryDeveloper.slug }
        : null
      : a.developerCompanyId
        ? (companyMap.get(a.developerCompanyId) ?? null)
        : null
    return {
      appId: a.appId,
      slug: a.slug,
      name: a.name,
      tagline: a.tagline,
      logoUrl: a.appearance.logoUrl,
      color: a.appearance.color,
      category: a.appearance.category,
      ratingAvg: a.ratingAvg,
      ratingCount: a.ratingCount,
      installCount: a.installCount,
      pricing: a.pricing,
      developer,
      // Registry global istatistikleri ayrı gösterilir; yerel sayaçları ezmez.
      globalStats: isRegistry ? (a.registryStats ?? null) : null,
      firstParty: false,
      publisher: null,
      installed: installedIds.has(a.id),
      addedAt: (a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)).toISOString(),
    }
  })

  // First-party kategori filtresi (3rd-party listPublic zaten filtreli).
  const fpFiltered = category ? firstPartyCards.filter((c) => c.category === category) : firstPartyCards
  let cards: Card[] = [...fpFiltered, ...thirdPartyCards]

  if (search) {
    cards = cards.filter(
      (c) => c.name.toLowerCase().includes(search) || (c.tagline ?? "").toLowerCase().includes(search),
    )
  }

  // ── Bölümler (yalnız filtre yokken) ─────────────────────────────────────
  let sections: { editorsChoice: Card[]; new: Card[]; mostDownloaded: Card[] } | null = null
  if (!filtering) {
    const byAppId = new Map(cards.map((c) => [c.appId, c]))
    // H4: yerel admin curation (featured_apps) katalog editorsChoice'unu EZMEZ.
    // Öncelik: localFeaturedOverride > (featured_apps + katalog append). Var olan
    // registry state yoksa (hosted pre-dogfood) order = featured_apps → aynı.
    const localOverride = await registryStateModel.getLocalFeatured()
    let order: string[]
    if (localOverride) {
      order = localOverride
    } else {
      const local = await featuredAppsModel.getEditorsChoice()
      const catalog = await registryStateModel.getCatalogFeatured()
      order = [...local, ...catalog.filter((id) => !local.includes(id))]
    }
    // byAppId.get zaten blocked/disabled/absent app'leri (cards'ta yoklar) eler.
    const editorsChoice = order.map((id) => byAppId.get(id)).filter((c): c is Card => Boolean(c))

    const byNew = [...cards].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 8)
    const byInstalls = [...cards].sort((a, b) => b.installCount - a.installCount).slice(0, 8)

    sections = { editorsChoice, new: byNew, mostDownloaded: byInstalls }
  }

  return jsonSuccess({ apps: cards, sections })
}

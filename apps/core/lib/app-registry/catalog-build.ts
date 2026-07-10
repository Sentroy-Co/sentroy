import { ObjectId } from "mongodb"
import { getDb } from "@workspace/db/client"
import { sentroyAppModel, featuredAppsModel } from "@workspace/db/models"
import type { SentroyApp } from "@workspace/db/types"

/**
 * Registry katalog payload'ları (sentroy.com export tarafı). Envelope'un
 * TAMAMI Ed25519 attached-JWS ile imzalanır (bkz. app-registry-jws.ts).
 *
 * H1 (v1): authMode==="oauth" app'ler katalogtan HARİÇ tutulur — instance'ta
 * install-anında yerel oauthClientId mint hook'u henüz yok (v2 / O11).
 */

export interface CatalogApp {
  appId: string
  slug: string
  currentVersion: string
  manifestVersion: number
  /** currentVersion'a karşılık gelen ham manifest — instance strict re-parse eder. */
  manifestSnapshot: Record<string, unknown> | null
  /** Denormalize geliştirici kimliği (yerel FK değil). */
  registryDeveloper: { name: string; slug: string; verified: boolean } | null
  /** GLOBAL istatistikler (instance'ın yerel sayaçlarını EZMEZ). */
  registryStats: { installCount: number; ratingAvg: number; ratingCount: number }
  hostedOnly: boolean
  supportsSelfHostedIssuers: boolean
  originVerifiedAt: string | null
}

export interface CatalogEnvelope {
  /** Monotonic etiket (= generatedAt ISO). İzlenebilirlik; asıl floor generatedAt. */
  version: string
  generatedAt: string
  /** now + APP_REGISTRY_CATALOG_TTL — instance replay/expiry sınırı (C3). */
  expiresAt: string
  apps: CatalogApp[]
  editorsChoice: string[]
  /** Sticky revocation appId'leri (v1: boş — merkezi revocation UI O6). */
  revocations: string[]
}

function toCatalogApp(
  app: SentroyApp,
  developer: { name: string; slug: string } | null,
): CatalogApp {
  const snap =
    app.versions.find((v) => v.version === app.currentVersion) ??
    app.versions[app.versions.length - 1] ??
    null
  return {
    appId: app.appId,
    slug: app.slug,
    currentVersion: app.currentVersion,
    manifestVersion: app.manifestVersion,
    manifestSnapshot: snap?.manifestSnapshot ?? null,
    // verified: v1'de company-doğrulama sistemi yok → false (ileride badge).
    registryDeveloper: developer
      ? { name: developer.name, slug: developer.slug, verified: false }
      : null,
    registryStats: {
      installCount: app.installCount,
      ratingAvg: app.ratingAvg,
      ratingCount: app.ratingCount,
    },
    hostedOnly: app.hostedOnly ?? false,
    supportsSelfHostedIssuers: app.supportsSelfHostedIssuers ?? false,
    originVerifiedAt: app.originVerifiedAt ? app.originVerifiedAt.toISOString() : null,
  }
}

function catalogTtlSeconds(): number {
  const n = Number(process.env.APP_REGISTRY_CATALOG_TTL)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 86400
}

/** developerCompanyId → {name,slug} toplu çözümü (registry satırlarında null olur). */
async function resolveDevelopers(
  apps: SentroyApp[],
): Promise<Map<string, { name: string; slug: string }>> {
  const ids = Array.from(
    new Set(
      apps
        .map((a) => a.developerCompanyId)
        .filter((x): x is string => typeof x === "string" && ObjectId.isValid(x)),
    ),
  )
  if (ids.length === 0) return new Map()
  const db = await getDb()
  const rows = await db
    .collection("companies")
    .find({ _id: { $in: ids.map((i) => new ObjectId(i)) } })
    .project({ name: 1, slug: 1 })
    .toArray()
  return new Map(
    rows.map((c) => [c._id.toString(), { name: c.name as string, slug: c.slug as string }]),
  )
}

/** Tam katalog envelope'unu üret (imzalanmadan önce). */
export async function buildFullCatalog(now: Date): Promise<CatalogEnvelope> {
  const apps = (await sentroyAppModel.listPublic()).filter((a) => a.authMode !== "oauth")
  const devMap = await resolveDevelopers(apps)
  const editorsChoice = await featuredAppsModel.getEditorsChoice()
  const iso = now.toISOString()
  const expiresAt = new Date(now.getTime() + catalogTtlSeconds() * 1000).toISOString()
  return {
    version: iso,
    generatedAt: iso,
    expiresAt,
    apps: apps.map((a) =>
      toCatalogApp(a, a.developerCompanyId ? (devMap.get(a.developerCompanyId) ?? null) : null),
    ),
    editorsChoice,
    revocations: [],
  }
}

/** Tek app envelope'u (apps/[appId] route). Bulunamazsa/oauth ise null. */
export async function buildSingleAppCatalog(
  appId: string,
  now: Date,
): Promise<CatalogEnvelope | null> {
  const app = await sentroyAppModel.findByAppId(appId)
  if (
    !app ||
    app.status !== "approved" ||
    app.visibility !== "public" ||
    !app.enabled ||
    app.authMode === "oauth"
  ) {
    return null
  }
  const devMap = await resolveDevelopers([app])
  const iso = now.toISOString()
  const expiresAt = new Date(now.getTime() + catalogTtlSeconds() * 1000).toISOString()
  return {
    version: iso,
    generatedAt: iso,
    expiresAt,
    apps: [toCatalogApp(app, app.developerCompanyId ? (devMap.get(app.developerCompanyId) ?? null) : null)],
    editorsChoice: [],
    revocations: [],
  }
}

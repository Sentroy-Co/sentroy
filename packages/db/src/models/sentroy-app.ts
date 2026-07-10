import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import type { OAuthScope } from "./oauth-client"

const COLLECTION = "sentroy_apps"

/** versions[] retention — her entry tam manifestSnapshot gömer; 16MB doc
 *  limitine karşı son N sürümü tut (upsertRegistryApp + dashboard resubmit). */
export const MAX_VERSION_HISTORY = 20

/**
 * Sentroy App Store — üçüncü-parti uygulama kaydı.
 *
 * Dış geliştiriciler (örn. Resend) kendi sunucularında çalışan bir web app'ini
 * Sentroy OS'a iframe ile gömer. Manifest (`ad.sentroy-app.json`) doğrulanıp
 * (`@workspace/app-manifest`) bu kayda dönüştürülür. GÜVENLİK: sandbox/allow
 * string'leri, embedOrigin, granted scope'lar SERVER-side hesaplanıp burada
 * saklanır — runtime descriptor ham manifest'ten DEĞİL bu kayıttan kurulur.
 *
 * `visibility: "private"` + `ownerUserId` = kişisel app (yalnız sahibine
 * görünür, paylaşılan mağazaya girmez, origin'i yalnız sahibinin CSP'sine
 * eklenir).
 */

export type SentroyAppStatus = "draft" | "pending" | "approved" | "rejected" | "suspended"
export type SentroyAppVisibility = "public" | "private"
/** "registry" = merkezi Sentroy katalogundan sync'lenen satır (Faz 5). */
export type SentroyAppSource = "dashboard" | "github" | "personal" | "registry"
export type SentroyAppAuthMode = "none" | "token" | "oauth"

/**
 * Registry satırının denormalize geliştirici kimliği. Yerel bir company FK'sı
 * YOKTUR (developerCompanyId null); bu subdoc yalnız GÖRÜNTÜ metadata'sıdır,
 * bir erişim-kontrol principal'ı DEĞİLDİR.
 */
export interface RegistryDeveloper {
  name: string
  slug: string
  verified: boolean
}

/**
 * Registry satırının GLOBAL istatistikleri (sentroy.com üzerindeki figürler).
 * Yerel denormalize sayaçlardan (installCount/ratingAvg/ratingCount) AYRI tutulur
 * ve onları ASLA ezmez — "N kurulum (sentroy.com'da)" gibi gösterilir.
 */
export interface RegistryStats {
  installCount: number
  ratingAvg: number
  ratingCount: number
}

export interface SentroyAppScreenshot {
  url: string
  alt: string | null
  width: number | null
  height: number | null
}

export interface SentroyAppVersion {
  version: string
  manifestVersion: number
  manifestSnapshot: Record<string, unknown>
  syncedAt: Date
  changelog: string | null
}

export interface SentroyAppPolar {
  mode: "sandbox" | "production"
  productIds: string[]
  kind: "subscription" | "one_time"
}

export interface SentroyApp {
  id: string
  /** Immutable manifest identity.id — global unique. */
  appId: string
  /** Mağaza URL slug — unique. */
  slug: string
  name: string
  tagline: string | null
  /** Yerel geliştirici company FK'sı. registry satırlarında NULL (merkezi kayıt,
   *  yerel company yok). Consumer'lar null-safe olmalı (ObjectId.isValid guard). */
  developerCompanyId: string | null
  /** registry satırlarında NULL — "<system>" gibi string literal DEĞİL (userModel
   *  .findById tüketicilerinde BSONError üretirdi). */
  submittedByUserId: string | null
  visibility: SentroyAppVisibility
  /** private app sahibi; public ise null. */
  ownerUserId: string | null
  status: SentroyAppStatus
  source: SentroyAppSource
  currentVersion: string
  manifestVersion: number
  /** Embed iframe URL'i + türetilmiş origin (CSP + token aud). */
  embedUrl: string
  embedOrigin: string
  /** OS'un iframe URL'sine enjekte edeceği param'lar (manifest embed.injectedParams). */
  injectedParams: string[]
  /** İçerik için minimum yükseklik (px) — manifest embed.minHeight. */
  minHeight: number | null
  authMode: SentroyAppAuthMode
  jwksAudience: string | null
  requiredScopes: OAuthScope[]
  /** auth.mode=oauth onayında üretilen client; aksi halde null. */
  oauthClientId: string | null
  /** SERVER-side hesaplanan iframe güvenlik attribute'ları. */
  sandboxAttr: string
  allowAttr: string
  appearance: {
    logoUrl: string
    color: string
    category: string
    screenshots: SentroyAppScreenshot[]
  }
  store: {
    description: string
    longDescription: string | null
    supportUrl: string | null
    privacyUrl: string
    termsUrl: string | null
    supportedLangs: string[]
    fallbackLang: string
  }
  pricing: {
    model: "free" | "paid"
    polar: SentroyAppPolar | null
  }
  /** Origin sahiplik doğrulama (well-known) — onay öncesi. */
  verificationToken: string
  originVerifiedAt: Date | null
  reviewedByUserId: string | null
  reviewedAt: Date | null
  rejectionReason: string | null
  installCount: number
  ratingAvg: number
  ratingCount: number
  /** Editor's Choice rozeti (admin). Birleşik sıralı seçki `featured_apps`
   *  singleton'ında tutulur; bu alan additive metadata'dır (opsiyonel). */
  editorsChoice?: boolean
  /** Editor's Choice sırası (küçük = önce). Opsiyonel. */
  featuredRank?: number
  /** registry satırının denormalize geliştirici kimliği (source="registry"). */
  registryDeveloper?: RegistryDeveloper | null
  /** registry satırının global istatistikleri (yerel sayaçları EZMEZ). */
  registryStats?: RegistryStats | null
  /** registry satırı için YEREL admin override'ı (merkezi status'tan ayrı).
   *  "disabled" → enabled hesaplaması false yapar; sync bunu ASLA yazmaz. */
  localState?: "enabled" | "disabled"
  /** manifest capabilities.supportsSelfHostedIssuers — self-host uyumluluk
   *  kapısı (bkz. self-host-capability.ts). build-record'da türetilir. */
  supportsSelfHostedIssuers?: boolean
  /** manifest store.hostedOnly — advisory görüntü rozeti. */
  hostedOnly?: boolean
  versions: SentroyAppVersion[]
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findById(id: string): Promise<SentroyApp | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findByAppId(appId: string): Promise<SentroyApp | null> {
  const c = await col()
  const doc = await c.findOne({ appId })
  return doc ? toId(doc) : null
}

export async function findBySlug(slug: string): Promise<SentroyApp | null> {
  const c = await col()
  const doc = await c.findOne({ slug })
  return doc ? toId(doc) : null
}

/** Bir şirketin gönderdiği app'ler (dashboard yönetimi). */
export async function findByCompany(developerCompanyId: string): Promise<SentroyApp[]> {
  const c = await col()
  const docs = await c.find({ developerCompanyId }).sort({ updatedAt: -1 }).toArray()
  return docs.map(toId)
}

/** Bir kullanıcının kişisel (private) app'leri. */
export async function findPrivateByUser(ownerUserId: string): Promise<SentroyApp[]> {
  const c = await col()
  const docs = await c.find({ visibility: "private", ownerUserId }).sort({ updatedAt: -1 }).toArray()
  return docs.map(toId)
}

/** Onay kuyruğu (admin) — pending app'ler. */
export async function listPending(): Promise<SentroyApp[]> {
  const c = await col()
  const docs = await c.find({ status: "pending" }).sort({ createdAt: 1 }).toArray()
  return docs.map(toId)
}

/** Mağaza listesi — onaylı, public, enabled. */
export async function listPublic(opts?: { category?: string }): Promise<SentroyApp[]> {
  const c = await col()
  const filter: Record<string, unknown> = { status: "approved", visibility: "public", enabled: true }
  if (opts?.category) filter["appearance.category"] = opts.category
  const docs = await c.find(filter).sort({ ratingAvg: -1, installCount: -1 }).toArray()
  return docs.map(toId)
}

/** Şirketin herkese açık (public) profil sayfasını hak edip etmediği —
 *  ≥1 onaylı+public+enabled app'i var mı? Public developer profili
 *  (`/[lang]/store/dev/[slug]`) yalnız bu true iken çözülür; store detail
 *  developer linkini buna göre tıklanabilir yapar (404 ölü link olmasın). */
export async function hasPublicApps(developerCompanyId: string): Promise<boolean> {
  const c = await col()
  const n = await c.countDocuments(
    { status: "approved", visibility: "public", enabled: true, developerCompanyId },
    { limit: 1 },
  )
  return n > 0
}

/** Bir şirkete-özel (private) onaylı app'ler — yalnız o şirketin üyeleri görür. */
export async function listPrivateForCompany(developerCompanyId: string, opts?: { category?: string }): Promise<SentroyApp[]> {
  const c = await col()
  const filter: Record<string, unknown> = { status: "approved", visibility: "private", enabled: true, developerCompanyId }
  if (opts?.category) filter["appearance.category"] = opts.category
  const docs = await c.find(filter).sort({ updatedAt: -1 }).toArray()
  return docs.map(toId)
}

/** CSP frame-src — onaylı + enabled app origin'leri (public + private). Private
 * origin'in allow-list'te olması zararsız (CSP yalnız frame'leme iznidir, app
 * keşfini açmaz; görünürlük store/install sorgularında filtrelenir). */
export async function listApprovedEmbedOrigins(): Promise<string[]> {
  const c = await col()
  const origins = await c.distinct("embedOrigin", { status: "approved", enabled: true })
  return origins as string[]
}

export async function create(doc: Omit<SentroyApp, "id">): Promise<SentroyApp> {
  const c = await col()
  const result = await c.insertOne(doc as Record<string, unknown>)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: Partial<Omit<SentroyApp, "id" | "appId" | "createdAt">>,
): Promise<SentroyApp | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

/** Onaylı app'in rating aggregate'ini güncelle (review write'ında çağrılır). */
export async function setRatingAggregate(id: string, ratingAvg: number, ratingCount: number): Promise<void> {
  const c = await col()
  await c.updateOne({ _id: toObjectId(id) }, { $set: { ratingAvg, ratingCount, updatedAt: new Date() } })
}

export async function adjustInstallCount(id: string, delta: number): Promise<void> {
  const c = await col()
  await c.updateOne({ _id: toObjectId(id) }, { $inc: { installCount: delta }, $set: { updatedAt: new Date() } })
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

/** TÜM registry satırları (herhangi status/enabled) — sync reconcile-by-absence için. */
export async function listAllRegistry(): Promise<SentroyApp[]> {
  const c = await col()
  const docs = await c.find({ source: "registry" }).toArray()
  return docs.map(toId)
}

/** Onaylı registry satırları için geliştirici slug'ı çözümü (dev profil sayfası). */
export async function findByRegistryDeveloperSlug(slug: string): Promise<SentroyApp[]> {
  const c = await col()
  const docs = await c
    .find({
      source: "registry",
      status: "approved",
      visibility: "public",
      enabled: true,
      "registryDeveloper.slug": slug,
    })
    .sort({ ratingAvg: -1, installCount: -1 })
    .toArray()
  return docs.map(toId)
}

/**
 * Registry sync idempotent upsert-by-appId — YEREL sayaçları KORUR.
 *
 * `doc` = buildAppCreateInput(source:"registry") çıktısı + registryDeveloper/
 * registryStats/localState/enabled overlay'i. Sözleşme:
 *  - appId yoksa: create (installCount/ratingAvg/ratingCount = doc'taki 0'lar).
 *  - appId varsa (çağıran source==="registry" olduğunu doğrulamıştır): manifest-
 *    türevi alanları $set eder; versions[] APPEND (version'a göre dedupe);
 *    installCount/ratingAvg/ratingCount/createdAt/appId/localState patch'ten
 *    STRUCTURALLY ÇIKARILIR → yerel sayaçlar ve admin localState'i ASLA ezilmez.
 *
 * semverGt monotonic guard ÇAĞIRANDA (sync.ts, build-record.ts semverGt) yapılır;
 * bu helper yalnız yazması gereken satırlarla çağrılır.
 */
export async function upsertRegistryApp(
  doc: Omit<SentroyApp, "id">,
): Promise<{ created: boolean; app: SentroyApp | null }> {
  const existing = await findByAppId(doc.appId)
  if (!existing) {
    const created = await create(doc)
    return { created: true, app: created }
  }
  // versions merge — mevcut + yeni (version'a göre dedupe), son N ile sınırlı
  // (her entry tam manifestSnapshot gömer → 16MB doc limitine karşı retention).
  const merged: SentroyAppVersion[] = [...(existing.versions ?? [])]
  for (const v of doc.versions) {
    if (!merged.some((e) => e.version === v.version)) merged.push(v)
  }
  const cappedVersions = merged.slice(-MAX_VERSION_HISTORY)
  // Yerel sayaçlar + createdAt + appId + localState patch'ten çıkar (never-clobber).
  const {
    installCount: _ic,
    ratingAvg: _ra,
    ratingCount: _rc,
    createdAt: _ca,
    appId: _ai,
    localState: _ls,
    ...patchable
  } = doc
  const patch: Partial<Omit<SentroyApp, "id" | "appId" | "createdAt">> = {
    ...patchable,
    versions: cappedVersions,
  }
  const app = await update(existing.id, patch)
  return { created: false, app }
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ appId: 1 }, { unique: true })
  await c.createIndex({ slug: 1 }, { unique: true })
  await c.createIndex({ status: 1, visibility: 1 })
  await c.createIndex({ developerCompanyId: 1 })
  await c.createIndex({ ownerUserId: 1 })
  await c.createIndex({ embedOrigin: 1 })
  await c.createIndex({ "appearance.category": 1, ratingAvg: -1 })
  // Faz 5 registry — background (mevcut hosted deploy'da bloklayıcı build değil).
  await c.createIndex({ source: 1 }, { background: true })
  await c.createIndex({ "registryDeveloper.slug": 1 }, { background: true })
}

import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import type { OAuthScope } from "./oauth-client"

const COLLECTION = "app_installs"

/**
 * Sentroy App Store — kurulum. Kurulum kullanıcı + şirket bağlamında olur
 * (aynı kullanıcı farklı şirketlerde ayrı kurabilir). Ücretli app'lerde
 * `polarSubscriptionId`/`polarOrderId` set edilir; webhook reconcile bunu
 * `active`'e çevirir. Review yazma hakkı aktif install'a bağlıdır.
 */

export type AppInstallStatus = "active" | "uninstalled"

export interface AppInstall {
  id: string
  appId: string
  userId: string
  companyId: string
  status: AppInstallStatus
  /** Kullanıcının onayladığı scope'lar (auth.mode≠none ise). */
  consentedScopes: OAuthScope[]
  polarSubscriptionId: string | null
  polarOrderId: string | null
  installedAt: Date
  uninstalledAt: Date | null
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findActive(userId: string, appId: string, companyId: string): Promise<AppInstall | null> {
  const c = await col()
  const doc = await c.findOne({ userId, appId, companyId, status: "active" })
  return doc ? toId(doc) : null
}

export async function findByUserCompany(userId: string, companyId: string): Promise<AppInstall[]> {
  const c = await col()
  const docs = await c.find({ userId, companyId, status: "active" }).sort({ installedAt: -1 }).toArray()
  return docs.map(toId)
}

export async function findByPolarSubscription(polarSubscriptionId: string): Promise<AppInstall | null> {
  const c = await col()
  const doc = await c.findOne({ polarSubscriptionId })
  return doc ? toId(doc) : null
}

export async function countActiveForApp(appId: string): Promise<number> {
  const c = await col()
  return c.countDocuments({ appId, status: "active" })
}

/**
 * Kurulumu aktive et (upsert). (userId,appId,companyId) unique → tekrar
 * kurulum mevcut kaydı reaktive eder. Döner: {install, created}.
 */
export async function activate(input: {
  appId: string
  userId: string
  companyId: string
  consentedScopes?: OAuthScope[]
  polarSubscriptionId?: string | null
  polarOrderId?: string | null
}): Promise<{ install: AppInstall; created: boolean }> {
  const c = await col()
  const now = new Date()
  const existing = await c.findOne({ appId: input.appId, userId: input.userId, companyId: input.companyId })
  const result = await c.findOneAndUpdate(
    { appId: input.appId, userId: input.userId, companyId: input.companyId },
    {
      $set: {
        status: "active",
        consentedScopes: input.consentedScopes ?? [],
        polarSubscriptionId: input.polarSubscriptionId ?? null,
        polarOrderId: input.polarOrderId ?? null,
        uninstalledAt: null,
      },
      $setOnInsert: {
        appId: input.appId,
        userId: input.userId,
        companyId: input.companyId,
        installedAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  )
  return { install: toId(result!), created: !existing }
}

export async function uninstall(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { status: "uninstalled", uninstalledAt: new Date() } },
  )
  return result.modifiedCount === 1
}

/** Bir app tamamen silindiğinde tüm kurulum kayıtlarını sert-sil (appId = DB
 *  app.id). Soft-uninstall değil — app artık yok, kayıt tutmanın anlamı yok. */
export async function removeByApp(appId: string): Promise<number> {
  const c = await col()
  const result = await c.deleteMany({ appId })
  return result.deletedCount ?? 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ userId: 1, appId: 1, companyId: 1 }, { unique: true })
  await c.createIndex({ appId: 1 })
  await c.createIndex({ companyId: 1, status: 1 })
  await c.createIndex({ polarSubscriptionId: 1 }, { sparse: true })
}

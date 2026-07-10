import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import * as landingSettingsModel from "./landing-settings"
import * as landingAppModel from "./landing-app"
import * as landingZSectionModel from "./landing-zsection"
import * as landingLogoModel from "./landing-logo"
import * as landingTestimonialModel from "./landing-testimonial"

const COLLECTION = "landing_presets"

/**
 * Landing'in 5 dinamik collection'ının (settings + apps + zsections + logos
 * + testimonials) bir noktadaki tam snapshot'u. Admin "Save current as
 * preset" der → mevcut state buraya dump'lanır. "Apply preset" der →
 * snapshot 5 collection'a geri yazılır (mevcut veri silinir).
 *
 * MongoDB transaction kullanmıyoruz — single-node deployment'larda mevcut
 * değil; restore sırasında bir collection fail ederse partial state oluşur.
 * Riski azaltmak için Apply'dan ÖNCE otomatik bir "auto-backup-<timestamp>"
 * snapshot alınır (createAutoBackup); kullanıcı manuel restore edebilir.
 */
export interface LandingPreset {
  id: string
  name: string
  description: string | null
  snapshot: {
    settings: Record<string, unknown>
    apps: Record<string, unknown>[]
    zsections: Record<string, unknown>[]
    logos: Record<string, unknown>[]
    testimonials: Record<string, unknown>[]
  }
  /** Auto-backup'lar UI'da default gizlenir, sadece "Show all" toggle ile görünür. */
  isAutoBackup: boolean
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function list(opts: { includeAutoBackups?: boolean } = {}): Promise<LandingPreset[]> {
  const c = await col()
  const filter = opts.includeAutoBackups ? {} : { isAutoBackup: { $ne: true } }
  const docs = await c.find(filter).sort({ createdAt: -1 }).toArray()
  return docs.map(toId) as LandingPreset[]
}

export async function findById(id: string): Promise<LandingPreset | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc) as LandingPreset | null
}

/**
 * Mevcut landing state'inin snapshot'unu alıp yeni preset olarak kaydet.
 * `name` zorunlu, `description` opsiyonel. Auto-backup'lar
 * `isAutoBackup: true` ile flag'lenir.
 */
export async function createFromCurrent(data: {
  name: string
  description?: string | null
  isAutoBackup?: boolean
}): Promise<LandingPreset> {
  const [settings, apps, zsections, logos, testimonials] = await Promise.all([
    landingSettingsModel.get(),
    landingAppModel.list(),
    landingZSectionModel.list(),
    landingLogoModel.list(),
    landingTestimonialModel.list(),
  ])

  const c = await col()
  const now = new Date()
  const doc = {
    name: data.name.trim(),
    description: data.description?.trim() || null,
    snapshot: {
      settings: settings as unknown as Record<string, unknown>,
      apps: apps as unknown as Record<string, unknown>[],
      zsections: zsections as unknown as Record<string, unknown>[],
      logos: logos as unknown as Record<string, unknown>[],
      testimonials: testimonials as unknown as Record<string, unknown>[],
    },
    isAutoBackup: data.isAutoBackup ?? false,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

/**
 * Verilen preset'i 5 collection'a restore et. Önce her hedef collection
 * temizlenir, sonra snapshot'taki dokümanlar yeniden insertlenir. ObjectId
 * regenerate edilir (preset id ≠ collection doc id).
 *
 * Kritik destructive iş — caller önce auto-backup almalı (route layer).
 */
export async function applyById(id: string): Promise<{ applied: true } | { applied: false; reason: string }> {
  const preset = await findById(id)
  if (!preset) return { applied: false, reason: "Preset not found" }

  const db = await getDb()
  const { settings, apps, zsections, logos, testimonials } = preset.snapshot

  // Settings — single doc upsert. Dispose meta keys to avoid id clashes.
  const settingsClean = stripMongoMeta(settings)
  await db.collection("system_settings").updateOne(
    { key: "landing" },
    { $set: { ...settingsClean, key: "landing", updatedAt: new Date() } },
    { upsert: true },
  )

  // Multi-doc collections — wipe + insertMany
  await replaceCollection(db, "landing_apps", apps)
  await replaceCollection(db, "landing_zsections", zsections)
  await replaceCollection(db, "landing_logos", logos)
  await replaceCollection(db, "landing_testimonial", testimonials)

  return { applied: true }
}

async function replaceCollection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  name: string,
  docs: Record<string, unknown>[],
): Promise<void> {
  const c = db.collection(name)
  await c.deleteMany({})
  if (docs.length === 0) return
  // ObjectId çakışmasını önlemek için id/createdAt/_id alanlarını temizle —
  // MongoDB her insert'te yeni _id üretir.
  const cleaned = docs.map(stripMongoMeta)
  await c.insertMany(cleaned)
}

function stripMongoMeta(doc: Record<string, unknown>): Record<string, unknown> {
  const { id: _id1, _id: _id2, ...rest } = doc as Record<string, unknown> & { id?: unknown; _id?: unknown }
  void _id1
  void _id2
  return rest
}

/**
 * Eski auto-backup'ları temizle — N adetten fazla varsa en eskileri sil.
 * Apply route'undan otomatik çağrılır.
 */
export async function pruneAutoBackups(keep = 5): Promise<number> {
  const c = await col()
  const old = await c
    .find({ isAutoBackup: true })
    .sort({ createdAt: -1 })
    .skip(keep)
    .toArray()
  if (old.length === 0) return 0
  const ids = old.map((d) => d._id)
  const result = await c.deleteMany({ _id: { $in: ids } })
  return result.deletedCount ?? 0
}

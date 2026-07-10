import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "threejs_scenes"

/**
 * Admin "Experimental → ThreeJS Videos" sayfasının kaydettiği sahne config'i.
 *
 * Yeni yapı: preset-temelli. Kullanıcı registry'den bir preset seçer,
 * yalnızca curated bir param listesini (renk, hız, vb.) tweak eder.
 * `presetId` + `params` saklanır; sahne client-side rebuild edilir.
 *
 * Eski "objects" alanı legacy — okuma için tutulur, editör görünce
 * preset seçim ekranı açar (migration yok, feature experimental).
 */

export interface ThreejsOverlay {
  id: string
  type: "logo" | "text"
  /** logo için image URL, text için string content */
  content: string
  /** Yüzde olarak konum (0-100), canvas'ın boyutuna göre. */
  x: number
  y: number
  /** Px boyutu (logo için height, text için font-size) */
  size: number
  color?: string
  opacity?: number
  // Text overlay tipografi alanları — preset olmayan, kullanıcının
  // serbestçe tweak edebildiği yerler.
  fontFamily?: string
  fontWeight?: string
  fontStyle?: "normal" | "italic"
  letterSpacing?: number
  textAlign?: "left" | "center" | "right"
  uppercase?: boolean
  textShadow?: boolean
}

export interface ThreejsRecordSettings {
  width: number
  height: number
  fps: number
  durationSeconds: number
  background?: string
}

export interface ThreejsSceneConfig {
  /** Preset registry id — örn "wireframe-head". Yoksa legacy/blank. */
  presetId?: string
  /** Preset param değerleri — schema preset.params üzerinden çözülür. */
  params?: Record<string, string | number | boolean>
  overlays: ThreejsOverlay[]
  record: ThreejsRecordSettings
  /** Legacy alanlar — eski kayıtlar için okuma için tutulur. */
  objects?: unknown[]
  camera?: {
    position: [number, number, number]
    lookAt: [number, number, number]
  }
}

export interface ThreejsScene {
  id: string
  name: string
  description?: string | null
  config: ThreejsSceneConfig
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function list(limit = 100): Promise<ThreejsScene[]> {
  const c = await col()
  const docs = await c.find({}).sort({ updatedAt: -1 }).limit(limit).toArray()
  return docs.map(toId) as ThreejsScene[]
}

export async function findById(id: string): Promise<ThreejsScene | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc) as ThreejsScene | null
}

export async function insert(data: {
  name: string
  description?: string | null
  config: ThreejsSceneConfig
  createdBy: string
}): Promise<ThreejsScene> {
  const c = await col()
  const now = new Date()
  const doc = {
    name: data.name,
    description: data.description ?? null,
    config: data.config,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: { name?: string; description?: string | null; config?: ThreejsSceneConfig },
): Promise<ThreejsScene | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(updated) as ThreejsScene | null
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

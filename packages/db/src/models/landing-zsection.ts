import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "landing_zsections"

export type LocalizedString = Record<string, string>

export interface LandingZSection {
  id: string
  title: LocalizedString
  problem: LocalizedString
  solution: LocalizedString
  result: LocalizedString
  /** Visual gorseli: "default:0" | "default:1" | "default:2" gibi dahili varyant veya "url:https://..." gibi harici */
  visual?: string | null
  order: number
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function list(): Promise<LandingZSection[]> {
  const c = await col()
  const docs = await c.find({}).sort({ order: 1, createdAt: 1 }).toArray()
  return docs.map(toId) as LandingZSection[]
}

export async function create(data: {
  title: LocalizedString
  problem: LocalizedString
  solution: LocalizedString
  result: LocalizedString
  visual?: string | null
  order?: number
}): Promise<LandingZSection> {
  const c = await col()
  const now = new Date()
  const doc = {
    title: data.title,
    problem: data.problem,
    solution: data.solution,
    result: data.result,
    visual: data.visual ?? null,
    order: data.order ?? 0,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateById(
  id: string,
  data: Partial<Omit<LandingZSection, "id" | "createdAt" | "updatedAt">>,
): Promise<LandingZSection | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(updated) as LandingZSection | null
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

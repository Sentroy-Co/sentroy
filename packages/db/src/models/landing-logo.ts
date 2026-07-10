import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "landing_logos"

export interface LandingLogo {
  id: string
  name: string
  imageUrl: string
  url?: string | null
  order: number
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function list(): Promise<LandingLogo[]> {
  const c = await col()
  const docs = await c.find({}).sort({ order: 1, createdAt: 1 }).toArray()
  return docs.map(toId) as LandingLogo[]
}

export async function create(data: {
  name: string
  imageUrl: string
  url?: string | null
  order?: number
}): Promise<LandingLogo> {
  const c = await col()
  const now = new Date()
  const doc = {
    name: data.name,
    imageUrl: data.imageUrl,
    url: data.url ?? null,
    order: data.order ?? 0,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateById(
  id: string,
  data: Partial<Omit<LandingLogo, "id" | "createdAt" | "updatedAt">>,
): Promise<LandingLogo | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(updated) as LandingLogo | null
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

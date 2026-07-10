import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "landing_testimonials"

export type LocalizedString = Record<string, string>

export interface LandingTestimonial {
  id: string
  quote: LocalizedString
  name: string
  title: LocalizedString
  photoUrl?: string | null
  rating?: number | null
  order: number
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function list(): Promise<LandingTestimonial[]> {
  const c = await col()
  const docs = await c.find({}).sort({ order: 1, createdAt: 1 }).toArray()
  return docs.map(toId) as LandingTestimonial[]
}

export async function create(data: {
  quote: LocalizedString
  name: string
  title: LocalizedString
  photoUrl?: string | null
  rating?: number | null
  order?: number
}): Promise<LandingTestimonial> {
  const c = await col()
  const now = new Date()
  const doc = {
    quote: data.quote,
    name: data.name,
    title: data.title,
    photoUrl: data.photoUrl ?? null,
    rating: data.rating ?? null,
    order: data.order ?? 0,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateById(
  id: string,
  data: Partial<Omit<LandingTestimonial, "id" | "createdAt" | "updatedAt">>,
): Promise<LandingTestimonial | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(updated) as LandingTestimonial | null
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

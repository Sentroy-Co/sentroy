import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "newsletter_subscribers"

export interface NewsletterSubscriber {
  id: string
  email: string
  locale?: string | null
  source?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  unsubscribedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function subscribe(data: {
  email: string
  locale?: string | null
  source?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<{ created: boolean; subscriber: NewsletterSubscriber }> {
  const c = await col()
  const email = data.email.trim().toLowerCase()
  const now = new Date()

  const existing = await c.findOne({ email })
  if (existing) {
    if (existing.unsubscribedAt) {
      const updated = await c.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            unsubscribedAt: null,
            locale: data.locale ?? existing.locale ?? null,
            source: data.source ?? existing.source ?? null,
            updatedAt: now,
          },
        },
        { returnDocument: "after" },
      )
      return {
        created: true,
        subscriber: toId(updated) as NewsletterSubscriber,
      }
    }
    return {
      created: false,
      subscriber: toId(existing) as NewsletterSubscriber,
    }
  }

  const doc = {
    email,
    locale: data.locale ?? null,
    source: data.source ?? null,
    ipAddress: data.ipAddress ?? null,
    userAgent: data.userAgent ?? null,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return {
    created: true,
    subscriber: { id: result.insertedId.toString(), ...doc },
  }
}

export async function unsubscribeById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.updateOne(
    { _id: toObjectId(id) },
    { $set: { unsubscribedAt: new Date(), updatedAt: new Date() } },
  )
  return result.modifiedCount === 1
}

export async function list(): Promise<NewsletterSubscriber[]> {
  const c = await col()
  const docs = await c.find({}).sort({ createdAt: -1 }).toArray()
  return docs.map(toId) as NewsletterSubscriber[]
}

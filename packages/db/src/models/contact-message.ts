import { ObjectId } from "mongodb"
import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Platform-seviyesi iletişim gelen-kutusu (Sentroy'un kendi iletişim formu).
 * Şirket-kapsamlı DEĞİL — sistem admin'i (/[lang]/admin) yönetir. Gönderenin
 * IP/cihaz meta'sı (ipAddress/userAgent/ipInfo) admin önizlemesi için saklanır.
 * newsletter-subscriber (platform-level) + status-incident (embedded replies[])
 * desenlerini aynalar.
 */

const COLLECTION = "contact_messages"

export type ContactMessageStatus = "new" | "open" | "replied" | "closed"

export interface ContactMessageIpInfo {
  as_name?: string | null
  as_domain?: string | null
  asn?: string | null
  country?: string | null
  country_code?: string | null
  continent?: string | null
  [key: string]: unknown
}

export interface ContactMessageReply {
  id: string
  authorUserId: string
  authorName: string
  body: string
  createdAt: Date
}

export interface ContactMessage {
  id: string
  name: string
  email: string | null
  category: string
  subject: string | null
  message: string
  /** Gönderenin dili — yanıt e-postası aynı dilde gitsin. */
  locale: string
  status: ContactMessageStatus
  assignedToUserId: string | null
  ipAddress: string | null
  userAgent: string | null
  ipInfo: ContactMessageIpInfo | null
  replies: ContactMessageReply[]
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function subId(): string {
  return new ObjectId().toString()
}

export async function create(data: {
  name: string
  email?: string | null
  category: string
  subject?: string | null
  message: string
  locale?: string
  ipAddress?: string | null
  userAgent?: string | null
  ipInfo?: unknown
}): Promise<ContactMessage> {
  const c = await col()
  const now = new Date()
  const doc = {
    name: data.name,
    email: data.email ?? null,
    category: data.category,
    subject: data.subject ?? null,
    message: data.message,
    locale: data.locale ?? "en",
    status: "new" as ContactMessageStatus,
    assignedToUserId: null as string | null,
    ipAddress: data.ipAddress ?? null,
    userAgent: data.userAgent ?? null,
    ipInfo: (data.ipInfo ?? null) as ContactMessageIpInfo | null,
    replies: [] as ContactMessageReply[],
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function findById(id: string): Promise<ContactMessage | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const doc = await c.findOne({ _id: new ObjectId(id) })
  return toId(doc) as ContactMessage | null
}

export async function list(opts?: {
  status?: ContactMessageStatus
  category?: string
  assignedToUserId?: string
  search?: string
  limit?: number
  skip?: number
}): Promise<ContactMessage[]> {
  const c = await col()
  const q: Record<string, unknown> = {}
  if (opts?.status) q.status = opts.status
  if (opts?.category) q.category = opts.category
  if (opts?.assignedToUserId) q.assignedToUserId = opts.assignedToUserId
  if (opts?.search) {
    const rx = new RegExp(opts.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    q.$or = [{ name: rx }, { email: rx }, { subject: rx }, { message: rx }]
  }
  const docs = await c
    .find(q)
    .sort({ createdAt: -1 })
    .skip(opts?.skip ?? 0)
    .limit(opts?.limit ?? 50)
    .toArray()
  return docs.map((d) => toId(d) as ContactMessage)
}

export async function count(opts?: { status?: ContactMessageStatus; category?: string; search?: string }): Promise<number> {
  const c = await col()
  const q: Record<string, unknown> = {}
  if (opts?.status) q.status = opts.status
  if (opts?.category) q.category = opts.category
  if (opts?.search) {
    const rx = new RegExp(opts.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    q.$or = [{ name: rx }, { email: rx }, { subject: rx }, { message: rx }]
  }
  return c.countDocuments(q)
}

/** Durum sayaçları (admin sekmesi rozetleri için). */
export async function statusCounts(): Promise<Record<string, number>> {
  const c = await col()
  const rows = await c
    .aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }])
    .toArray()
  const out: Record<string, number> = {}
  for (const r of rows) out[r._id] = r.n
  return out
}

export async function updateStatus(id: string, status: ContactMessageStatus): Promise<ContactMessage | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const res = await c.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(res) as ContactMessage | null
}

export async function assign(id: string, userId: string | null): Promise<ContactMessage | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const res = await c.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { assignedToUserId: userId, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(res) as ContactMessage | null
}

/** Admin yanıtı ekle → status "replied" + updatedAt. */
export async function appendReply(
  id: string,
  reply: { authorUserId: string; authorName: string; body: string },
): Promise<ContactMessage | null> {
  if (!ObjectId.isValid(id)) return null
  const c = await col()
  const newReply: ContactMessageReply = {
    id: subId(),
    authorUserId: reply.authorUserId,
    authorName: reply.authorName,
    body: reply.body,
    createdAt: new Date(),
  }
  const res = await c.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $push: { replies: newReply } as never, $set: { status: "replied" as ContactMessageStatus, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(res) as ContactMessage | null
}

export async function remove(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const c = await col()
  const res = await c.deleteOne({ _id: new ObjectId(id) })
  return res.deletedCount > 0
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ createdAt: -1 })
  await c.createIndex({ status: 1, createdAt: -1 })
  await c.createIndex({ assignedToUserId: 1 })
}

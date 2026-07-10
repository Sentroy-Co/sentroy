import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * WhatsApp Santral — API/template ile yapılan gönderim logu. Her alıcı için bir
 * satır. Mail'de loglar mail-server'dan stream edilir; WhatsApp'ta kendi
 * kaydımızı tutarız. OS "Send logs" sayfası + aylık plan limiti (ay-başı sayım)
 * bunu okur. Bkz. [[whatsapp-template]].
 */

const COLLECTION = "whatsapp_send_logs"

export type WhatsappSendStatus = "queued" | "sent" | "failed"

export interface WhatsappSendLog {
  id: string
  companyId: string
  sessionId: string
  to: string
  templateId: string | null
  audienceId: string | null
  status: WhatsappSendStatus
  waMessageId: string | null
  error: string | null
  /** Gönderimi başlatan (token erişiminde token sahibi, session'da user id). */
  createdBy: string | null
  createdAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function create(data: {
  companyId: string
  sessionId: string
  to: string
  templateId?: string | null
  audienceId?: string | null
  status: WhatsappSendStatus
  waMessageId?: string | null
  error?: string | null
  createdBy?: string | null
}): Promise<WhatsappSendLog> {
  const c = await col()
  const doc = {
    companyId: data.companyId,
    sessionId: data.sessionId,
    to: data.to,
    templateId: data.templateId ?? null,
    audienceId: data.audienceId ?? null,
    status: data.status,
    waMessageId: data.waMessageId ?? null,
    error: data.error ?? null,
    createdBy: data.createdBy ?? null,
    createdAt: new Date(),
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function list(
  companyId: string,
  opts: {
    page?: number
    limit?: number
    status?: WhatsappSendStatus
    sessionId?: string
    templateId?: string
  } = {},
): Promise<{
  data: WhatsappSendLog[]
  page: number
  limit: number
  total: number
}> {
  const c = await col()
  const page = Math.max(1, opts.page ?? 1)
  const limit = Math.min(opts.limit ?? 50, 200)
  const filter: Record<string, unknown> = { companyId }
  if (opts.status) filter.status = opts.status
  if (opts.sessionId) filter.sessionId = opts.sessionId
  if (opts.templateId) filter.templateId = opts.templateId
  const total = await c.countDocuments(filter)
  const docs = await c
    .find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray()
  return { data: docs.map(toId) as WhatsappSendLog[], page, limit, total }
}

/**
 * `since`'ten bu yana başarılı/kuyruğa alınmış (failed hariç) gönderim sayısı —
 * aylık plan limiti enforcement'ı için (ayrı sayaç + reset cron'a gerek yok).
 */
export async function countSince(
  companyId: string,
  since: Date,
): Promise<number> {
  const c = await col()
  return c.countDocuments({
    companyId,
    createdAt: { $gte: since },
    status: { $ne: "failed" },
  })
}

export async function deleteByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1, createdAt: -1 })
  await c.createIndex({ companyId: 1, status: 1, createdAt: -1 })
}

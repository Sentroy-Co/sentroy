import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"
import { randomBytes } from "node:crypto"
import type { CompanyMemberRole, Permission } from "../types"

const COLLECTION = "company_invitations"

/**
 * Mevcut/yeni kullanıcılara company'ye katılım davetiyesi. URL token'ı
 * sallanır → kullanıcı linke tıklar → email zaten o davetin email'i ile
 * eşleşiyorsa direkt accept; yoksa signup/login akışına yönlendirilir.
 *
 * Status:
 *   - pending  → davetiye yola çıktı, henüz cevaplanmadı, expiresAt geçmedi
 *   - accepted → kullanıcı katıldı, member oluşturuldu (silmeyiz, audit)
 *   - revoked  → owner/admin iptal etti
 *   - expired  → expiresAt geçmiş, kullanıcı tıkladığında otomatik state'e geçer
 *
 * Token: 32 byte raw → 64-char hex; URL'de paylaşılır, hashlenmez (link
 * fail-secure değil, expiry + one-time use için yeterli).
 */
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired"

export interface CompanyInvitation {
  id: string
  companyId: string
  /** Davet edilen email — küçük harf normalize edilir. */
  email: string
  role: CompanyMemberRole
  permissions: Permission[]
  /** URL'de gönderilen unique token (lookup için indexed). */
  token: string
  status: InvitationStatus
  /** Daveti gönderen user (owner veya admin). */
  invitedBy: string
  /** Kabul edildiği andaki user id — meta. */
  acceptedBy?: string | null
  acceptedAt?: Date | null
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const DEFAULT_TTL_DAYS = 7

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

function generateToken(): string {
  return randomBytes(32).toString("hex")
}

export async function listByCompany(
  companyId: string,
  opts: { onlyPending?: boolean } = {},
): Promise<CompanyInvitation[]> {
  const c = await col()
  const filter: Record<string, unknown> = { companyId }
  if (opts.onlyPending) filter.status = "pending"
  const docs = await c.find(filter).sort({ createdAt: -1 }).toArray()
  return docs.map(toId) as CompanyInvitation[]
}

export async function findByToken(token: string): Promise<CompanyInvitation | null> {
  const c = await col()
  const doc = await c.findOne({ token })
  return toId(doc) as CompanyInvitation | null
}

export async function findById(id: string): Promise<CompanyInvitation | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc) as CompanyInvitation | null
}

/** Aynı email + company için pending davet zaten varsa tekrar oluşturmaz —
 *  caller önce findPendingByEmail ile kontrol etmeli. */
export async function findPendingByEmail(
  companyId: string,
  email: string,
): Promise<CompanyInvitation | null> {
  const c = await col()
  const doc = await c.findOne({
    companyId,
    email: email.toLowerCase(),
    status: "pending",
  })
  return toId(doc) as CompanyInvitation | null
}

/** Bir email'in TÜM şirketlerdeki bekleyen (süresi dolmamış) davetleri —
 *  kayıt sonrası OS first-run ekranında kullanıcıya gösterilir. */
export async function findAllPendingByEmail(
  email: string,
): Promise<CompanyInvitation[]> {
  const c = await col()
  const docs = await c
    .find({
      email: email.toLowerCase().trim(),
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toId) as CompanyInvitation[]
}

export async function create(data: {
  companyId: string
  email: string
  role: CompanyMemberRole
  permissions: Permission[]
  invitedBy: string
  ttlDays?: number
}): Promise<CompanyInvitation> {
  const c = await col()
  const now = new Date()
  const ttl = data.ttlDays ?? DEFAULT_TTL_DAYS
  const doc = {
    companyId: data.companyId,
    email: data.email.toLowerCase().trim(),
    role: data.role,
    permissions: data.permissions,
    token: generateToken(),
    status: "pending" as InvitationStatus,
    invitedBy: data.invitedBy,
    acceptedBy: null,
    acceptedAt: null,
    expiresAt: new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function markAccepted(
  id: string,
  acceptedBy: string,
): Promise<CompanyInvitation | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id), status: "pending" },
    {
      $set: {
        status: "accepted",
        acceptedBy,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  )
  return toId(updated) as CompanyInvitation | null
}

export async function revoke(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.updateOne(
    { _id: toObjectId(id), status: "pending" },
    { $set: { status: "revoked", updatedAt: new Date() } },
  )
  return result.modifiedCount === 1
}

export async function markExpired(id: string): Promise<void> {
  const c = await col()
  await c.updateOne(
    { _id: toObjectId(id), status: "pending" },
    { $set: { status: "expired", updatedAt: new Date() } },
  )
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

import { ObjectId } from "mongodb"

import { getDb } from "../client"

/**
 * better-auth `user` koleksiyonu üzerinde READ-ONLY yardımcılar.
 * Koleksiyonun sahibi better-auth'tur — burası yalnız "bu e-posta bir Sentroy
 * kullanıcısı mı" (meet daveti/hatırlatması push hedefleme) ve toplu profil
 * zenginleştirme (isim/avatar) sorularını yanıtlar.
 */
const COLLECTION = "user"

export interface AuthUserLite {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

/** E-posta → userId eşlemesi (yalnız kayıtlı kullanıcılar döner). */
export async function findIdsByEmails(emails: string[]): Promise<Map<string, string>> {
  const distinct = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (distinct.length === 0) return new Map()
  const db = await getDb()
  const docs = await db
    .collection(COLLECTION)
    .find({ email: { $in: distinct } }, { projection: { email: 1 } })
    .toArray()
  const map = new Map<string, string>()
  for (const d of docs) {
    if (typeof d.email === "string") map.set(d.email.toLowerCase(), d._id.toString())
  }
  return map
}

/** userId listesi → hafif profil (isim/e-posta/avatar). */
export async function findByIds(userIds: string[]): Promise<Map<string, AuthUserLite>> {
  const valid = [...new Set(userIds)].filter((id) => ObjectId.isValid(id))
  if (valid.length === 0) return new Map()
  const db = await getDb()
  const docs = await db
    .collection(COLLECTION)
    .find(
      { _id: { $in: valid.map((id) => new ObjectId(id)) } },
      { projection: { name: 1, email: 1, image: 1 } },
    )
    .toArray()
  const map = new Map<string, AuthUserLite>()
  for (const d of docs) {
    map.set(d._id.toString(), {
      id: d._id.toString(),
      name: (d.name as string) ?? null,
      email: (d.email as string) ?? null,
      image: (d.image as string) ?? null,
    })
  }
  return map
}

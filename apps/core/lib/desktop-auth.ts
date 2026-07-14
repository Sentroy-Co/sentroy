import { randomBytes } from "node:crypto"
import { getDb } from "@workspace/db/client"

/**
 * Desktop app auth handoff — one-time codes.
 *
 * The browser (where the user already has their Google session + saved
 * passwords) authenticates normally, mints a short-lived single-use code, and
 * deep-links it to the desktop app (`sentroy://auth?code=…`). The app then
 * hits /api/desktop-auth/verify?code=… from its own session, which exchanges
 * the code for a real better-auth session cookie set in the app's partition.
 *
 * Security: codes are 32-byte random, single-use (atomic consume), and expire
 * in 60s (Mongo TTL index). This is the desktop equivalent of an OAuth
 * authorization code.
 */

const COLLECTION = "desktop_auth_codes"
const TTL_SECONDS = 60

interface DesktopAuthCode {
  code: string
  userId: string
  createdAt: Date
  expiresAt: Date
  usedAt: Date | null
}

let indexEnsured = false
async function ensureIndexes() {
  if (indexEnsured) return
  const db = await getDb()
  const col = db.collection<DesktopAuthCode>(COLLECTION)
  await Promise.all([
    col.createIndex({ code: 1 }, { unique: true }),
    // TTL sweep — codes self-delete shortly after expiry.
    col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
  indexEnsured = true
}

/** Mint a single-use handoff code for an authenticated user. */
export async function createDesktopAuthCode(userId: string): Promise<string> {
  await ensureIndexes()
  const db = await getDb()
  const code = randomBytes(32).toString("hex")
  const now = new Date()
  await db.collection<DesktopAuthCode>(COLLECTION).insertOne({
    code,
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TTL_SECONDS * 1000),
    usedAt: null,
  })
  return code
}

/**
 * Atomically consume a code → returns its userId, or null if invalid / expired
 * / already used. The atomic `usedAt` guard prevents replay.
 */
export async function consumeDesktopAuthCode(
  code: string,
): Promise<string | null> {
  if (!code || typeof code !== "string" || code.length < 16) return null
  const db = await getDb()
  const res = await db
    .collection<DesktopAuthCode>(COLLECTION)
    .findOneAndUpdate(
      { code, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    )
  return res?.userId ?? null
}

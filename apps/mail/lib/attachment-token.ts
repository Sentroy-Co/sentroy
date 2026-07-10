import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"

/**
 * Short, signed URLs for inbox attachments. The dashboard hands the
 * signed token to a public `/a/<token>` route which streams the
 * attachment after a constant-time HMAC check + expiry verification —
 * no session cookie needed, so the URL stays usable in `<img src>`,
 * `<a href>`, or a copy-pasted link the user shares with a teammate.
 *
 * Token shape: `<base64url(payload)>.<base64url(hmac)>`. Payload is a
 * tiny JSON blob with mailbox / uid / partId / expiry.
 */

const SECRET_ENV = "ATTACHMENT_TOKEN_SECRET"
const FALLBACK_SECRET_ENV = "INTERNAL_API_SECRET"
const DEFAULT_TTL_SEC = 60 * 60 // 1 hour
const MAX_TTL_SEC = 60 * 60 * 24 // 24 hours hard cap

async function getSecret(): Promise<string> {
  // Prefer a dedicated secret so rotating the inter-service shared
  // secret doesn't invalidate every link the user has open. Fall back
  // to INTERNAL_API_SECRET for environments that haven't provisioned a
  // dedicated key yet. Both first try vault, then process.env via
  // getEnvWithFallback.
  const dedicated = await getEnvWithFallback(SECRET_ENV)
  if (dedicated && dedicated.length >= 16) return dedicated
  // INTERNAL_API_SECRET is bootstrap (used for s2s before vault); read
  // straight from process.env to avoid a self-referential vault fetch
  // during early request paths.
  const fallback = process.env[FALLBACK_SECRET_ENV]
  if (fallback && fallback.length >= 16) return fallback
  throw new Error(
    `Attachment token secret missing — set ${SECRET_ENV} or ${FALLBACK_SECRET_ENV}`,
  )
}

export interface AttachmentTokenPayload {
  /** Company slug — keeps the token scoped, blocks cross-tenant reuse. */
  s: string
  /** Mailbox the message lives in (lower-cased). Null when the call
   *  doesn't have one (rare: virtual mailbox). */
  m: string | null
  /** Optional IMAP folder hint (matches the search-and-fetch contract). */
  f?: string
  /** Message UID. */
  u: string
  /** Attachment partId. */
  p: string
  /** Unix-seconds expiry. */
  e: number
}

function base64urlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url")
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8")
}

async function hmac(body: string): Promise<string> {
  return base64urlEncode(
    createHmac("sha256", await getSecret()).update(body).digest(),
  )
}

export async function signAttachmentToken(
  payload: Omit<AttachmentTokenPayload, "e"> & { ttlSec?: number },
): Promise<string> {
  const ttl = Math.min(
    Math.max(60, payload.ttlSec ?? DEFAULT_TTL_SEC),
    MAX_TTL_SEC,
  )
  const full: AttachmentTokenPayload = {
    s: payload.s,
    m: payload.m,
    u: payload.u,
    p: payload.p,
    ...(payload.f ? { f: payload.f } : {}),
    e: Math.floor(Date.now() / 1000) + ttl,
  }
  const body = base64urlEncode(JSON.stringify(full))
  const sig = await hmac(body)
  return `${body}.${sig}`
}

export async function verifyAttachmentToken(
  token: string,
): Promise<AttachmentTokenPayload | null> {
  if (typeof token !== "string" || token.length === 0) return null
  const dot = token.indexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: string
  try {
    expected = await hmac(body)
  } catch {
    // Secret missing — treat all tokens as invalid rather than 500ing.
    return null
  }
  // Constant-time compare; bail on length mismatch first because
  // timingSafeEqual throws.
  if (sig.length !== expected.length) return null
  if (
    !timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"))
  ) {
    return null
  }
  let payload: AttachmentTokenPayload
  try {
    payload = JSON.parse(base64urlDecode(body)) as AttachmentTokenPayload
  } catch {
    return null
  }
  if (
    typeof payload.s !== "string" ||
    typeof payload.u !== "string" ||
    typeof payload.p !== "string" ||
    typeof payload.e !== "number"
  ) {
    return null
  }
  if (payload.e < Math.floor(Date.now() / 1000)) return null
  return payload
}

/** Build the public dashboard URL the UI should hand to the browser. */
export function buildAttachmentUrl(token: string): string {
  return `/a/${token}`
}

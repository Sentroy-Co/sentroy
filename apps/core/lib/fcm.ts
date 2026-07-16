// FCM (Android) push — HTTP v1 API, service-account OAuth2, ZERO third-party
// deps (node:crypto + fetch). apns.ts ile aynı disiplin. Service account JSON'u
// `FCM_SERVICE_ACCOUNT` env'inde (tam JSON string) tutulur — repoya girmez.

import crypto from "node:crypto"

interface ServiceAccount {
  client_email: string
  private_key: string
  project_id: string
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null
    // Env genelde \n'i literal backslash-n taşır — PEM'e normalize et.
    return {
      client_email: sa.client_email,
      private_key: sa.private_key.replace(/\\n/g, "\n"),
      project_id: sa.project_id,
    }
  } catch {
    return null
  }
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

let _token: { access: string; exp: number } | null = null

/** Service-account'tan OAuth2 access token (firebase.messaging scope) — RS256
 *  imzalı JWT → oauth2.googleapis.com/token. ~55 dk cache. */
async function accessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  if (_token && _token.exp - now > 120) return _token.access

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )
  const signingInput = `${header}.${claims}`
  let assertion: string
  try {
    const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput), sa.private_key)
    assertion = `${signingInput}.${b64url(sig)}`
  } catch (err) {
    console.warn("[fcm] JWT sign failed:", (err as Error).message)
    return null
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn(`[fcm] token exchange HTTP ${res.status}`)
      return null
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!json.access_token) return null
    _token = { access: json.access_token, exp: now + (json.expires_in ?? 3600) }
    return _token.access
  } catch (err) {
    console.warn("[fcm] token exchange failed:", (err as Error).message)
    return null
  }
}

export interface FcmPayload {
  title: string
  body: string
  /** Tapped-notification deep link (absolute) — data.url olarak gider. */
  url: string
  /** Coalescing tag (aynı mailbox → tek yığın). */
  tag?: string
}

export interface FcmResult {
  ok: boolean
  status: number
  /** FCM error status (ör. UNREGISTERED, INVALID_ARGUMENT) — 200 dışı. */
  reason?: string
}

/** True: FCM token kalıcı ölü → çağıran kaydı silmeli. */
export function fcmTokenDead(r: FcmResult): boolean {
  return r.status === 404 || r.reason === "UNREGISTERED" || r.reason === "INVALID_ARGUMENT"
}

/** Tek FCM push gönder (HTTP v1). Bildirim gövdesi + data.url. Asla throw etmez. */
export async function sendFcm(registrationToken: string, payload: FcmPayload): Promise<FcmResult> {
  const sa = serviceAccount()
  if (!sa) return { ok: false, status: 0, reason: "unconfigured" }
  const token = await accessToken(sa)
  if (!token) return { ok: false, status: 0, reason: "no-access-token" }

  const message = {
    message: {
      token: registrationToken,
      // notification bloğu → uygulama kapalıyken sistem tepsisinde otomatik gösterilir.
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url },
      android: {
        priority: "high" as const,
        notification: {
          ...(payload.tag ? { tag: payload.tag } : {}),
          // Tıklamayı Flutter tarafına taşı (onMessageOpenedApp).
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
    },
  }

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (res.ok) return { ok: true, status: res.status }
    let reason: string | undefined
    try {
      const err = (await res.json()) as { error?: { status?: string } }
      reason = err.error?.status
    } catch {/* body parse best-effort */}
    return { ok: false, status: res.status, reason }
  } catch (err) {
    return { ok: false, status: 0, reason: (err as Error).message }
  }
}

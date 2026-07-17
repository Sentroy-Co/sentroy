// APNs (Apple Push Notification service) sender — direct HTTP/2, token-based
// (.p8) auth, ZERO third-party deps (node:crypto + node:http2). Deliberately
// NOT via Firebase/FCM: Sentroy self-hosts push and does not route confidential
// mail metadata through Google. Apple APNs is the mandatory iOS transport and
// receives the payload only transiently over TLS for delivery.
//
// Operator provisioning (env on the core app):
//   APNS_KEY_P8     — the .p8 private key contents (PEM body; \n or real
//                     newlines both accepted; with or without BEGIN/END lines)
//   APNS_KEY_ID     — Key ID of the APNs Auth Key
//   APNS_TEAM_ID    — Apple Developer Team ID
//   APNS_BUNDLE_ID  — app bundle id (apns-topic), e.g. com.sentroy.mail
//   APNS_ENV        — "production" → api.push.apple.com, else sandbox
import crypto from "node:crypto"
import http2 from "node:http2"

export function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_KEY_P8 &&
      process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_BUNDLE_ID,
  )
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

let _cached: { jwt: string; iat: number } | null = null

/** ES256-signed APNs provider JWT (cached ~50 min; APNs rejects tokens >1h). */
function providerToken(): string | null {
  const rawKey = process.env.APNS_KEY_P8
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  if (!rawKey || !keyId || !teamId) return null

  const now = Math.floor(Date.now() / 1000)
  if (_cached && now - _cached.iat < 3000) return _cached.jwt

  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }))
  const payload = b64url(JSON.stringify({ iss: teamId, iat: now }))
  const signingInput = `${header}.${payload}`

  // Normalize the .p8 into a PEM block. Env vars often carry \n as literal
  // backslash-n; also tolerate a bare base64 body with no header lines.
  let pem = rawKey.replace(/\\n/g, "\n").trim()
  if (!pem.includes("BEGIN")) {
    pem = `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`
  }

  try {
    // JWS ES256 requires the raw R||S signature (JOSE), not DER.
    const signature = crypto.sign("sha256", Buffer.from(signingInput), {
      key: pem,
      dsaEncoding: "ieee-p1363",
    })
    const jwt = `${signingInput}.${b64url(signature)}`
    _cached = { jwt, iat: now }
    return jwt
  } catch (err) {
    console.warn("[apns] provider token sign failed:", (err as Error).message)
    return null
  }
}

export interface ApnsPayload {
  title: string
  body: string
  /** Tapped-notification deep link (absolute). */
  url: string
  /** Coalescing group (same mailbox → one stack). */
  tag?: string
}

export interface ApnsResult {
  ok: boolean
  status: number
  /** APNs `reason` (e.g. BadDeviceToken, Unregistered) when status != 200. */
  reason?: string
}

/** True when APNs says the token is permanently dead → caller should purge it. */
export function apnsTokenDead(r: ApnsResult): boolean {
  return (
    r.status === 410 ||
    r.reason === "BadDeviceToken" ||
    r.reason === "Unregistered" ||
    r.reason === "DeviceTokenNotForTopic"
  )
}

/** Send one alert push. Opens a short-lived HTTP/2 connection (low volume; a
 *  pooled multiplexed client is a later optimization). Never throws. */
export async function sendApns(
  deviceToken: string,
  payload: ApnsPayload,
  topic?: string | null,
): Promise<ApnsResult> {
  const jwt = providerToken()
  // apns-topic = hedef app'in bundle id'si. Token-başına saklanan bundleId
  // önceliklidir (çok-app: mail ≠ meet); yoksa APNS_BUNDLE_ID env fallback.
  const bundleId = topic || process.env.APNS_BUNDLE_ID
  if (!jwt || !bundleId) return { ok: false, status: 0, reason: "unconfigured" }

  const host =
    process.env.APNS_ENV === "production"
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com"

  const bodyJson = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      "thread-id": payload.tag,
    },
    url: payload.url,
    mailbox: payload.tag,
  })

  return new Promise<ApnsResult>((resolve) => {
    let settled = false
    const done = (r: ApnsResult) => {
      if (settled) return
      settled = true
      resolve(r)
    }

    let client: http2.ClientHttp2Session
    try {
      client = http2.connect(host)
    } catch {
      return done({ ok: false, status: 0, reason: "connect" })
    }
    client.on("error", () => done({ ok: false, status: 0, reason: "connect" }))
    // Safety timeout — never hang the fire-and-forget dispatch.
    const timer = setTimeout(() => {
      try {
        client.destroy()
      } catch {
        /* noop */
      }
      done({ ok: false, status: 0, reason: "timeout" })
    }, 8000)

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
    })

    let status = 0
    let data = ""
    req.setEncoding("utf8")
    req.on("response", (h) => {
      status = Number(h[":status"]) || 0
    })
    req.on("data", (chunk) => {
      data += chunk
    })
    req.on("end", () => {
      clearTimeout(timer)
      try {
        client.close()
      } catch {
        /* noop */
      }
      if (status === 200) return done({ ok: true, status })
      let reason: string | undefined
      try {
        reason = (JSON.parse(data) as { reason?: string }).reason
      } catch {
        /* non-JSON */
      }
      done({ ok: false, status, reason })
    })
    req.on("error", () => {
      clearTimeout(timer)
      try {
        client.close()
      } catch {
        /* noop */
      }
      done({ ok: false, status: 0, reason: "request" })
    })
    req.end(bodyJson)
  })
}

import type { NextRequest } from "next/server"

/**
 * Auth2'nin kendi public URL'ini detect eder. Coolify / Traefik / Nginx /
 * benzeri reverse proxy arkasında çalıştığı için container içinden
 * `request.nextUrl.host` `0.0.0.0:3003` görür — bu URL OIDC discovery'de
 * `issuer` olarak yayınlanırsa RP'lerin token verification'ı patlar.
 *
 * Fallback chain:
 *   1. `NEXT_PUBLIC_AUTH_APP_URL` env (en güvenilir, explicit config)
 *   2. `X-Forwarded-Proto` + `X-Forwarded-Host` header'ları
 *      (Coolify/Traefik standart olarak set eder)
 *   3. `request.nextUrl` — last resort (dev'de + reverse proxy'siz deploy'da)
 */
export function getPublicUrl(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL
  if (envUrl && envUrl.length > 0) {
    return envUrl.replace(/\/+$/, "")
  }

  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto")
  if (forwardedHost) {
    const proto = forwardedProto || "https"
    return `${proto}://${forwardedHost}`.replace(/\/+$/, "")
  }

  return `${request.nextUrl.protocol}//${request.nextUrl.host}`.replace(/\/+$/, "")
}

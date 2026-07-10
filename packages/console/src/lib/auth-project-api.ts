import { NextRequest, NextResponse } from "next/server"
import { authProjectModel } from "@workspace/db/models"
import type { AuthProject } from "@workspace/db/models/auth-project"

/**
 * Public Auth Project API utilities.
 *
 * Tüm `/api/v1/auth/[projectSlug]/...` endpoint'leri için ortak:
 *   - `Authorization: Bearer aps_...` header → project'i çöz
 *   - CORS: project'in `allowedOrigins` listesine göre echo origin (yoksa
 *     wildcard reddedilir, OPTIONS 403)
 *   - JSON response helper'ları (`{data, error}` shape, RFC 6750
 *     WWW-Authenticate header'ı 401'de)
 *
 * Bu utilities Sentroy iç dashboard API'leri (`/api/companies/...`) ile
 * paylaşılmaz — onlar session/access-token auth kullanır. Auth Project
 * public API'leri ayrı namespace.
 */

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
const ALLOWED_HEADERS =
  "Authorization, Content-Type, X-Requested-With, Accept"

function corsHeadersFor(
  origin: string | null,
  allowedOrigins: string[],
): Record<string, string> {
  // Wildcard origin policy:
  //   - allowedOrigins boş VE Origin header yok → server-to-server,
  //     CORS irrelevant (browser değil). Headers emit edilmez.
  //   - allowedOrigins boş AMA Origin set → reject (CORS deny).
  //   - allowedOrigins'da match → echo + credentials true.
  //   - allowedOrigins'da `*` → echo origin (cookies için credentials
  //     hâlâ origin-specific olmak zorunda).
  if (!origin) return {}
  const wildcard = allowedOrigins.includes("*")
  if (!wildcard && !allowedOrigins.includes(origin)) {
    // İzin yok → CORS denied (browser preflight reddeder).
    return {}
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}

export interface AuthApiContext {
  project: AuthProject
  origin: string | null
  corsHeaders: Record<string, string>
}

/**
 * Project authentication via `Authorization: Bearer aps_...`. Header yoksa
 * veya hash eşleşmesi yoksa 401 döner; aksi halde `{project, ...}` ctx.
 *
 * **slug match**: URL'deki `[projectSlug]` ile API key'in ait olduğu
 * project slug'ı eşleşmek zorunda — yanlış slug'a key kullanıp leak
 * yapamasın.
 */
export async function resolveProjectAuth(
  request: NextRequest,
  routeSlug: string,
): Promise<NextResponse | AuthApiContext> {
  const auth = request.headers.get("authorization") || ""
  const match = auth.match(/^Bearer\s+(aps_[A-Za-z0-9_-]+)$/)
  if (!match) {
    return jsonError(
      "invalid_request",
      "Missing or malformed Authorization Bearer header.",
      401,
      [],
    )
  }
  const project = await authProjectModel.verifyApiKey(match[1])
  if (!project) {
    return jsonError("invalid_token", "API key not recognised.", 401, [])
  }
  if (project.slug !== routeSlug) {
    return jsonError(
      "invalid_token",
      "API key does not belong to this project.",
      401,
      [],
    )
  }
  const origin = request.headers.get("origin")
  return {
    project,
    origin,
    corsHeaders: corsHeadersFor(origin, project.allowedOrigins),
  }
}

/**
 * Token-only project resolution — `verify-email` ve `password-reset/confirm`
 * gibi endpoint'ler için. API key beklemez; mail link'inde gelen single-
 * use token zaten secret-of-knowledge.
 *
 * Slug üzerinden project'i çözer, enabled değilse 404 verir. CORS hâlâ
 * `allowedOrigins` listesine göre işler (RP'nin reset-password sayfası
 * Sentroy auth2 olabilir veya RP'nin kendi front-end'i — her ikisi de
 * project ayarındaki allow-list'e bağlı).
 */
export async function resolveProjectBySlug(
  request: NextRequest,
  routeSlug: string,
): Promise<NextResponse | AuthApiContext> {
  const project = await authProjectModel.findBySlug(routeSlug)
  if (!project || !project.enabled) {
    return jsonError("invalid_request", "Unknown project.", 404, [])
  }
  const origin = request.headers.get("origin")
  return {
    project,
    origin,
    corsHeaders: corsHeadersFor(origin, project.allowedOrigins),
  }
}

/**
 * End-user token auth — `Authorization: Bearer <access-token>` (project's
 * own JWT). Verify project key'iyle yapılır (caller `signProjectIdToken`
 * ile issue etmiş olmalı).
 */
export function extractBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization") || ""
  // Match either project API key or user access token (JWT three-part)
  const m = auth.match(/^Bearer\s+(\S+)$/)
  return m ? m[1] : null
}

export function jsonError(
  error: string,
  description: string,
  status = 400,
  corsHeaders: Record<string, string> | string[] = [],
): NextResponse {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  }
  if (!Array.isArray(corsHeaders)) Object.assign(headers, corsHeaders)
  if (status === 401) {
    headers["WWW-Authenticate"] =
      `Bearer error="${error}", error_description="${description}"`
  }
  return new NextResponse(
    JSON.stringify({ error, error_description: description }),
    { status, headers },
  )
}

export function jsonOk(
  body: Record<string, unknown>,
  corsHeaders: Record<string, string> = {},
  status = 200,
): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders,
    },
  })
}

export function preflight(
  request: NextRequest,
  project: AuthProject | null,
): NextResponse {
  const origin = request.headers.get("origin")
  if (!project) {
    return new NextResponse(null, { status: 204 })
  }
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersFor(origin, project.allowedOrigins),
  })
}

/**
 * Email format check — RFC 5322 simplified. Strict regex değil
 * (false negative pahalı), kabaca @ + . içeriyor mu. Backend
 * authoritative değil; RP signup'tan sonra verification mail
 * deliver edilebiliyorsa email zaten valid sayılır.
 */
export function isLikelyEmail(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
  )
}

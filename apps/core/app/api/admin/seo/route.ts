import { NextRequest } from "next/server"
// Note: cache(seoSettingsModel.get) in [lang]/layout.tsx is per-request scoped
// (React 19 cache), so each new SSR pass reads fresh from Mongo after the
// admin update — no explicit invalidation needed.
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { seoSettingsModel } from "@workspace/db/models"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const settings = await seoSettingsModel.get()
  return jsonSuccess(settings)
}

export async function PATCH(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}

  // ── Nullable string trackers + verification ────────────────────────
  const stringOrNullFields = [
    "gaId",
    "gtmId",
    "metaPixelId",
    "plausibleDomain",
    "hotjarId",
    "twitterHandle",
    "defaultOgImageUrl",
    "robotsOverride",
    "googleSiteVerification",
    "bingSiteVerification",
  ] as const
  for (const field of stringOrNullFields) {
    if (field in body) {
      const value = body[field]
      if (value === null) {
        patch[field] = null
      } else if (typeof value === "string") {
        const trimmed = value.trim()
        patch[field] = trimmed.length === 0 ? null : trimmed
      }
    }
  }

  // ── Per-locale Record<string,string> fields ────────────────────────
  for (const field of ["defaultDescription", "defaultOgTitle"] as const) {
    if (field in body) {
      const value = body[field]
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const sanitized: Record<string, string> = {}
        for (const [lang, raw] of Object.entries(value as Record<string, unknown>)) {
          if (typeof raw === "string") sanitized[lang] = raw
        }
        patch[field] = sanitized
      }
    }
  }

  // ── Per-locale Record<string,string[]> — keywords ──────────────────
  if ("defaultKeywords" in body) {
    const value = body.defaultKeywords
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sanitized: Record<string, string[]> = {}
      for (const [lang, raw] of Object.entries(value as Record<string, unknown>)) {
        if (Array.isArray(raw)) {
          sanitized[lang] = raw
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        }
      }
      patch.defaultKeywords = sanitized
    }
  }

  if (Object.keys(patch).length === 0) {
    return jsonError("Nothing to update")
  }

  const settings = await seoSettingsModel.update(patch as Parameters<typeof seoSettingsModel.update>[0])
  return jsonSuccess(settings)
}

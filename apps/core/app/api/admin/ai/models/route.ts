import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { listAvailableModels } from "@workspace/ai-assistant/assistant"
import { AssistantError } from "@workspace/ai-assistant/assistant"

/**
 * GET /api/admin/ai/models?type=language
 *
 * Vercel AI Gateway'in canlı model katalogunu döndürür. Şimdilik sadece
 * `language` (text → text) modelleri filtrelenir; ileride `image` /
 * `embedding` türleri için de query param ile genişletilebilir.
 *
 * Response shape (admin combobox için):
 *   { models: [{ id, name, provider, description, pricingPer1M, badge }] }
 *
 * Caching: in-memory 1 saatlik TTL — Vercel AI Gateway katalogu sık
 * değişmez, her admin sayfa açışında ağ trafiği gereksiz. Process restart
 * cache'i sıfırlar (Coolify deploy = yenilenir).
 */

type CachedModelList = {
  fetchedAt: number
  data: Array<{
    id: string
    name: string
    provider: string
    description: string | null
    /** Per 1M tokens USD — UI'da "$X.XX / $Y.YY" şeklinde gösterilir. */
    pricingPer1M: { input: number; output: number } | null
    /** Hız/kalite hint'i — name+provider'dan inferred. */
    badge: string | null
  }>
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1h
let _cache: { language?: CachedModelList } = {}

function inferBadge(name: string, id: string): string | null {
  const lower = `${name} ${id}`.toLowerCase()
  if (lower.includes("nano") || lower.includes("mini") || lower.includes("flash-lite")) {
    return "fast"
  }
  if (lower.includes("flash") || lower.includes("haiku")) return "fast"
  if (lower.includes("pro") || lower.includes("opus") || lower.includes("ultra")) {
    return "capable"
  }
  if (lower.includes("sonnet") || lower.includes("4o") || lower.includes("medium")) {
    return "balanced"
  }
  return null
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const url = new URL(request.url)
  const type = url.searchParams.get("type") ?? "language"
  if (type !== "language") {
    return jsonError("Only 'language' (text→text) is supported for now", 400)
  }

  const now = Date.now()
  const cached = _cache.language
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return jsonSuccess({ models: cached.data, cachedAt: cached.fetchedAt })
  }

  try {
    const meta = await listAvailableModels()
    const filtered = meta.models
      .filter((m) => m.modelType === "language" || m.modelType == null)
      .map((m) => {
        // pricing.input/output USD per token (string). 1M token başına çevir.
        const pricing = m.pricing
          ? {
              input: Number.parseFloat(m.pricing.input) * 1_000_000,
              output: Number.parseFloat(m.pricing.output) * 1_000_000,
            }
          : null
        const provider = m.id.split("/")[0] ?? "unknown"
        return {
          id: m.id,
          name: m.name || m.id,
          provider,
          description: m.description ?? null,
          pricingPer1M: pricing,
          badge: inferBadge(m.name || m.id, m.id),
        }
      })
      .sort((a, b) => {
        // Provider alfabetik, içinde ucuz model önce.
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider)
        const ai = a.pricingPer1M?.input ?? Number.POSITIVE_INFINITY
        const bi = b.pricingPer1M?.input ?? Number.POSITIVE_INFINITY
        return ai - bi
      })

    _cache.language = { fetchedAt: now, data: filtered }
    return jsonSuccess({ models: filtered, cachedAt: now })
  } catch (err) {
    if (err instanceof AssistantError && err.code === "missing-api-key") {
      return jsonError(err.message, 503)
    }
    console.error("[admin/ai/models] fetch failed:", err)
    return jsonError(
      err instanceof Error ? err.message : "Model listesi alınamadı",
      502,
    )
  }
}

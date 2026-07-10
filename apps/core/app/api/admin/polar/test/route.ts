import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { getPolarClient, type PolarMode } from "@/lib/polar/client"

export const runtime = "nodejs"

/**
 * POST /api/admin/polar/test — verilen (ya da aktif) ortamın token'ıyla
 * Polar'a bir okuma isteği atıp bağlantıyı doğrular.
 */
export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: { mode?: string } = {}
  try {
    body = (await request.json()) as { mode?: string }
  } catch {
    body = {}
  }
  const mode: PolarMode | undefined =
    body.mode === "sandbox" || body.mode === "production"
      ? body.mode
      : undefined

  const resolved = await getPolarClient(mode)
  if (!resolved) {
    return jsonError("No access token configured for this environment", 400)
  }

  try {
    const iterator = await resolved.client.products.list({})
    for await (const _page of iterator) {
      void _page
      break
    }
    return jsonSuccess({ ok: true, mode: resolved.mode })
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Polar connection failed",
      502,
    )
  }
}

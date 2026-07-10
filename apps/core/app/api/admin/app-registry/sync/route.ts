import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { syncRegistry, isRegistrySyncEnabled } from "@/lib/app-registry/sync"

/**
 * POST /api/admin/app-registry/sync — admin-tetiklemeli registry sync.
 * APP_REGISTRY_ENABLED yoksa 409. SyncReport döner.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error
  if (!isRegistrySyncEnabled()) {
    return jsonError("App registry sync is disabled (set APP_REGISTRY_ENABLED)", 409)
  }
  const report = await syncRegistry({ trigger: "manual" })
  return jsonSuccess(report)
}

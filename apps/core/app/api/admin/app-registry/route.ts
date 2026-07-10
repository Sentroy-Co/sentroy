import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { registryStateModel, registrySyncConflictModel, sentroyAppModel } from "@workspace/db/models"
import { isRegistrySyncEnabled } from "@/lib/app-registry/sync"

/**
 * Admin registry yönetimi.
 *  GET  → sync durumu + çözülmemiş çakışmalar + blocklist + tombstone'lar.
 *  POST → aksiyonlar: block/unblock, enable/disable (yerel registry satırı),
 *         resolve-conflict, set/clear localFeatured, unrevoke.
 * assertAdmin gated. Registry-kapalıysa GET yine durumu döner (boş).
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error
  const [state, conflicts] = await Promise.all([
    registryStateModel.get(),
    registrySyncConflictModel.list({ unresolvedOnly: true }),
  ])
  return jsonSuccess({
    enabled: isRegistrySyncEnabled(),
    lastSyncAt: state.lastSyncAt,
    lastCatalogVersion: state.lastCatalogVersion,
    lastCatalogGeneratedAt: state.lastCatalogGeneratedAt,
    lastError: state.lastError,
    blockedAppIds: state.blockedAppIds,
    revokedTombstones: state.revokedTombstones,
    localFeaturedOverride: state.localFeaturedOverride,
    conflicts,
  })
}

interface ActionBody {
  action?: string
  appId?: string
  conflictId?: string
  appIds?: string[]
}

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: ActionBody
  try {
    body = (await request.json()) as ActionBody
  } catch {
    return jsonError("Invalid JSON", 400)
  }
  const action = body.action

  switch (action) {
    case "block": {
      if (!body.appId) return jsonError("appId required", 400)
      await registryStateModel.block(body.appId)
      // Yerel registry satırı varsa hemen disable et.
      const app = await sentroyAppModel.findByAppId(body.appId)
      if (app && app.source === "registry" && app.enabled) {
        await sentroyAppModel.update(app.id, { enabled: false })
      }
      return jsonSuccess({ ok: true })
    }
    case "unblock": {
      if (!body.appId) return jsonError("appId required", 400)
      await registryStateModel.unblock(body.appId)
      return jsonSuccess({ ok: true })
    }
    case "unrevoke": {
      if (!body.appId) return jsonError("appId required", 400)
      await registryStateModel.unrevoke(body.appId)
      return jsonSuccess({ ok: true })
    }
    case "enable":
    case "disable": {
      if (!body.appId) return jsonError("appId required", 400)
      const app = await sentroyAppModel.findByAppId(body.appId)
      if (!app || app.source !== "registry") return jsonError("registry app not found", 404)
      const localState = action === "disable" ? "disabled" : "enabled"
      // enabled hesabı: disable → false; enable → revoked/blocked değilse true.
      const revoked = await registryStateModel.isRevoked(body.appId)
      const blocked = await registryStateModel.isBlocked(body.appId)
      const enabled = action === "enable" && !revoked && !blocked
      await sentroyAppModel.update(app.id, { localState, enabled })
      return jsonSuccess({ ok: true, enabled })
    }
    case "resolve-conflict": {
      if (!body.conflictId) return jsonError("conflictId required", 400)
      const ok = await registrySyncConflictModel.resolve(body.conflictId, access.session.user.id)
      return jsonSuccess({ ok })
    }
    case "set-local-featured": {
      if (!Array.isArray(body.appIds)) return jsonError("appIds required", 400)
      await registryStateModel.setLocalFeatured(body.appIds)
      return jsonSuccess({ ok: true })
    }
    case "clear-local-featured": {
      await registryStateModel.clearLocalFeatured()
      return jsonSuccess({ ok: true })
    }
    default:
      return jsonError("unknown action", 400)
  }
}

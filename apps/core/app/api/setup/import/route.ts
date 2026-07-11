export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { applyJsonDump, getDbNameFromUri, type DbDump } from "@/lib/backup-service"
import { assertSetupAllowed } from "@/lib/setup-guard"

/**
 * POST /api/setup/import — first-run JSON dump import (no auth).
 *
 * Guard: `assertSetupAllowed` — rate-limit + opsiyonel SETUP_TOKEN + DB
 * initialized=false. /api/admin/backups/import'tan fark: bu setup phase'inde
 * hiç user yok, snapshot anlamsız. Direkt apply.
 *
 * Body: multipart/form-data
 *   - file: JSON dump (DbDump shape)
 */
export async function POST(request: NextRequest) {
  const blocked = await assertSetupAllowed(request)
  if (blocked) return blocked

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError("Expected multipart/form-data body")
  }

  const file = form.get("file")
  if (!(file instanceof Blob) || file.size === 0) {
    return jsonError("No JSON file provided")
  }
  const text = await file.text()
  let dump: DbDump
  try {
    dump = JSON.parse(text) as DbDump
  } catch {
    return jsonError("Invalid JSON")
  }
  if (!dump || typeof dump !== "object" || !dump.collections) {
    return jsonError("JSON missing `collections` field")
  }

  const currentUri = process.env.MONGODB_URI
  if (!currentUri) return jsonError("MONGODB_URI is not configured", 500)
  const currentDbName = getDbNameFromUri(currentUri)

  const result = await applyJsonDump({
    targetUri: currentUri,
    targetDbName: currentDbName,
    dump,
  })
  if (!result.ok) return jsonError(result.error ?? "Import failed", 500)

  return jsonSuccess({
    collectionsCopied: result.collectionsCopied,
    totalDocs: result.totalDocs,
    sourceDbName: dump._meta?.sourceDbName ?? null,
  })
}

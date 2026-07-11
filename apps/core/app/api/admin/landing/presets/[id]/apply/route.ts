export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingPresetModel } from "@workspace/db/models"

/**
 * POST /api/admin/landing/presets/[id]/apply
 *
 * Destructive: 5 collection'ı silip seçilen preset'in snapshot'unu yazar.
 * Önce mevcut state otomatik "auto-backup" olarak kaydedilir → kullanıcı
 * yanlış preset uyguladığında tek tıkla geri dönebilir. Auto-backup'lar
 * 5 adetten fazla olursa en eskiler temizlenir.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const { id } = await params

  // Pre-flight: preset gerçekten mevcut mu?
  const preset = await landingPresetModel.findById(id)
  if (!preset) return jsonError("Preset not found", 404)

  // Auto-backup mevcut state — geri dönüş yolu.
  const backup = await landingPresetModel.createFromCurrent({
    name: `auto-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
    description: `Snapshot before applying "${preset.name}"`,
    isAutoBackup: true,
  })

  const result = await landingPresetModel.applyById(id)
  if (!result.applied) return jsonError(result.reason)

  // Eski auto-backup'ları temizle (son 5 yeter).
  await landingPresetModel.pruneAutoBackups(5).catch(() => {})

  return jsonSuccess({
    applied: true,
    presetName: preset.name,
    autoBackupId: backup.id,
  })
}

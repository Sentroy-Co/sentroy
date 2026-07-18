export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { noteModel } from "@workspace/db/models"
import { viewerIsCompanyAdmin } from "@/lib/notes/shared"

/**
 * GET — çöp kutusu: son 30 gün içinde SİLİNEN notlar (deletedAt azalan). Önce
 * 30 günden eskileri kalıcı siler (tembel purge → "30 gün içinde kaybolur").
 * Kullanıcı kendi sildiklerini; owner/admin şirketteki tümünü görür.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const url = new URL(request.url)
  const beforeRaw = url.searchParams.get("before")
  const before = beforeRaw ? new Date(beforeRaw) : undefined
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200)

  await noteModel.purgeExpired(access.companyId)

  const notes = await noteModel.findTrash(
    access.companyId,
    { userId: access.session?.user.id ?? "", isAdmin: viewerIsCompanyAdmin(access) },
    { limit, before },
  )

  return jsonSuccess({
    notes,
    nextBefore:
      notes.length === limit ? notes[notes.length - 1]!.deletedAt : null,
  })
}

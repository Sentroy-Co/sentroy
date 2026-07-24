import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { hasPermission } from "@workspace/auth/server/permissions"
import { getUiFlagsForCompany } from "@/lib/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /ui-flags — şirketin çözülmüş UI görünürlük bayrakları + çağıranın yetki
 * seviyesi (Sentroy Tasks mobil). `getUiFlagsForCompany` (yerel ayar, Linear
 * API'siz) + `canEdit` (linear.edit) / `canManage` (linear.manage) → mobil
 * create/yorum/inline-edit'i ve admin (linear-settings) erişimini buna göre
 * kısar. Token modu tam erişim sayılır (permission zorlanmaz). linear.view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const flags = await getUiFlagsForCompany(access.companyId)

  // Token modu izinleri zorlamaz → tam erişim. Session modunda gerçek kontrol.
  let canEdit = access.isTokenAccess
  let canManage = access.isTokenAccess
  if (access.session) {
    canEdit = await hasPermission(access.session, slug, "linear.edit")
    canManage = await hasPermission(access.session, slug, "linear.manage")
  }

  return jsonSuccess({ ...flags, canEdit, canManage })
}

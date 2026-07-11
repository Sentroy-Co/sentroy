export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { systemEmailTemplateModel } from "@workspace/db/models"
import { TEMPLATE_CATEGORIES } from "@workspace/db/models/system-email-template"

/**
 * GET /api/companies/[slug]/template-library?category=otp
 *
 * Public template library — system_email_templates collection'undan sadece
 * isPublic=true olanları döndürür. Auth gerekir (company access) ama herhangi
 * bir company member görüntüleyebilir; kategori filter opsiyonel.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const categoryParam = request.nextUrl.searchParams.get("category") || undefined
  const category =
    categoryParam && TEMPLATE_CATEGORIES.includes(categoryParam as never)
      ? (categoryParam as (typeof TEMPLATE_CATEGORIES)[number])
      : undefined

  const items = await systemEmailTemplateModel.list({ onlyPublic: true, category })
  return jsonSuccess(items)
}

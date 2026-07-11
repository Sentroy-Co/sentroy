export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import {
  systemEmailTemplateModel,
  systemTemplateCollectionModel,
} from "@workspace/db/models"

/**
 * GET /api/admin/system-mail/templates
 *
 * Admin: sistem-wide hazır mail template gallery (system_email_templates
 * koleksiyonu). Per-company kullanıcı template'leri (mail_template_sources)
 * burada yer almaz — admin'in sistem mail event editor'üne sadece sistem
 * tarafından yönetilen "preset"ler import edilebilsin.
 *
 * Response:
 *   - id, key, name, description, subject, htmlBody (LocalizedString)
 *   - variables (string[]) — template'in beklediği placeholder isimleri
 *   - thumbnailUrl, category, collectionId
 *
 * Optional:
 *   - `?q=` name/description/subject substring filter (case-insensitive)
 *   - `?category=` exact match TEMPLATE_CATEGORIES'den biri
 *
 * Permission: yalnızca system admin.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const url = new URL(request.url)
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase()
  const category = url.searchParams.get("category")?.trim() || undefined

  const [all, collections] = await Promise.all([
    systemEmailTemplateModel.list({
      onlyPublic: false,
      ...(category && { category: category as never }),
    }),
    systemTemplateCollectionModel.list({ onlyPublic: false }),
  ])

  function pickFirstString(value: unknown): string {
    if (typeof value === "string") return value
    if (value && typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) return v
      }
    }
    return ""
  }

  const items = all
    .map((t) => ({
      id: t.id,
      key: t.key,
      collectionId: t.collectionId,
      name: t.name,
      description: t.description,
      category: t.category,
      subject: t.subject,
      htmlBody: t.htmlBody,
      variables: t.variables,
      thumbnailUrl: t.thumbnailUrl,
      isPublic: t.isPublic,
      updatedAt: t.updatedAt,
      _searchName: pickFirstString(t.name).toLowerCase(),
      _searchSubject: pickFirstString(t.subject).toLowerCase(),
      _searchDesc: pickFirstString(t.description).toLowerCase(),
    }))
    .filter((t) => {
      if (!q) return true
      return (
        t._searchName.includes(q) ||
        t._searchSubject.includes(q) ||
        t._searchDesc.includes(q) ||
        t.key.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      )
    })
    .map(({ _searchName: _n, _searchSubject: _s, _searchDesc: _d, ...rest }) => {
      void _n
      void _s
      void _d
      return rest
    })

  return jsonSuccess({
    items,
    collections: collections.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      coverUrl: c.coverUrl,
    })),
  })
}

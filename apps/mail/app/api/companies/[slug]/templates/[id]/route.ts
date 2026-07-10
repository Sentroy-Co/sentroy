import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  mailTemplateThumbnailModel,
  mailTemplateSourceModel,
} from "@workspace/db/models"
import { cdnDelete } from "@workspace/cdn-client"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { getOrCreateTemplateThumbnailBucket } from "@/lib/template-thumbnails"
import type { LocalizedString, UpdateTemplateParams } from "@sentroy-co/sdk"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error

  try {
    const template = await result.sentroy!.templates.get(id)
    if (!template.data) return jsonSuccess(template.data)
    const src = await mailTemplateSourceModel.findByTemplate(
      result.companyId!,
      id,
    )
    if (!src) return jsonSuccess(template.data)
    return jsonSuccess({
      ...template.data,
      name: src.name as never,
      subject: src.subject as never,
      mjmlBody: src.body as never,
    })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get template"
    return jsonError(message, 500)
  }
}

function normalizeLocalized(
  value: unknown,
): LocalizedString | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj: Record<string, string> = {}
    for (const [lang, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) {
        obj[lang] = v.trim()
      }
    }
    return Object.keys(obj).length > 0 ? obj : undefined
  }
  return undefined
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: UpdateTemplateParams = {}
  if (body.name !== undefined) {
    const v = normalizeLocalized(body.name)
    if (v) updates.name = v
  }
  if (body.subject !== undefined) {
    const v = normalizeLocalized(body.subject)
    if (v) updates.subject = v
  }
  if (body.mjmlBody !== undefined) {
    const v = normalizeLocalized(body.mjmlBody)
    if (v) updates.mjmlBody = v
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error

  try {
    const updated = await result.sentroy!.templates.update(id, updates)

    // Source-of-truth merge — mevcut kayıt varsa partial update; yoksa
    // sentroy'dan dönen tam data ile insert ki ileride hep override edilsin.
    const companyId = result.companyId!
    const current = await mailTemplateSourceModel.findByTemplate(companyId, id)
    const merged = {
      name: updates.name ?? current?.name ?? (updated.data?.name as never) ?? "",
      subject:
        updates.subject ??
        current?.subject ??
        (updated.data?.subject as never) ??
        "",
      body:
        updates.mjmlBody ??
        current?.body ??
        (updated.data?.mjmlBody as never) ??
        "",
    }
    await mailTemplateSourceModel
      .upsert({ companyId, templateId: id, ...merged })
      .catch((e) => console.warn("[templates] source persist failed:", e))

    return jsonSuccess(updated.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update template"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.templates.delete(id)

    // Thumbnail orphan cleanup — sentroy delete başarılı olduktan sonra
    // CDN media + thumbnail kaydını sil. Hata bypass edilir (cosmetic).
    const companyId = result.companyId!
    const existing = await mailTemplateThumbnailModel.findByTemplate(
      companyId,
      id,
    )
    if (existing) {
      const bucket = await getOrCreateTemplateThumbnailBucket(companyId)
      await cdnDelete(
        {
          companyId,
          bucketId: bucket.id,
          userId: result.callerUserId!,
          userEmail: result.callerEmail,
        },
        existing.mediaId,
      ).catch(() => {})
      await mailTemplateThumbnailModel.deleteByTemplate(companyId, id)
    }

    await mailTemplateSourceModel
      .deleteByTemplate(companyId, id)
      .catch(() => {})

    return jsonSuccess({ message: "Template deleted" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete template"
    return jsonError(message, 500)
  }
}

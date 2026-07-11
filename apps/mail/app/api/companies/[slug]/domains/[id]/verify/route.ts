export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { hasPermission } from "@workspace/auth/server/permissions"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  if (!result.isTokenAccess) {
    const canEdit = await hasPermission(
      result.session!,
      slug,
      `domains.domain:${id}:edit`,
    )
    if (!canEdit) {
      return jsonError("Insufficient permissions", 403)
    }
  }

  try {
    const verified = await result.sentroy!.domains.verify(id)
    return jsonSuccess(verified.data)
  } catch (err: any) {
    console.error("[domains:verify]", err?.statusCode, err?.body || err?.message)
    const message =
      err instanceof Error ? err.message : "Failed to verify domain"
    return jsonError(message, err?.statusCode || 500)
  }
}

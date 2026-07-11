export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { hasPermission } from "@workspace/auth/server/permissions"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  if (!result.isTokenAccess) {
    const canView = await hasPermission(
      result.session!,
      slug,
      `domains.domain:${id}:view`,
    )
    if (!canView) {
      return jsonError("Insufficient permissions", 403)
    }
  }

  try {
    const dns = await result.sentroy!.domains.getDnsRecords(id)
    return jsonSuccess(dns.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get DNS records"
    return jsonError(message, 500)
  }
}

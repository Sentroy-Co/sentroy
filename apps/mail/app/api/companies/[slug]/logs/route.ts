import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = request.nextUrl

  const result = await getSentroyForCompany(request, slug, "logs.view")
  if ("error" in result && result.error) return result.error

  try {
    const query: Record<string, unknown> = {}
    const page = searchParams.get("page")
    const limit = searchParams.get("limit")
    const status = searchParams.get("status")
    const domainId = searchParams.get("domainId")
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    if (page) query.page = Number(page)
    if (limit) query.limit = Number(limit)
    if (status) query.status = status
    if (domainId) query.domainId = domainId
    if (from) query.from = from
    if (to) query.to = to

    const logs = await result.sentroy!.logs.list(query)
    return jsonSuccess(logs.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list logs"
    return jsonError(message, 500)
  }
}

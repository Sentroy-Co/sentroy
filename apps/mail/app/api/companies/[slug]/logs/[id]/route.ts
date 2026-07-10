import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "logs.view")
  if ("error" in result && result.error) return result.error

  try {
    const log = await result.sentroy!.logs.get(id)
    return jsonSuccess(log.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get log"
    return jsonError(message, 500)
  }
}

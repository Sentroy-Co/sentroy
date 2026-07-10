import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "suppressions.manage")
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.suppressions.remove(id)
    return jsonSuccess({ message: "Suppression removed" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to remove suppression"
    return jsonError(message, 500)
  }
}

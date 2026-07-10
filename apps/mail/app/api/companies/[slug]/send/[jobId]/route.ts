import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; jobId: string }> }
) {
  const { slug, jobId } = await params

  const result = await getSentroyForCompany(request, slug, "send.execute")
  if ("error" in result && result.error) return result.error

  try {
    const status = await result.sentroy!.send.getJobStatus(jobId)
    return jsonSuccess(status.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get job status"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; jobId: string }> }
) {
  const { slug, jobId } = await params

  const result = await getSentroyForCompany(request, slug, "send.execute")
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.send.cancel(jobId)
    return jsonSuccess({ message: "Job cancelled" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to cancel job"
    return jsonError(message, 500)
  }
}

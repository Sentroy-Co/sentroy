import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { webhookDeliveryModel } from "@workspace/db/models"

/** Full delivery row — payload + response body for the inspector. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string; did: string }> },
) {
  const { slug, id, did } = await params

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  try {
    const row = await webhookDeliveryModel.findById(did)
    if (!row || row.webhookId !== id) {
      return jsonError("Delivery not found", 404)
    }
    if (row.companyId !== result.companyId) {
      return jsonError("Delivery not found", 404)
    }
    return jsonSuccess(row)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get delivery"
    return jsonError(message, 500)
  }
}

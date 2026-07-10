import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { webhookDeliveryModel } from "@workspace/db/models"
import { dispatchWebhook } from "@/lib/webhook-dispatcher"

/**
 * Re-fire the same payload at the webhook's *current* URL. The new row
 * is linked to the original via `replayOf`, so the inspector can show
 * "replay of #abc". Useful for retesting after the receiver fixes a bug.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string; did: string }> },
) {
  const { slug, id, did } = await params

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  const original = await webhookDeliveryModel.findById(did)
  if (!original || original.webhookId !== id || original.companyId !== result.companyId) {
    return jsonError("Delivery not found", 404)
  }

  // Pull the current webhook URL — it may have changed since the
  // original delivery, which is fine: replay tests the *current* config.
  let webhookData: { id: string; url: string } | null = null
  try {
    const w = await result.sentroy!.webhooks.get(id)
    webhookData = w.data as { id: string; url: string }
  } catch {
    return jsonError("Webhook not found", 404)
  }
  if (!webhookData?.url) return jsonError("Webhook has no URL", 422)

  const dispatch = await dispatchWebhook({
    webhookId: id,
    companyId: result.companyId!,
    url: webhookData.url,
    event: original.event,
    payload: original.payload,
    kind: "replay",
    triggeredBy: result.callerUserId ?? result.callerEmail ?? "system",
    replayOf: original.id,
  })

  return jsonSuccess(dispatch, 201)
}

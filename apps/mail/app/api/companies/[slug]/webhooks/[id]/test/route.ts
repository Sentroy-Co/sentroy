export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { dispatchWebhook } from "@/lib/webhook-dispatcher"

const ALLOWED_EVENTS = new Set([
  "sent",
  "bounced",
  "failed",
  "opened",
  "clicked",
  "unsubscribed",
])

/**
 * Manual test fire — POST a custom payload to a configured webhook URL.
 * Records the result in `webhook_deliveries` so the inspector can show
 * request + response + timing. The mail-server's automated event
 * delivery is unaffected; this is a debug tool, not a production path.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params

  let body: { event?: string; payload?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.event || typeof body.event !== "string") {
    return jsonError("event is required")
  }
  if (!ALLOWED_EVENTS.has(body.event)) {
    return jsonError(
      `Unknown event. Must be one of: ${[...ALLOWED_EVENTS].join(", ")}`,
    )
  }
  if (!body.payload || typeof body.payload !== "object") {
    return jsonError("payload object is required")
  }

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  let webhookData: { id: string; url: string; active?: boolean } | null = null
  try {
    const w = await result.sentroy!.webhooks.get(id)
    webhookData = w.data as { id: string; url: string; active?: boolean }
  } catch {
    return jsonError("Webhook not found", 404)
  }
  if (!webhookData?.url) return jsonError("Webhook has no URL", 422)

  const dispatch = await dispatchWebhook({
    webhookId: id,
    companyId: result.companyId!,
    url: webhookData.url,
    event: body.event,
    payload: body.payload,
    kind: "test",
    triggeredBy: result.callerUserId ?? result.callerEmail ?? "system",
  })

  return jsonSuccess(dispatch, 201)
}

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { webhookDeliveryModel } from "@workspace/db/models"
import type { WebhookDeliveryStatus } from "@workspace/db/models/webhook-delivery"

const VALID_STATUSES = new Set<WebhookDeliveryStatus>([
  "success",
  "failed",
  "pending",
])

/**
 * Paginated list of test/replay dispatches recorded for a webhook.
 * Production event deliveries are still tracked by the mail-server; this
 * endpoint returns only the rows fired from the Sentroy console.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  const url = request.nextUrl
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10))
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)),
  )
  const statusParam = url.searchParams.get("status")
  const status =
    statusParam && VALID_STATUSES.has(statusParam as WebhookDeliveryStatus)
      ? (statusParam as WebhookDeliveryStatus)
      : undefined

  try {
    // IDOR guard: delivery'leri companyId'ye scope'la — başka company'nin
    // webhook delivery'leri webhookId tahminiyle okunamaz.
    const { items, total } = await webhookDeliveryModel.findByWebhook(id, {
      limit,
      skip: (page - 1) * limit,
      status,
      companyId: result.companyId,
    })
    return jsonSuccess({ items, total, page, limit })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list deliveries"
    return jsonError(message, 500)
  }
}

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  try {
    const webhook = await result.sentroy!.webhooks.get(id)
    return jsonSuccess(webhook.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get webhook"
    return jsonError(message, 500)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  let body: { url?: string; events?: string[]; active?: boolean }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  try {
    const updated = await result.sentroy!.webhooks.update(id, body)
    return jsonSuccess(updated.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update webhook"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  try {
    await result.sentroy!.webhooks.delete(id)
    return jsonSuccess({ message: "Webhook deleted" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete webhook"
    return jsonError(message, 500)
  }
}

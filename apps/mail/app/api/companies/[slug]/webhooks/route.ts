import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = request.nextUrl
  const domainId = searchParams.get("domainId")

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  try {
    const webhooks = await result.sentroy!.webhooks.list(
      domainId || undefined
    )
    return jsonSuccess(webhooks.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list webhooks"
    return jsonError(message, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: { url?: string; events?: string[]; domainId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
    return jsonError("URL is required")
  }

  if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return jsonError("At least one event is required")
  }

  if (
    !body.domainId ||
    typeof body.domainId !== "string" ||
    !body.domainId.trim()
  ) {
    return jsonError("Domain is required")
  }

  const result = await getSentroyForCompany(request, slug, "webhooks.manage")
  if ("error" in result && result.error) return result.error

  try {
    const created = await result.sentroy!.webhooks.create({
      url: body.url.trim(),
      events: body.events,
      domainId: body.domainId.trim(),
    })
    return jsonSuccess(created.data, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create webhook"
    return jsonError(message, 500)
  }
}

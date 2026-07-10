import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = request.nextUrl

  const result = await getSentroyForCompany(request, slug, "suppressions.manage")
  if ("error" in result && result.error) return result.error

  try {
    const query: Record<string, unknown> = {}
    const page = searchParams.get("page")
    const limit = searchParams.get("limit")
    const domainId = searchParams.get("domainId")
    const reason = searchParams.get("reason")

    if (page) query.page = Number(page)
    if (limit) query.limit = Number(limit)
    if (domainId) query.domainId = domainId
    if (reason) query.reason = reason

    const suppressions = await result.sentroy!.suppressions.list(query)
    return jsonSuccess(suppressions.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list suppressions"
    return jsonError(message, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: { email?: string; reason?: string; domainId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.email || typeof body.email !== "string" || !body.email.trim()) {
    return jsonError("Email is required")
  }

  if (
    !body.domainId ||
    typeof body.domainId !== "string" ||
    !body.domainId.trim()
  ) {
    return jsonError("Domain is required")
  }

  const result = await getSentroyForCompany(request, slug, "suppressions.manage")
  if ("error" in result && result.error) return result.error

  try {
    const created = await result.sentroy!.suppressions.add({
      email: body.email.trim(),
      reason: body.reason || undefined,
      domainId: body.domainId.trim(),
    })
    return jsonSuccess(created.data, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to add suppression"
    return jsonError(message, 500)
  }
}

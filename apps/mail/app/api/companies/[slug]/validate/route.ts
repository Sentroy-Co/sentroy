export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: { email?: string; emails?: string[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  try {
    if (body.emails && Array.isArray(body.emails)) {
      if (body.emails.length === 0) {
        return jsonError("At least one email is required")
      }
      if (body.emails.length > 100) {
        return jsonError("Maximum 100 emails per batch")
      }
      const validated = await result.sentroy!.validate.batch(body.emails)
      return jsonSuccess(validated.data)
    }

    if (body.email && typeof body.email === "string") {
      const validated = await result.sentroy!.validate.email(body.email.trim())
      return jsonSuccess(validated.data)
    }

    return jsonError("Either email or emails field is required")
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to validate email"
    return jsonError(message, 500)
  }
}

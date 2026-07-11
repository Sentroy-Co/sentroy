export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  let body: { variables?: Record<string, string>; lang?: string } = {}
  try {
    body = await request.json()
  } catch {
    // optional
  }

  const result = await getSentroyForCompany(request, slug, "templates.manage")
  if ("error" in result && result.error) return result.error

  try {
    const preview = await result.sentroy!.templates.preview(
      id,
      body.variables,
      body.lang,
    )
    return jsonSuccess(preview.data)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to preview template"
    return jsonError(message, 500)
  }
}

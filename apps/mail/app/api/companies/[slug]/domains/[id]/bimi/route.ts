export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const result = await getSentroyForCompany(request, slug, "domains.edit")
  if ("error" in result && result.error) return result.error

  try {
    const res = await result.sentroy!.domains.getBimi(id)
    return jsonSuccess(res.data)
  } catch (err: unknown) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to get BIMI config",
      500,
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const result = await getSentroyForCompany(request, slug, "domains.edit")
  if ("error" in result && result.error) return result.error

  let body: { logoUrl?: string | null; vmcUrl?: string | null }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  try {
    const res = await result.sentroy!.domains.updateBimi(id, {
      logoUrl: body.logoUrl ?? null,
      vmcUrl: body.vmcUrl,
    })
    return jsonSuccess(res.data)
  } catch (err: unknown) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to update BIMI config",
      500,
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const result = await getSentroyForCompany(request, slug, "domains.edit")
  if ("error" in result && result.error) return result.error

  try {
    const res = await result.sentroy!.domains.verifyBimi(id)
    return jsonSuccess(res.data)
  } catch (err: unknown) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to verify BIMI",
      500,
    )
  }
}

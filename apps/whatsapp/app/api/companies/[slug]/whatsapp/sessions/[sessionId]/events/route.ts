import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError } from "@workspace/console/lib/api-helpers"
import { gatewayUrl, gatewayHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** SSE proxy — gateway'in oturum event stream'ini tarayıcıya geçirir. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.view")
  if ("error" in access) return access.error

  const abortController = new AbortController()
  request.signal.addEventListener("abort", () => abortController.abort())

  let upstream: Response
  try {
    upstream = await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/events`),
      {
        headers: { ...gatewayHeaders(), Accept: "text/event-stream" },
        signal: abortController.signal,
        cache: "no-store",
      },
    )
  } catch {
    return new Response(
      JSON.stringify({ data: null, error: "WhatsApp gateway unreachable" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "15" },
      },
    )
  }

  if (!upstream.ok || !upstream.body) {
    return jsonError(`Gateway returned ${upstream.status}`, upstream.status || 502)
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

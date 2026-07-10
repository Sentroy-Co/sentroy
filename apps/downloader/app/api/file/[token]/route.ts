import { NextRequest, NextResponse } from "next/server"
import { workerUrl, workerHeaders } from "@/lib/worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/file/:token → worker /file/:token (internal-secret) stream proxy'si.
 * Worker public domain almadığı için indirme app üzerinden geçer; worker'ın
 * Content-Disposition/Type/Length header'ları aynen iletilir.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(workerUrl(`/file/${token}`), {
      headers: workerHeaders(),
    })
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (!upstream.ok || !upstream.body) {
    const data = await upstream.json().catch(() => ({ error: "expired" }))
    return NextResponse.json(data, { status: upstream.status || 502 })
  }

  const headers = new Headers()
  for (const h of ["content-type", "content-length", "content-disposition"]) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  headers.set("Cache-Control", "private, no-store")
  return new NextResponse(upstream.body, { status: 200, headers })
}

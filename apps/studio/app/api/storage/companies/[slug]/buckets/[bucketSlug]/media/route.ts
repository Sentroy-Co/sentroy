import { NextRequest, NextResponse } from "next/server"

/**
 * SDK MediaManager upload proxy.
 *
 * Next.js 16 afterFiles rewrites multipart/form-data body'sini external
 * URL'e stream ederken boundary'i kaybediyor — storage app'in
 * `request.formData()` çağrısı "Expected multipart/form-data body"
 * hatasıyla 400 dönüyor. Bu lokal handler request body'sini explicit
 * arrayBuffer olarak okuyup, Content-Type başlığını koruyarak storage
 * app'e fetch ile forward eder.
 *
 * GET için aynı pattern — list media. Diğer path'ler (buckets list,
 * media [id], download) Next rewrites üzerinden gitmeye devam eder.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 120

const STORAGE_APP_URL = (
  process.env.STORAGE_APP_URL ||
  process.env.NEXT_PUBLIC_STORAGE_APP_URL ||
  "http://localhost:3002"
).replace(/\/+$/, "")

function buildTarget(slug: string, bucketSlug: string, search: string): string {
  return `${STORAGE_APP_URL}/api/companies/${slug}/buckets/${bucketSlug}/media${search}`
}

function forwardHeaders(request: NextRequest): Record<string, string> {
  const out: Record<string, string> = {}
  request.headers.forEach((v, k) => {
    const lower = k.toLowerCase()
    // Bu başlıkları forward etme — connection-level, container içi
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "content-length" ||
      lower === "transfer-encoding" ||
      lower === "x-forwarded-host" ||
      lower === "x-forwarded-proto" ||
      lower === "x-real-ip"
    ) {
      return
    }
    out[k] = v
  })
  return out
}

function passthrough(res: Response): NextResponse {
  // Response body'sini stream geri ver; status + Content-Type koru
  const headers = new Headers()
  res.headers.forEach((v, k) => {
    const lower = k.toLowerCase()
    if (lower === "content-encoding" || lower === "transfer-encoding") return
    headers.set(k, v)
  })
  return new NextResponse(res.body, { status: res.status, headers })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; bucketSlug: string }> },
) {
  const { slug, bucketSlug } = await context.params
  const url = new URL(request.url)
  const target = buildTarget(slug, bucketSlug, url.search)

  // Multipart body — boundary'i Content-Type başlığı taşıyor. arrayBuffer
  // ile binary-safe okuyup aynı header'larla forward et.
  const body = await request.arrayBuffer()
  const headers = forwardHeaders(request)

  const res = await fetch(target, {
    method: "POST",
    headers,
    body,
  })
  return passthrough(res)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; bucketSlug: string }> },
) {
  const { slug, bucketSlug } = await context.params
  const url = new URL(request.url)
  const target = buildTarget(slug, bucketSlug, url.search)
  const res = await fetch(target, {
    method: "GET",
    headers: forwardHeaders(request),
  })
  return passthrough(res)
}

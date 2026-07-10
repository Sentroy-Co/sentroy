/**
 * Company-scoped SSE stream — triage api.sync.stream portu, event-bus artık
 * companyId-keyed (tenant izolasyonu: yalnız bu şirketin webhook event'leri
 * akar). Client tarafı: hooks/use-linear-sync.ts.
 *
 * Header deseni whatsapp events route'uyla aynı (X-Accel-Buffering: no,
 * no-transform, request.signal abort → cleanup).
 */

import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { subscribe, type SyncEvent } from "@/lib/event-bus"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ENCODER = new TextEncoder()
const HEARTBEAT_MS = 25_000

function format(event: string, data: unknown): Uint8Array {
  const payload = typeof data === "string" ? data : JSON.stringify(data)
  return ENCODER.encode(`event: ${event}\ndata: ${payload}\n\n`)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const companyId = access.companyId

  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let cleaned = false
      // `closed` yalnız enqueue'yu durdurur; `cleaned` interval + listener
      // temizliğini tek sefere indirger. İkisi ayrı olmalı: aksi halde
      // enqueue hatası closed=true yapınca sonraki cleanup() erken return
      // eder ve heartbeat interval'ı + event-bus listener'ı sızar.
      cleanup = () => {
        if (cleaned) return
        cleaned = true
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return
        try {
          controller.enqueue(chunk)
        } catch {
          // Client bağlantıyı kapatmış; yaz denemesi patlar → tam temizlik.
          cleanup()
        }
      }

      const unsubscribe = subscribe(companyId, (event: SyncEvent) => {
        safeEnqueue(format("sync", event))
      })

      const heartbeat = setInterval(() => {
        // SSE comment line — keeps proxies (nginx, Cloudflare) from
        // closing idle connections without re-triggering revalidate.
        safeEnqueue(ENCODER.encode(`: ping ${Date.now()}\n\n`))
      }, HEARTBEAT_MS)

      // Initial hello so the EventSource flips to "open" state immediately.
      // (subscribe + heartbeat kurulduktan sonra: enqueue patlarsa cleanup()
      // artık ikisine de erişebilir — TDZ yok.)
      safeEnqueue(format("hello", { at: Date.now() }))

      request.signal.addEventListener("abort", cleanup, { once: true })
      // Abort daha start() çalışmadan gelmiş olabilir — kaçırma.
      if (request.signal.aborted) cleanup()
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

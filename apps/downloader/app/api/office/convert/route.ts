export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { workerUrl } from "@/lib/worker"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * POST /api/office/convert (multipart: file + to) — Office/ODF ↔ PDF.
 * Tarayıcıdan gelen dosyayı downloader-worker'a (LibreOffice, internal) iletir,
 * dönüştürülmüş çıktıyı tarayıcıya geri stream eder. Worker token'ı app içinde
 * kalır (tarayıcı worker'a hiç erişmez). ⚠ Bu araç dosyayı SUNUCUDA işler
 * (client-side değil) — UI bunu net belirtir; worker işi bitince anında siler.
 * core'a rewrite EDİLMEZ (downloader serve eder).
 */

const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED_TARGETS = new Set(["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "csv", "txt", "rtf", "html"])

export async function POST(request: NextRequest) {
  // CPU koruması: Office dönüşümü (server LibreOffice) varsayılan KAPALI. Sunucu
  // upgrade'inde env OFFICE_CONVERT_ENABLED=true + ilgili tool'ları "live" yap.
  if (process.env.OFFICE_CONVERT_ENABLED !== "true") {
    return NextResponse.json({ error: "office_convert_disabled" }, { status: 503 })
  }
  const secret = process.env.DOWNLOADER_API_SECRET
  if (!secret) return NextResponse.json({ error: "service_unavailable" }, { status: 503 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }
  const file = form.get("file")
  const to = String(form.get("to") || "").toLowerCase()
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 })
  if (!ALLOWED_TARGETS.has(to)) return NextResponse.json({ error: "invalid_target" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 })
  if (file.size === 0) return NextResponse.json({ error: "empty_file" }, { status: 400 })

  const name = file.name || "document"

  try {
    // 1) Worker'a yükle + dönüştür → token al
    const buf = await file.arrayBuffer()
    const convRes = await fetch(workerUrl(`/office/convert?to=${encodeURIComponent(to)}&name=${encodeURIComponent(name)}`), {
      method: "POST",
      headers: { "x-internal-secret": secret, "content-type": "application/octet-stream" },
      body: buf,
    })
    const meta = (await convRes.json().catch(() => null)) as
      | { token?: string; filename?: string; mime?: string; error?: string }
      | null
    if (!convRes.ok || !meta?.token) {
      const status = convRes.status === 413 ? 413 : convRes.status === 422 ? 422 : 502
      return NextResponse.json({ error: meta?.error || "conversion_failed" }, { status })
    }

    // 2) Çıktıyı worker'dan çek + tarayıcıya stream et
    const fileRes = await fetch(workerUrl(`/file/${meta.token}`), { headers: { "x-internal-secret": secret } })
    if (!fileRes.ok || !fileRes.body) return NextResponse.json({ error: "fetch_failed" }, { status: 502 })

    const filename = meta.filename || `document.${to}`
    const asciiName = filename.replace(/[^\x20-\x7e]/g, "_")
    return new NextResponse(fileRes.body, {
      headers: {
        "content-type": meta.mime || "application/octet-stream",
        "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store",
      },
    })
  } catch {
    return NextResponse.json({ error: "conversion_failed" }, { status: 502 })
  }
}

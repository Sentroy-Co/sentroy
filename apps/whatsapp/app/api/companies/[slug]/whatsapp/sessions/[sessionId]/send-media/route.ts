import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { gatewayUrl, gatewayJsonHeaders } from "@/lib/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 16 * 1024 * 1024

function kindFromMime(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  return "document"
}

/** POST (multipart) — bir numaradan medya gönder. whatsapp.send. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; sessionId: string }> },
) {
  const { slug, sessionId } = await params
  const access = await resolveCompanyAccess(request, slug, "whatsapp.send")
  if ("error" in access) return access.error

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError("Expected multipart/form-data")
  }

  const to = form.get("to")
  const file = form.get("file")
  const caption = form.get("caption")
  if (typeof to !== "string" || !to) return jsonError("'to' is required")
  if (!(file instanceof File)) return jsonError("'file' is required")
  if (file.size === 0) return jsonError("Empty file")
  if (file.size > MAX_BYTES) return jsonError("File exceeds 16MB", 413)

  const buffer = Buffer.from(await file.arrayBuffer())
  const mimetype = file.type || "application/octet-stream"

  let res: Response
  try {
    res = await fetch(
      gatewayUrl(`/sessions/${access.companyId}/${sessionId}/sendmedia`),
      {
        method: "POST",
        headers: gatewayJsonHeaders(),
        body: JSON.stringify({
          to,
          kind: kindFromMime(mimetype),
          mimetype,
          fileName: file.name || undefined,
          caption: typeof caption === "string" && caption ? caption : undefined,
          dataBase64: buffer.toString("base64"),
        }),
      },
    )
  } catch {
    return jsonError("WhatsApp gateway unreachable", 503)
  }

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    return jsonError(
      (payload as { error?: string }).error || "Send failed",
      res.status || 502,
    )
  }

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "whatsapp.send-media",
    resource: "whatsapp-message",
    resourceId: (payload as { waMessageId?: string }).waMessageId || undefined,
    details: { to, mimetype, size: file.size, sessionId },
  })

  return jsonSuccess(payload)
}

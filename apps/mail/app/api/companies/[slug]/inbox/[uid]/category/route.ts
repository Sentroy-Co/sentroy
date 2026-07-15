export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"

// SDK'da henüz `inbox.setCategory` yok — drafts route'undaki desenle upstream
// endpoint'e (mail-server POST /inbox/:uid/category) company API key'i ile
// doğrudan gidiyoruz. SDK bump'ı yayınlandığında tek satıra iner.
const MAIL_SERVER_BASE = (
  process.env.SENTROY_MAIL_API_URL ||
  process.env.NEXT_PUBLIC_SENTROY_API_URL ||
  "http://localhost:3000/api/v1"
).replace(/\/$/, "")

const MAIL_SERVER_API = MAIL_SERVER_BASE.endsWith("/api/v1")
  ? MAIL_SERVER_BASE
  : `${MAIL_SERVER_BASE}/api/v1`

const VALID_CATEGORIES = new Set([
  "primary",
  "promotions",
  "updates",
  "receipts",
  "social",
])

/**
 * Mesajın kategorisini değiştir / kaldır. Kategori mail-server'da mesajın
 * üzerinde IMAP keyword olarak yaşar — bu çağrı keyword'ü değiştirir; web ve
 * mobil sonraki listede aynı değeri görür. `category: null|"primary"` =
 * kategoriyi kaldır (kalıcı "primary" işareti).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> },
) {
  const { slug, uid } = await params

  let body: {
    mailbox?: string
    folder?: string
    category?: string | null
  } = {}
  try {
    body = await request.json()
  } catch {
    // optional
  }

  const target =
    body.category == null || body.category === ""
      ? "primary"
      : String(body.category)
  if (!VALID_CATEGORIES.has(target)) {
    return jsonError(
      `Invalid category — expected one of: ${[...VALID_CATEGORIES].join(", ")}`,
      400,
    )
  }

  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error

  const apiKey =
    (result.company as { sentroyApiKey?: string } | undefined)
      ?.sentroyApiKey || ""
  if (!apiKey) {
    return jsonError("Mail server not provisioned", 502)
  }

  const qs = new URLSearchParams()
  if (body.mailbox) qs.set("mailbox", body.mailbox)
  if (body.folder) qs.set("folder", body.folder)

  try {
    const upstream = await fetch(
      `${MAIL_SERVER_API}/inbox/${encodeURIComponent(uid)}/category?${qs}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category: target }),
        cache: "no-store",
      },
    )
    const json = (await upstream.json().catch(() => ({}))) as {
      data?: unknown
      error?: string
    }
    if (!upstream.ok) {
      return jsonError(json.error || "Failed to update category", upstream.status)
    }
    return jsonSuccess(json.data ?? { message: "Category updated", category: target })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update category"
    return jsonError(message, 502)
  }
}

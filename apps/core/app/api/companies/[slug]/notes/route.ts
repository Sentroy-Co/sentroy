import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { noteModel } from "@workspace/db/models"
import type { NoteColor, NoteVisibility } from "@workspace/db/types"
import { sanitizeHtml } from "@workspace/console/lib/sanitize-html"
import { audit } from "@workspace/console/lib/audit"
import {
  NOTE_COLORS,
  NOTE_VISIBILITIES,
  deriveNoteTitle,
  resolveFolderId,
  viewerIsCompanyAdmin,
} from "@/lib/notes/shared"

/**
 * GET — şirketteki görünür notlar (Notlar uygulaması listesi). Kendi notların
 * (her gizlilikte) + members/public + (admin ise) admins. Yeniden eskiye,
 * `?before=<iso>` cursor sayfalama.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const url = new URL(request.url)
  const beforeRaw = url.searchParams.get("before")
  const limitRaw = url.searchParams.get("limit")
  const limit = Math.min(Math.max(Number(limitRaw) || 100, 1), 200)
  const before = beforeRaw ? new Date(beforeRaw) : undefined

  const viewerId = access.session?.user.id ?? ""
  const notes = await noteModel.findByCompany(
    access.companyId,
    { userId: viewerId, isAdmin: viewerIsCompanyAdmin(access) },
    { limit, before },
  )

  return jsonSuccess({
    notes,
    nextBefore:
      notes.length === limit ? notes[notes.length - 1]!.updatedAt : null,
  })
}

interface CreateBody {
  text?: string
  bodyHtml?: string
  mentions?: string[]
  visibility?: string
  color?: string
  folderId?: string | null
}

/**
 * POST — not oluştur. Boş not izinlidir (Apple Notes tarzı: boş başlar,
 * autosave PATCH ile dolar). Default görünürlük `author` (özel).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  let body: CreateBody
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const text = typeof body.text === "string" ? body.text.slice(0, 20000) : ""
  const bodyHtml =
    typeof body.bodyHtml === "string" && body.bodyHtml.trim()
      ? sanitizeHtml(body.bodyHtml)
      : null
  const mentions = Array.isArray(body.mentions)
    ? Array.from(
        new Set(body.mentions.filter((m): m is string => typeof m === "string")),
      ).slice(0, 50)
    : []
  const visibility: NoteVisibility = NOTE_VISIBILITIES.includes(
    body.visibility as NoteVisibility,
  )
    ? (body.visibility as NoteVisibility)
    : "author"
  const color: NoteColor = NOTE_COLORS.includes(body.color as NoteColor)
    ? (body.color as NoteColor)
    : "default"
  const folderId = await resolveFolderId(
    body.folderId,
    access.session.user.id,
    access.companyId,
  )

  const note = await noteModel.create({
    companyId: access.companyId,
    authorUserId: access.session.user.id,
    title: deriveNoteTitle(text),
    text,
    bodyHtml,
    mentions,
    visibility,
    color,
    folderId,
  })

  audit({
    request,
    userId: access.session.user.id,
    companyId: access.companyId,
    action: "note.create",
    resource: "note",
    resourceId: note.id,
  })

  return jsonSuccess({ note })
}

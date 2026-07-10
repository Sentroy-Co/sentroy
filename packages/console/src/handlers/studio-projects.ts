import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  studioProjectModel,
  studioProjectDataModel,
} from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import {
  emptyDjTree,
  emptyMusicianTree,
} from "@workspace/db/models/studio-project-data"
import type {
  StudioProjectMode,
  LyricsVersion,
} from "@workspace/db/models/studio-project"
import type { StudioProjectTree } from "@workspace/db/models/studio-project-data"

/**
 * Sentroy Studio — project CRUD handler'ları.
 *
 * Permission: `studio.manage`. Owner/admin default; member granular access
 * için bu permission'ı eklemiş olmalı.
 *
 * Phase 0 scope:
 *   - GET /list       — proje listesi (lastEditedAt desc)
 *   - POST /          — yeni proje create + boş DJ tree
 *   - GET /:id        — metadata + tree (editor load)
 *   - PATCH /:id      — metadata patch (title, bpm vb.)
 *   - PUT /:id/tree   — full project tree replace (auto-save)
 *   - DELETE /:id     — soft delete
 */

export async function listGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const projects = await studioProjectModel.findByCompany(access.companyId)
  return jsonSuccess(projects)
}

export async function createPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  let body: {
    title?: string
    mode?: StudioProjectMode
    description?: string | null
    bpm?: number
    timeSignature?: [number, number]
    sampleRate?: 44100 | 48000 | 96000
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const title = body.title?.trim()
  if (!title || title.length < 1 || title.length > 100) {
    return jsonError("Title required (1-100 chars)")
  }
  const mode = body.mode ?? "dj"
  if (mode !== "dj" && mode !== "musician") {
    return jsonError("Invalid mode")
  }
  const project = await studioProjectModel.create({
    companyId: access.companyId,
    mode,
    title,
    description: body.description ?? null,
    bpm: body.bpm,
    timeSignature: body.timeSignature,
    sampleRate: body.sampleRate,
    createdBy: access.session!.user.id,
  })

  // Mode'a göre boş tree ile project_data initialize
  const initialTree =
    mode === "musician" ? emptyMusicianTree() : emptyDjTree()
  await studioProjectDataModel.upsert(project.id, initialTree)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "studio.project.create",
    resource: "studio-project",
    resourceId: project.id,
    details: { title, mode },
  })

  return jsonSuccess(project, 201)
}

export async function itemGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const project = await studioProjectModel.findById(id)
  if (!project || project.companyId !== access.companyId) {
    return jsonError("Project not found", 404)
  }
  const data = await studioProjectDataModel.findByProject(id)
  return jsonSuccess({ project, data })
}

export async function itemPatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const existing = await studioProjectModel.findById(id)
  if (!existing || existing.companyId !== access.companyId) {
    return jsonError("Project not found", 404)
  }

  let body: {
    title?: string
    description?: string | null
    bpm?: number
    timeSignature?: [number, number]
    sampleRate?: 44100 | 48000 | 96000
    coverMediaId?: string | null
    musicalKey?: string
    musicalScale?: "major" | "minor"
    lyrics?: Array<{
      id: string
      title: string
      content: string
      createdAt?: string | Date
      updatedAt?: string | Date
      timing?: {
        lines: Array<{
          text: string
          sourceLineIdx: number
          startMs: number | null
          endMs: number | null
        }>
        chunkMode: "asWritten" | "perCount"
        chunkSize: number
        style:
          | "classic"
          | "neon"
          | "typewriter"
          | "slide"
          | "vinyl"
          | "modern"
        totalMs: number
        recordedAt?: string | Date
      }
    }>
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = { lastEditedBy: access.session!.user.id }
  if (body.title !== undefined) {
    const t = body.title.trim()
    if (!t || t.length > 100) return jsonError("Invalid title")
    patch.title = t
  }
  if (body.description !== undefined) patch.description = body.description
  if (body.bpm !== undefined) {
    if (body.bpm < 20 || body.bpm > 300) return jsonError("BPM out of range (20-300)")
    patch.bpm = body.bpm
  }
  if (body.timeSignature !== undefined) patch.timeSignature = body.timeSignature
  if (body.sampleRate !== undefined) patch.sampleRate = body.sampleRate
  if (body.coverMediaId !== undefined) patch.coverMediaId = body.coverMediaId
  if (body.musicalKey !== undefined) {
    const allowed = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ]
    if (body.musicalKey && !allowed.includes(body.musicalKey)) {
      return jsonError("Invalid musicalKey")
    }
    patch.musicalKey = body.musicalKey
  }
  if (body.musicalScale !== undefined) {
    if (body.musicalScale !== "major" && body.musicalScale !== "minor") {
      return jsonError("Invalid musicalScale")
    }
    patch.musicalScale = body.musicalScale
  }
  if (body.lyrics !== undefined) {
    if (!Array.isArray(body.lyrics)) {
      return jsonError("lyrics must be an array")
    }
    if (body.lyrics.length > 32) {
      return jsonError("Too many lyrics versions (max 32)")
    }
    const now = new Date()
    patch.lyrics = body.lyrics.map((v) => {
      const title = (v.title ?? "").trim().slice(0, 120) || "Untitled"
      const content = (v.content ?? "").slice(0, 50_000)
      // Karaoke timing — opsiyonel, max 5000 word (büyük lyrics için yeterli),
      // her word startMs null veya ms cinsinden (negatif veya NaN reject).
      let timing: LyricsVersion["timing"] | undefined
      if (v.timing && Array.isArray(v.timing.lines)) {
        const lines = v.timing.lines.slice(0, 2000).map((l) => ({
          text: String(l.text ?? "").slice(0, 500),
          sourceLineIdx: Math.max(0, Math.floor(l.sourceLineIdx ?? 0)),
          startMs:
            typeof l.startMs === "number" && Number.isFinite(l.startMs) && l.startMs >= 0
              ? Math.floor(l.startMs)
              : null,
          endMs:
            typeof l.endMs === "number" && Number.isFinite(l.endMs) && l.endMs >= 0
              ? Math.floor(l.endMs)
              : null,
        }))
        const totalMs =
          typeof v.timing.totalMs === "number" && Number.isFinite(v.timing.totalMs)
            ? Math.max(0, Math.floor(v.timing.totalMs))
            : 0
        const chunkMode =
          v.timing.chunkMode === "perCount" ? "perCount" : "asWritten"
        const chunkSize = Math.max(
          1,
          Math.min(10, Math.floor(v.timing.chunkSize ?? 4)),
        )
        const allowedStyles = [
          "classic",
          "neon",
          "typewriter",
          "slide",
          "vinyl",
          "modern",
        ] as const
        const style = allowedStyles.includes(
          v.timing.style as (typeof allowedStyles)[number],
        )
          ? (v.timing.style as (typeof allowedStyles)[number])
          : "classic"
        timing = {
          lines,
          chunkMode,
          chunkSize,
          style,
          totalMs,
          recordedAt: v.timing.recordedAt ? new Date(v.timing.recordedAt) : now,
        }
      }
      return {
        id: v.id || `lyr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        content,
        ...(timing ? { timing } : {}),
        createdAt: v.createdAt ? new Date(v.createdAt) : now,
        updatedAt: now,
      }
    })
  }

  const updated = await studioProjectModel.update(
    id,
    patch as Parameters<typeof studioProjectModel.update>[1],
  )
  if (!updated) return jsonError("Update failed", 500)

  return jsonSuccess(updated)
}

/**
 * Full tree replace — auto-save'in çağırdığı endpoint. Optimistic
 * concurrency: client `revision` gönderir; mismatch'te 409 conflict.
 */
export async function treePut(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const existing = await studioProjectModel.findById(id)
  if (!existing || existing.companyId !== access.companyId) {
    return jsonError("Project not found", 404)
  }

  let body: { tree?: StudioProjectTree; expectedRevision?: number }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.tree || !body.tree.mode) {
    return jsonError("tree.mode required")
  }
  if (body.tree.mode !== existing.mode) {
    return jsonError(
      `tree.mode (${body.tree.mode}) does not match project mode (${existing.mode})`,
    )
  }

  const result = await studioProjectDataModel.upsert(
    id,
    body.tree,
    body.expectedRevision,
  )
  if (!result.ok) {
    return jsonError(
      `Revision conflict — expected ${body.expectedRevision}, server at ${result.conflict}`,
      409,
    )
  }

  await studioProjectModel.touch(id, access.session!.user.id)

  return jsonSuccess({
    revision: result.data.revision,
    updatedAt: result.data.updatedAt,
  })
}

export async function itemDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const existing = await studioProjectModel.findById(id)
  if (!existing || existing.companyId !== access.companyId) {
    return jsonError("Project not found", 404)
  }

  await studioProjectModel.softDelete(id)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "studio.project.delete",
    resource: "studio-project",
    resourceId: id,
    details: { title: existing.title },
  })

  return jsonSuccess({ ok: true })
}

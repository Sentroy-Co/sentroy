import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { studioFxPresetModel } from "@workspace/db/models"
import type { StudioFxEffectType } from "@workspace/db/models/studio-fx-preset"

/**
 * Sentroy Studio — FX preset CRUD.
 *
 * Permission: `studio.manage`. List query optional `?effectType=eq3`
 * filtresi. List sonucu: kullanıcının kendi presetleri + şirket-shared.
 * Patch/Delete sadece sahibinde (createdBy === session.user.id).
 */

const ALLOWED_EFFECT_TYPES: readonly StudioFxEffectType[] = [
  "echo",
  "reverb",
  "phaser",
  "bitcrusher",
  "filterSweep",
  "eq3",
  "compressor",
  "distortion",
  "chorus",
  "tremolo",
  "autoWah",
  "stereoWidener",
  "multibandCompressor",
  "limiter",
  "pitchShift",
  "djFilter",
  "autoPanner",
  "frequencyShifter",
  "vibrato",
  "highpassFilter",
  "lowpassFilter",
  "bandpassFilter",
  "feedbackDelay",
  "pumpingComp",
  "hallReverb",
  "stutterGate",
  "autoTune",
  "shimmerReverb",
  "harmonizer",
  "sidechainComp",
]

function isEffectType(v: unknown): v is StudioFxEffectType {
  return typeof v === "string" && (ALLOWED_EFFECT_TYPES as readonly string[]).includes(v)
}

export async function listGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const url = new URL(request.url)
  const effectTypeRaw = url.searchParams.get("effectType")
  const filter: { effectType?: StudioFxEffectType } = {}
  if (effectTypeRaw) {
    if (!isEffectType(effectTypeRaw)) {
      return jsonError(`Invalid effectType: ${effectTypeRaw}`)
    }
    filter.effectType = effectTypeRaw
  }
  const presets = await studioFxPresetModel.findByCompanyAndUser(
    access.companyId,
    access.session!.user.id,
    filter,
  )
  return jsonSuccess(presets)
}

export async function createPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  let body: {
    name?: string
    effectType?: string
    wet?: number
    params?: Record<string, unknown>
    isShared?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const name = body.name?.trim()
  if (!name || name.length < 1 || name.length > 80) {
    return jsonError("Name required (1-80 chars)")
  }
  if (!isEffectType(body.effectType)) {
    return jsonError("Invalid effectType")
  }
  const wet = typeof body.wet === "number" ? body.wet : 0.3
  if (wet < 0 || wet > 1) {
    return jsonError("wet must be 0..1")
  }
  if (!body.params || typeof body.params !== "object") {
    return jsonError("params object required")
  }

  const preset = await studioFxPresetModel.create({
    companyId: access.companyId,
    userId: access.session!.user.id,
    name,
    effectType: body.effectType,
    wet,
    params: body.params,
    isShared: body.isShared === true,
  })
  return jsonSuccess(preset, 201)
}

export async function itemPatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const existing = await studioFxPresetModel.findById(id)
  if (!existing || existing.companyId !== access.companyId) {
    return jsonError("Preset not found", 404)
  }
  if (existing.userId !== access.session!.user.id) {
    return jsonError("Only the owner can edit this preset", 403)
  }

  let body: {
    name?: string
    wet?: number
    params?: Record<string, unknown>
    isShared?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Parameters<typeof studioFxPresetModel.update>[1] = {}
  if (body.name !== undefined) {
    const n = body.name.trim()
    if (!n || n.length > 80) return jsonError("Invalid name")
    patch.name = n
  }
  if (body.wet !== undefined) {
    if (typeof body.wet !== "number" || body.wet < 0 || body.wet > 1) {
      return jsonError("wet must be 0..1")
    }
    patch.wet = body.wet
  }
  if (body.params !== undefined) {
    if (!body.params || typeof body.params !== "object") {
      return jsonError("params must be object")
    }
    patch.params = body.params
  }
  if (body.isShared !== undefined) {
    patch.isShared = body.isShared === true
  }

  const updated = await studioFxPresetModel.update(id, patch)
  if (!updated) return jsonError("Update failed", 500)
  return jsonSuccess(updated)
}

export async function itemDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "studio.manage")
  if ("error" in access) return access.error

  const existing = await studioFxPresetModel.findById(id)
  if (!existing || existing.companyId !== access.companyId) {
    return jsonError("Preset not found", 404)
  }
  if (existing.userId !== access.session!.user.id) {
    return jsonError("Only the owner can delete this preset", 403)
  }
  await studioFxPresetModel.remove(id)
  return jsonSuccess({ ok: true })
}

export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { osPreferencesModel } from "@workspace/db/models"
import type { OsDesktopWidgetInstance } from "@workspace/db/types"

/**
 * Sentroy OS masaüstü tercihleri — PER-USER, PER-COMPANY. Session-only
 * (assertCompanyAccess, permission YOK): her aktif üye YALNIZ kendi tercih
 * dokümanını okur/yazar (caller = session user). Cihazlar-arası senkron:
 * OS mount'ta GET → store'lara hydrate; store mutasyonları debounced PUT.
 */

/** GET — caller'ın bu şirketteki OS tercih dokümanı (yoksa boş {}). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const prefs = await osPreferencesModel.getForUser(
    access.companyId,
    access.session.user.id,
  )
  return jsonSuccess(prefs ?? {})
}

/** String dizisi (yalnız string eleman) doğrula. */
function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter((x): x is string => typeof x === "string")
}

/**
 * Widget dizisini shape'e göre süz — id/type string, x/y sonlu sayı, config
 * opsiyonel düz obje. Geçersiz örnekler ATILIR (registry union kontrolü
 * istemcide widgetDef ile yapılır; sunucu yalnız yapısal doğrular).
 */
function asWidgets(v: unknown): OsDesktopWidgetInstance[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: OsDesktopWidgetInstance[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue
    const w = raw as Record<string, unknown>
    if (typeof w.id !== "string" || typeof w.type !== "string") continue
    if (typeof w.x !== "number" || !Number.isFinite(w.x)) continue
    if (typeof w.y !== "number" || !Number.isFinite(w.y)) continue
    const inst: OsDesktopWidgetInstance = { id: w.id, type: w.type, x: w.x, y: w.y }
    if (w.config && typeof w.config === "object" && !Array.isArray(w.config)) {
      inst.config = w.config as Record<string, unknown>
    }
    out.push(inst)
  }
  return out
}

/**
 * PUT — partial patch. Yalnız gönderilen (ve tip doğrulamasından geçen) alanlar
 * $set edilir. Geçersiz tipler sessizce yok sayılır; hiç geçerli alan yoksa
 * mevcut doküman döner (no-op yerine güncel durum).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return jsonError("Invalid JSON body", 400)
  }
  if (!body || typeof body !== "object") return jsonError("Invalid body", 400)

  const patch: Parameters<typeof osPreferencesModel.upsertForUser>[2] = {}
  if (typeof body.wallpaper === "string") patch.wallpaper = body.wallpaper
  const dockOrder = asStringArray(body.dockOrder)
  if (dockOrder !== undefined) patch.dockOrder = dockOrder
  const dockPinned = asStringArray(body.dockPinned)
  if (dockPinned !== undefined) patch.dockPinned = dockPinned
  const dockHidden = asStringArray(body.dockHidden)
  if (dockHidden !== undefined) patch.dockHidden = dockHidden
  const widgets = asWidgets(body.widgets)
  if (widgets !== undefined) patch.widgets = widgets

  if (Object.keys(patch).length === 0) {
    const current = await osPreferencesModel.getForUser(
      access.companyId,
      access.session.user.id,
    )
    return jsonSuccess(current ?? {})
  }

  const saved = await osPreferencesModel.upsertForUser(
    access.companyId,
    access.session.user.id,
    patch,
  )
  return jsonSuccess(saved ?? {})
}

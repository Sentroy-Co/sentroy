import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingSettingsModel } from "@workspace/db/models"
import { normalizeLandingSectionOrder } from "@/lib/landing-sections"

export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const settings = await landingSettingsModel.get()
  return jsonSuccess({
    ...settings,
    sectionOrder: normalizeLandingSectionOrder(settings.sectionOrder),
  })
}

export async function PATCH(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  let body: {
    trustMessage?: Record<string, string>
    pricingTitle?: Record<string, string>
    pricingSubtitle?: Record<string, string>
    showPricing?: boolean
    showTestimonials?: boolean
    showLogos?: boolean
    showZSections?: boolean
    showApps?: boolean
    showMetrics?: boolean
    sectionOrder?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: Record<string, unknown> = {}
  if (body.trustMessage && typeof body.trustMessage === "object")
    patch.trustMessage = body.trustMessage
  if (body.pricingTitle && typeof body.pricingTitle === "object")
    patch.pricingTitle = body.pricingTitle
  if (body.pricingSubtitle && typeof body.pricingSubtitle === "object")
    patch.pricingSubtitle = body.pricingSubtitle
  if (typeof body.showPricing === "boolean")
    patch.showPricing = body.showPricing
  if (typeof body.showTestimonials === "boolean")
    patch.showTestimonials = body.showTestimonials
  if (typeof body.showLogos === "boolean") patch.showLogos = body.showLogos
  if (typeof body.showZSections === "boolean")
    patch.showZSections = body.showZSections
  if (typeof body.showApps === "boolean") patch.showApps = body.showApps
  if (typeof body.showMetrics === "boolean")
    patch.showMetrics = body.showMetrics
  if (Array.isArray(body.sectionOrder))
    patch.sectionOrder = normalizeLandingSectionOrder(body.sectionOrder)

  if (Object.keys(patch).length === 0) return jsonError("Nothing to update")

  const settings = await landingSettingsModel.update(patch)
  return jsonSuccess({
    ...settings,
    sectionOrder: normalizeLandingSectionOrder(settings.sectionOrder),
  })
}

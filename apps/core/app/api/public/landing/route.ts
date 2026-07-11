export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  landingLogoModel,
  landingTestimonialModel,
  landingSettingsModel,
  landingZSectionModel,
  landingAppModel,
  planModel,
} from "@workspace/db/models"
import { normalizeLandingSectionOrder } from "@/lib/landing-sections"

/**
 * GET /api/public/landing
 * Public endpoint — landing sayfasi icin gerekli tum dinamik veriyi tek
 * round-trip'te doner. Auth gerektirmez.
 */
export async function GET(_request: NextRequest) {
  // Lazy seed — apps collection ilk public landing render'ında boşsa default
  // mail+storage record'larını yaratır. Idempotent (count > 0 ise no-op),
  // dolayısıyla deploy'a özel migration script gerekmez.
  await landingAppModel.seedDefaults().catch(() => {})

  const [logos, testimonials, settings, zsections, apps, plans] =
    await Promise.all([
      landingLogoModel.list().catch(() => []),
      landingTestimonialModel.list().catch(() => []),
      landingSettingsModel
        .get()
        .catch(() => landingSettingsModel.DEFAULT_SETTINGS),
      landingZSectionModel.list().catch(() => []),
      landingAppModel.list({ onlyEnabled: true }).catch(() => []),
      planModel.findActive().catch(() => []),
    ])

  // Plans fiyata gore sirala
  plans.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))

  return jsonSuccess({
    logos,
    testimonials,
    settings: {
      ...settings,
      sectionOrder: normalizeLandingSectionOrder(settings.sectionOrder),
    },
    zsections,
    apps,
    plans,
  })
}

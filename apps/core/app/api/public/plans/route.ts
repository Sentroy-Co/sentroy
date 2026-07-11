export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { planModel, polarSettingsModel } from "@workspace/db/models"

/**
 * GET /api/public/plans
 * Pricing/landing için aktif planları public döner. Polar product ID'leri
 * response'tan çıkarılır; yerine aktif ortamda satın alınabilirlik için
 * `checkoutAvailable` booleanı eklenir.
 */
export async function GET(_request: NextRequest) {
  try {
    const [plans, polar] = await Promise.all([
      planModel.findActive(),
      polarSettingsModel.get(),
    ])
    plans.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    const mode = polar.activeMode
    const data = plans.map((p) => {
      const map = p.polar?.[mode]
      const checkoutAvailable =
        polar.enabled && !!(map?.monthlyProductId || map?.yearlyProductId)
      const { polar: _omitPolar, ...rest } = p
      return { ...rest, checkoutAvailable }
    })
    return jsonSuccess(data)
  } catch {
    return jsonSuccess([])
  }
}

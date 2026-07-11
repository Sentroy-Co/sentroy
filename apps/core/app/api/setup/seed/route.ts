export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { runSeed } from "@/lib/seed-runner"
import { assertSetupAllowed } from "@/lib/setup-guard"

/**
 * POST /api/setup/seed — first-run seed (no auth).
 *
 * Guard: `assertSetupAllowed` — rate-limit + opsiyonel SETUP_TOKEN + DB
 * initialized=false. Bu endpoint yalnızca DB hiç kurulmamışken erişilebilir;
 * setup wizard'dan tetiklenir. Admin-takeover yarışı için bkz. setup-guard.ts.
 *
 * Body: { adminEmail?: string, adminPassword?: string }
 *   - Verilmezse env (ADMIN_EMAIL/ADMIN_PASSWORD) kullanılır.
 *   - Compose default'ları varsa env yeterli; admin UI'dan girerse override.
 */
export async function POST(request: NextRequest) {
  const blocked = await assertSetupAllowed(request)
  if (blocked) return blocked

  let body: { adminEmail?: string; adminPassword?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body OK — env'den okur
  }
  const adminEmail = (body.adminEmail ?? process.env.ADMIN_EMAIL ?? "").trim()
  const adminPassword =
    (body.adminPassword ?? process.env.ADMIN_PASSWORD ?? "").trim()
  // admin@sentroy.com sessiz fallback'i KALDIRILDI — stranger operatör kendi
  // admin e-postasını vermeli (güvensiz default yok).
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return jsonError(
      "adminEmail is required and must be a valid email (provide in body or set ADMIN_EMAIL env)",
      400,
    )
  }
  if (!adminPassword) {
    return jsonError(
      "adminPassword is required (provide in body or set ADMIN_PASSWORD env)",
      400,
    )
  }

  const result = await runSeed({ adminEmail, adminPassword })
  if (!result.ok) {
    return jsonError(result.error ?? "Seed failed", 500)
  }
  return jsonSuccess({
    steps: result.steps,
    adminEmail,
  })
}

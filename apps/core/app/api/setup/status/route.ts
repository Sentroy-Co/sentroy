import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { isDbInitialized } from "@/lib/seed-runner"

/**
 * GET /api/setup/status — first-run wizard'ın "show or skip" kararı için.
 *
 * NO AUTH — DB henüz boşsa kullanıcı login dahi olamaz; bu endpoint
 * setup wizard'a redirect kararını veren tek noktadır. initialized=true
 * ise kullanıcı normal /login'e gönderilir.
 */
export async function GET() {
  try {
    const status = await isDbInitialized()
    return jsonSuccess(status)
  } catch (err) {
    console.error("[setup/status] failed:", err)
    return jsonError(
      err instanceof Error ? err.message : "Status check failed",
      500,
    )
  }
}

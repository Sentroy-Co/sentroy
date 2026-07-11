export const dynamic = "force-dynamic"

// Liveness endpoint — process ayakta mı + hangi versiyon. Core'un admin
// system-status dashboard'u bu endpoint'i compose network içinden probe eder.
export async function GET() {
  return Response.json({
    ok: true,
    service: "storage",
    version: process.env.APP_VERSION ?? null,
    timestamp: Date.now(),
  })
}

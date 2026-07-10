// Liveness endpoint — process ayakta mı + hangi versiyon. Auth'suz, hızlı,
// MongoDB veya başka external dependency'ye dokunmaz. Admin system-status
// dashboard'u bu endpoint'i probe eder.
export async function GET() {
  return Response.json({
    ok: true,
    service: "core",
    version: process.env.APP_VERSION ?? null,
    timestamp: Date.now(),
  })
}

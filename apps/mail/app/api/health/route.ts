// Liveness endpoint — process ayakta mı + hangi versiyon. Core'un admin
// system-status dashboard'u bu endpoint'i compose network içinden probe eder.
export async function GET() {
  return Response.json({
    ok: true,
    service: "mail",
    version: process.env.APP_VERSION ?? null,
    timestamp: Date.now(),
  })
}

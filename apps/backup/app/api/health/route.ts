// Liveness endpoint — process ayakta mı + hangi versiyon.
export async function GET() {
  return Response.json({
    ok: true,
    service: "backup",
    version: process.env.APP_VERSION ?? null,
    timestamp: Date.now(),
  })
}

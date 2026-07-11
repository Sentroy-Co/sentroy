export const dynamic = "force-dynamic"

// Liveness endpoint — process ayakta mı + hangi versiyon.
export async function GET() {
  return Response.json({
    ok: true,
    service: "linear",
    version: process.env.APP_VERSION ?? null,
    timestamp: Date.now(),
  })
}

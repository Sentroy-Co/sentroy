// Liveness endpoint — process ayakta mı + hangi versiyon.
export async function GET() {
  return Response.json({
    ok: true,
    service: "whatsapp",
    version: process.env.APP_VERSION ?? null,
    timestamp: Date.now(),
  })
}

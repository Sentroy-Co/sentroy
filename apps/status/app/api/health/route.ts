export const dynamic = "force-dynamic"

// Liveness endpoint — process ayakta mı + hangi versiyon. Worker
// kendi service'ini bu endpoint üzerinden probe ediyor (status board
// bootstrap'i bu URL'i status_check olarak kayıtlı).
export async function GET() {
  return Response.json({
    ok: true,
    service: "status",
    version: process.env.APP_VERSION ?? null,
    timestamp: Date.now(),
  })
}

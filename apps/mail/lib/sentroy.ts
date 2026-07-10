import { SentroyClient } from "@sentroy-co/sdk"

// SDK otomatik olarak /api/v1 ekliyor, bu yuzden sadece base domain verilmeli.
// Server-side SDK: mevcutsa internal Docker URL'ini (SENTROY_MAIL_API_URL)
// tercih et — mail→mail-server trafigi public api.sentroy.com TLS/traefik'e
// bagimli olmadan internal agdan gider. Yoksa public URL'e fallback.
const rawUrl =
  process.env.SENTROY_MAIL_API_URL ||
  process.env.NEXT_PUBLIC_SENTROY_API_URL ||
  "http://localhost:3000/api/v1"
const baseUrl = rawUrl.replace(/\/api\/v1\/?$/, "")

export function createSentroyClient(apiKey: string) {
  return new SentroyClient({
    baseUrl,
    apiKey,
  })
}

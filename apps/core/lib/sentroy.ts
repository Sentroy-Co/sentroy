import { SentroyClient } from "@sentroy-co/sdk"

const rawUrl =
  process.env.NEXT_PUBLIC_SENTROY_API_URL || "http://localhost:3000/api/v1"
const baseUrl = rawUrl.replace(/\/api\/v1\/?$/, "")

export function createSentroyClient(apiKey: string) {
  return new SentroyClient({
    baseUrl,
    apiKey,
  })
}

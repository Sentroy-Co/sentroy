import { internalAuthHeaders } from "@workspace/console/lib/internal-auth"

/**
 * WhatsApp Gateway (Baileys servisi) ile server-to-server iletişim helper'ı.
 * Tarayıcı asla gateway'e doğrudan bağlanmaz; tüm çağrılar bu app'in
 * route handler'larından `x-internal-secret` ile yapılır.
 */
const GATEWAY_URL = (
  process.env.WHATSAPP_GATEWAY_URL || "http://localhost:4200"
).replace(/\/+$/, "")

export function gatewayUrl(path: string): string {
  return `${GATEWAY_URL}${path}`
}

export function gatewayHeaders(): Record<string, string> {
  return internalAuthHeaders()
}

export function gatewayJsonHeaders(): Record<string, string> {
  return { ...internalAuthHeaders(), "Content-Type": "application/json" }
}

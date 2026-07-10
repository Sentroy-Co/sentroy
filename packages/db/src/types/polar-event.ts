/**
 * Gelen Polar webhook olayının kalıcı kaydı. İki amaç:
 *  1. Idempotency — Polar at-least-once teslim eder; `polarEventId`
 *     (Standard Webhooks `webhook-id` header) unique, tekrar gelen
 *     teslimler atlanır.
 *  2. Audit / replay — ham payload + işlenme durumu saklanır.
 */
export interface PolarEvent {
  id: string
  /** Standard Webhooks `webhook-id` — idempotency anahtarı (unique). */
  polarEventId: string
  type: string
  environment: "sandbox" | "production"
  /** Eşleşen Sentroy company (varsa). */
  companyId: string | null
  payload: unknown
  /** İşlendiği an; null ise henüz işlenmedi / hata aldı. */
  processedAt: Date | null
  error: string | null
  createdAt: Date
}

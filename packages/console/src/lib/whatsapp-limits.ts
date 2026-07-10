import { WHATSAPP_LIMIT_DEFAULTS } from "@workspace/db/types"

/**
 * WhatsApp Santral plan-limit okuyucuları. Limitler company kaydında
 * (plandan denormalize) tutulur; eski kayıtlarda tanımsızsa
 * `WHATSAPP_LIMIT_DEFAULTS` kullanılır. `-1` = sınırsız.
 *
 * `company` gevşek tiptir (resolveCompanyAccess ham Mongo doc döner), bu yüzden
 * alanları defensive okuruz. Bkz. [[whatsapp-send]], [[whatsapp-template]].
 */

type LooseCompany = Record<string, unknown>

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback
}

export function whatsappNumberLimit(company: LooseCompany): number {
  return num(company.maxWhatsappNumbers, WHATSAPP_LIMIT_DEFAULTS.maxNumbers)
}

export function whatsappTemplateLimit(company: LooseCompany): number {
  return num(company.maxWhatsappTemplates, WHATSAPP_LIMIT_DEFAULTS.maxTemplates)
}

export function whatsappMonthlyLimit(company: LooseCompany): number {
  return num(company.monthlyWhatsappLimit, WHATSAPP_LIMIT_DEFAULTS.monthlySends)
}

/** Limit aşıldı mı? `-1` (sınırsız) her zaman false döner. */
export function isOverLimit(current: number, limit: number): boolean {
  if (limit < 0) return false
  return current >= limit
}

/** Ayın başlangıcı (UTC) — aylık gönderim sayımı penceresi. */
export function startOfMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

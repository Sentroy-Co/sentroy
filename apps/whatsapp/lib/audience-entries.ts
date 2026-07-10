import type { WhatsappAudienceEntry } from "@workspace/db/models/whatsapp-audience"

/**
 * Audience girdi listesini normalize et — `["+90…"]` (düz telefon) veya
 * `[{phone, variables}]` (per-alıcı değişkenli) kabul eder. Route handler'ları
 * (audiences POST/PATCH) buradan kullanır; route.ts'ten helper export etmek
 * Next.js'te hata verdiği için ayrı lib.
 */
export function parseEntries(raw: unknown): WhatsappAudienceEntry[] {
  if (!Array.isArray(raw)) return []
  const out: WhatsappAudienceEntry[] = []
  for (const e of raw) {
    if (typeof e === "string" && e.trim()) {
      out.push({ phone: e.trim() })
    } else if (e && typeof e === "object") {
      const rec = e as { phone?: unknown; variables?: unknown }
      const phone = typeof rec.phone === "string" ? rec.phone.trim() : ""
      if (!phone) continue
      const vars =
        rec.variables && typeof rec.variables === "object"
          ? (rec.variables as Record<string, string>)
          : undefined
      out.push(vars ? { phone, variables: vars } : { phone })
    }
  }
  return out
}

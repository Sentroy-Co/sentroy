/** İletişim formu — paylaşılan kategori seti + e-posta için güvenli HTML. */

export const CONTACT_CATEGORIES = [
  "general",
  "support",
  "billing",
  "partnership",
  "feedback",
  "other",
] as const

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number]

export function isContactCategory(v: unknown): v is ContactCategory {
  return typeof v === "string" && (CONTACT_CATEGORIES as readonly string[]).includes(v)
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Kullanıcı metnini e-posta gövdesine güvenle göm: escape + satır sonu → <br>. */
export function htmlifyMultiline(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br>")
}

/**
 * Defensive MIME type normalization.
 *
 * Some IMAP body-structure parsers leak slash-joined subtypes ("png/octet-stream")
 * into the contentType field. The HTTP spec only allows one slash, so browsers
 * that see `image/png/octet-stream` either fall back to a generic handler or
 * fail to render the attachment at all. We strip everything past the second
 * slash so the value stays a valid MIME, even if the upstream message was
 * fetched before the mail-server fix went out.
 */
export function normalizeMime(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "application/octet-stream"
  const trimmed = input.trim()
  if (!trimmed) return "application/octet-stream"
  // Cut at parameter boundary first so `image/png; charset=binary` survives
  // intact apart from the malformed-subtype repair.
  const [media, ...paramsParts] = trimmed.split(";")
  const params = paramsParts.length ? `;${paramsParts.join(";")}` : ""
  const parts = media.split("/").map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return "application/octet-stream"
  // Type + first subtype segment. `image/png/octet-stream` → `image/png`.
  return `${parts[0]}/${parts[1]}${params}`
}

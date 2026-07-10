/**
 * Pure placeholder helpers — usable from both server (shiki pre-process)
 * and client (post-render substitution). No zustand, no client hooks;
 * importing this from a server module is safe.
 */

export const TOKEN_PLACEHOLDER = "stk_..."
export const SLUG_PLACEHOLDER = "my-company"
export const TOKEN_MARKER = "___SENTROY_DOC_TOKEN___"
export const SLUG_MARKER = "___SENTROY_DOC_SLUG___"

export function injectPlaceholderMarkers(code: string): string {
  return code
    .replace(/stk_[A-Za-z0-9_.]+/g, TOKEN_MARKER)
    .replace(/my-company/g, SLUG_MARKER)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function applyPlaceholders(
  source: string,
  token: string,
  slug: string,
): string {
  const t = (token || TOKEN_PLACEHOLDER).trim()
  const s = (slug || SLUG_PLACEHOLDER).trim()
  return source
    .replace(new RegExp(TOKEN_MARKER, "g"), escapeHtml(t))
    .replace(new RegExp(SLUG_MARKER, "g"), escapeHtml(s))
}

export function applyPlaceholdersRaw(
  source: string,
  token: string,
  slug: string,
): string {
  const t = (token || TOKEN_PLACEHOLDER).trim()
  const s = (slug || SLUG_PLACEHOLDER).trim()
  return source
    .replace(new RegExp(TOKEN_MARKER, "g"), t)
    .replace(new RegExp(SLUG_MARKER, "g"), s)
}

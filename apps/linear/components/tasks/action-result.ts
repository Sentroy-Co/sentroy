/**
 * Fetcher sonucu normalizasyonu.
 *
 * Triage action'ları düz `{ ok: true, ... } | { ok: false, error }` döndürür;
 * Sentroy API route'ları ise `jsonSuccess/jsonError` zarfı kullanır:
 * `{ data: {...} }` / `{ data: null, error: "msg" }`.
 *
 * Port edilen bileşenler her iki şekli de tolere etsin diye fetcher.data
 * bu helper'dan geçirilir — zarf varsa açılır ve triage şekline çevrilir,
 * yoksa olduğu gibi döner.
 */

export type ActionResult =
  | { ok: true; issueId: string; identifier?: string }
  | { ok: false; error: string }

export type FetcherResult = { ok?: boolean; error?: string }

export function normalizeActionResult<T extends { ok?: boolean }>(
  raw: unknown,
): T | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>

  // jsonSuccess/jsonError zarfı: {data, error?} — "ok" alanı yoksa aç.
  if ("data" in obj && !("ok" in obj)) {
    if (typeof obj.error === "string") {
      return { ok: false, error: obj.error } as unknown as T
    }
    const data = obj.data
    if (data && typeof data === "object") {
      return { ok: true, ...(data as Record<string, unknown>) } as unknown as T
    }
    return { ok: true } as unknown as T
  }

  return obj as T
}

/**
 * Process-level pub/sub for Linear-driven sync events
 * (triage event-bus.server.ts portu, **companyId-keyed** — PLAN §4).
 *
 * Webhook handler (`app/api/linear-webhook/[companyId]`) `publish()`ler;
 * SSE handler (`sync/stream`) `subscribe()` olur. globalThis'te saklanır ki
 * dev HMR listener'ları öksüz bırakmasın. Tenant izolasyonu: bir şirketin
 * event'i yalnız o şirketin aboneklerine gider.
 */

export type SyncEvent = {
  /** Linear payload "type" (Issue, Comment, IssueLabel, …) */
  type: string
  /** "create" | "update" | "remove" | "archived" — Linear "action" */
  action: string
  /** Most events carry an issue id (directly or on the parent). */
  issueId?: string | null
  /** For comment/attachment events. */
  resourceId?: string | null
  /**
   * Issue payload'ı varsa state.type — completed/canceled vs.
   * Client-side notification (success bell, toast) için kullanılır.
   */
  stateType?: string | null
  /** Issue identifier (TRG-123) varsa. */
  issueIdentifier?: string | null
  /** Issue title varsa. */
  issueTitle?: string | null
  /** Olayı tetikleyen kullanıcı adı (mevcutsa). */
  actorName?: string | null
  /**
   * Issue assignee'sinin Linear user id'si (Issue event'lerinde). Client'ta
   * "bu olay beni ilgilendiriyor mu" filtresi için (masaüstü bildirimi).
   */
  assigneeId?: string | null
  /** Issue/Attachment creator'ının Linear user id'si. */
  creatorId?: string | null
  /** Comment yazarının Linear user id'si (Comment event'lerinde). */
  commentUserId?: string | null
  /** ms epoch */
  at: number
}

type Listener = (event: SyncEvent) => void

declare global {
  // eslint-disable-next-line no-var
  var __linearLiteSyncBus__: Map<string, Set<Listener>> | undefined
}

const bus =
  globalThis.__linearLiteSyncBus__ ??
  (globalThis.__linearLiteSyncBus__ = new Map<string, Set<Listener>>())

export function subscribe(companyId: string, fn: Listener): () => void {
  let listeners = bus.get(companyId)
  if (!listeners) {
    listeners = new Set<Listener>()
    bus.set(companyId, listeners)
  }
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) bus.delete(companyId)
  }
}

export function publish(companyId: string, event: SyncEvent): void {
  const listeners = bus.get(companyId)
  if (!listeners) return
  for (const fn of listeners) {
    try {
      fn(event)
    } catch {
      // Listener errors must not block other consumers.
    }
  }
}

export function listenerCount(companyId: string): number {
  return bus.get(companyId)?.size ?? 0
}

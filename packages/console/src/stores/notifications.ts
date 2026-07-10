import { create } from "zustand"

/**
 * In-app notification item — gerçek zamanlı SSE event'inden veya
 * sistem tarafından üretilen kalıcı bildirimlerden gelebilir.
 *
 * Persisted item'lar `persisted: true` flag'i taşır → markRead/remove
 * server'a da yansır. Live (SSE) item'lar yalnızca client-state.
 */
export type NotificationKind =
  | "mail-delivered"
  | "company-invitation"
  | "company-member-joined"
  | "company-member-removed"
  | "linear"
  | "system"

export interface AppNotification {
  id: string
  type: NotificationKind
  title: string
  description?: string
  /** Tıklanınca navigate edilecek yol (locale prefix dahil edilebilir). */
  href?: string
  /** Orijinal payload — type'a göre interpret edilir. */
  payload?: Record<string, unknown>
  createdAt: string
  read: boolean
  /** Server'da kalıcı kayıt mı yoksa sadece runtime live event mi. */
  persisted?: boolean
}

interface NotificationState {
  items: AppNotification[]
  sheetOpen: boolean
  /**
   * Inbox'taki okunmamış mail sayısı — sidebar Inbox badge'i ve storage
   * header inbox button counter'ı buradan okur. NotificationsProvider
   * mount'ta `/inbox/unread-count` ile ilk değeri çeker, SSE event'lerinde
   * artırır, periyodik refetch ile drift düzeltir.
   */
  inboxUnreadCount: number
  /** Son 200 bildirim tutulur, eskisi atılır */
  add: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
  clear: () => void
  setSheetOpen: (open: boolean) => void
  setInboxUnreadCount: (count: number) => void
  incrementInboxUnread: (by?: number) => void
  /** Mount'ta server-persisted bildirimleri çek + store'a merge et. */
  hydrateFromServer: () => Promise<void>
  hydrated: boolean
}

const MAX_ITEMS = 200

export const useNotificationsStore = create<NotificationState>((set, get) => ({
  items: [],
  sheetOpen: false,
  inboxUnreadCount: 0,
  hydrated: false,

  setInboxUnreadCount: (count) =>
    set({ inboxUnreadCount: Math.max(0, count) }),

  incrementInboxUnread: (by = 1) =>
    set((state) => ({
      inboxUnreadCount: Math.max(0, state.inboxUnreadCount + by),
    })),

  add: (n) =>
    set((state) => {
      const item: AppNotification = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        createdAt: new Date().toISOString(),
        read: false,
        ...n,
      }
      return { items: [item, ...state.items].slice(0, MAX_ITEMS) }
    }),

  markRead: (id) => {
    const item = get().items.find((i) => i.id === id)
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, read: true } : i,
      ),
    }))
    if (item?.persisted) {
      fetch(`/api/user/notifications/${id}/read`, {
        method: "POST",
      }).catch(() => {})
    }
  },

  markAllRead: () => {
    const hadPersisted = get().items.some((i) => i.persisted && !i.read)
    set((state) => ({
      items: state.items.map((i) => ({ ...i, read: true })),
    }))
    if (hadPersisted) {
      fetch("/api/user/notifications/read-all", {
        method: "POST",
      }).catch(() => {})
    }
  },

  remove: (id) => {
    const item = get().items.find((i) => i.id === id)
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }))
    if (item?.persisted) {
      fetch(`/api/user/notifications/${id}`, {
        method: "DELETE",
      }).catch(() => {})
    }
  },

  clear: () => set({ items: [] }),

  setSheetOpen: (open) => set({ sheetOpen: open }),

  hydrateFromServer: async () => {
    if (get().hydrated) return
    try {
      const res = await fetch("/api/user/notifications")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      const items = (json.data ?? []) as Array<{
        id: string
        type: NotificationKind
        title: string
        body?: string | null
        href?: string | null
        meta?: Record<string, unknown> | null
        read: boolean
        createdAt: string
      }>
      const mapped: AppNotification[] = items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        description: n.body ?? undefined,
        href: n.href ?? undefined,
        payload: n.meta ?? undefined,
        createdAt: n.createdAt,
        read: n.read,
        persisted: true,
      }))
      // Live items'i koru — persisted'ı önüne ekle (createdAt ile resort).
      set((state) => {
        const liveOnly = state.items.filter((i) => !i.persisted)
        const merged = [...mapped, ...liveOnly]
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, MAX_ITEMS)
        return { items: merged, hydrated: true }
      })
    } catch {
      set({ hydrated: true })
    }
  },
}))

/** Component dışından push için kolaylık helper'ı. */
export function pushNotification(
  n: Omit<AppNotification, "id" | "createdAt" | "read">,
) {
  useNotificationsStore.getState().add(n)
}

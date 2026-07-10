"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * Locally-tracked custom folders that the user created from this
 * dashboard. The IMAP `LIST` cache on some mail-server deployments
 * (Dovecot with namespace sync, Cyrus with metadata DB lag) doesn't
 * always surface a freshly-created folder on the very next call — even
 * minutes later. We mirror creates/deletes into localStorage and merge
 * the cache into every fetched folder list so a page reload doesn't
 * make the user's new folder vanish.
 *
 * Auto-cleanup: when the canonical IMAP list eventually does include a
 * pending entry, the merger calls `remove()` to drop the local mirror.
 * Removed folders also drop immediately when the user deletes them.
 */
interface PendingFoldersStore {
  /** Mailbox email (lower-cased) → list of custom folder paths. */
  pending: Record<string, string[]>
  add: (mailbox: string, path: string) => void
  remove: (mailbox: string, path: string) => void
  /** Clear every entry for a mailbox — useful when the user disconnects. */
  clear: (mailbox: string) => void
}

export const usePendingFolders = create<PendingFoldersStore>()(
  persist(
    (set, get) => ({
      pending: {},
      add: (mailbox, path) => {
        const key = mailbox.toLowerCase()
        const existing = get().pending[key] ?? []
        if (existing.includes(path)) return
        set({
          pending: { ...get().pending, [key]: [...existing, path] },
        })
      },
      remove: (mailbox, path) => {
        const key = mailbox.toLowerCase()
        const existing = get().pending[key] ?? []
        if (!existing.includes(path)) return
        const next = existing.filter((p) => p !== path)
        const all = { ...get().pending }
        if (next.length === 0) delete all[key]
        else all[key] = next
        set({ pending: all })
      },
      clear: (mailbox) => {
        const key = mailbox.toLowerCase()
        if (!get().pending[key]) return
        const all = { ...get().pending }
        delete all[key]
        set({ pending: all })
      },
    }),
    { name: "sentroy-mail-pending-folders" },
  ),
)

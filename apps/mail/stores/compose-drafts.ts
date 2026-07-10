"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * Per-company localStorage cache for unsent compose drafts. Mail-server
 * doesn't expose a drafts endpoint we can reach yet, so we mirror the
 * minimum fields a user would lose if they accidentally close the sheet
 * — enough to restore the next time they open compose. Per-slug because
 * a user can be a member of multiple companies; we don't want last-typed
 * draft from Acme leaking into Initech's compose pane.
 */
export interface ComposeDraft {
  /** Wall-clock when the draft was saved — UI labels it ("saved 3m ago"). */
  savedAt: number
  from?: string
  to?: string[]
  cc?: string[]
  replyTo?: string[]
  subject?: string
  html?: string
  scheduleEnabled?: boolean
  scheduledAt?: string
  /** Inline reply/forward threading hints — preserved so reopening a
   *  draft hand-edited from a reply still routes back into the thread. */
  inReplyTo?: string
  references?: string[]
}

interface ComposeDraftsStore {
  /** Company slug → draft. */
  drafts: Record<string, ComposeDraft>
  save: (slug: string, draft: ComposeDraft) => void
  load: (slug: string) => ComposeDraft | null
  clear: (slug: string) => void
}

export const useComposeDrafts = create<ComposeDraftsStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      save: (slug, draft) => {
        set({ drafts: { ...get().drafts, [slug]: draft } })
      },
      load: (slug) => get().drafts[slug] ?? null,
      clear: (slug) => {
        if (!get().drafts[slug]) return
        const next = { ...get().drafts }
        delete next[slug]
        set({ drafts: next })
      },
    }),
    { name: "sentroy-mail-compose-drafts" },
  ),
)

/**
 * True when the draft has any user-typed content worth preserving.
 * Empty form (only the from address auto-selected) → not dirty, no
 * confirm prompt on close.
 */
export function isDraftDirty(draft: ComposeDraft): boolean {
  if (draft.to && draft.to.length > 0) return true
  if (draft.cc && draft.cc.length > 0) return true
  if (draft.replyTo && draft.replyTo.length > 0) return true
  if (draft.subject && draft.subject.trim().length > 0) return true
  if (draft.html && stripHtml(draft.html).length > 0) return true
  return false
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim()
}

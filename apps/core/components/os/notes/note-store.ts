"use client"

import { create } from "zustand"
import type { NoteColor, NoteVisibility } from "@workspace/db/types"

/**
 * Sentroy OS Notlar — Notes uygulaması + masaüstü yüzen widget'lar için
 * PAYLAŞILAN durum. İkisi de bu store'u okur → app'te düzenleme anında
 * widget'a yansır (canlı senkron). Kaynak-of-truth SUNUCU: placement'lar
 * cihazlar-arası (per-user), not içerikleri company-scoped API, klasörler
 * per-user. Bu store persist EDİLMEZ; mount'ta `load(slug)` ile tazelenir.
 */

export interface NoteData {
  id: string
  companyId: string
  authorUserId: string
  title: string
  text: string
  bodyHtml: string | null
  mentions: string[]
  visibility: NoteVisibility
  color: NoteColor
  folderId: string | null
  /** Sunucu türetimli tarih grup anahtarı: `last7`|`last30`|`m:YYYY-MM`|`y:YYYY`. */
  group?: string
  createdAt: string
  updatedAt: string
}

export interface NoteFolderData {
  id: string
  name: string
}

export interface WidgetGeo {
  x: number
  y: number
  w: number
  h: number
}

interface Placement extends WidgetGeo {
  noteId: string
}

interface NoteState {
  slug: string | null
  notes: NoteData[]
  folders: NoteFolderData[]
  placements: Record<string, WidgetGeo>
  /** Seçili klasör (null = All Notes). */
  selectedFolderId: string | null
  /** Çöp kutusu görünümü aktif mi (klasör seçiminden bağımsız). */
  viewTrash: boolean
  /** Çöp kutusundaki notlar (silinen, son 30 gün) — tembel yüklenir. */
  trash: NoteData[]
  loading: boolean
  loaded: boolean
  requestedOpenId: string | null

  load: (slug: string) => Promise<void>
  setFolder: (folderId: string | null) => void
  openTrash: () => Promise<void>
  restoreNote: (id: string) => Promise<void>
  purgeNote: (id: string) => Promise<void>
  createNote: () => Promise<string | null>
  updateNote: (
    id: string,
    patch: Partial<Pick<NoteData, "text" | "bodyHtml" | "mentions" | "visibility" | "color">>,
  ) => void
  deleteNote: (id: string, permanent?: boolean) => Promise<void>
  moveNote: (id: string, folderId: string | null) => Promise<void>
  createFolder: (name: string) => Promise<string | null>
  renameFolder: (id: string, name: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  pin: (id: string) => Promise<void>
  move: (id: string, geo: WidgetGeo) => void
  unpin: (id: string) => Promise<void>
  requestOpen: (id: string) => void
  consumeOpen: () => void
}

const patchTimers = new Map<string, ReturnType<typeof setTimeout>>()
const moveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function deriveTitle(text: string): string {
  const first =
    text
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? ""
  return first.slice(0, 200)
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json?.data
}

export const useNoteStore = create<NoteState>((set, get) => ({
  slug: null,
  notes: [],
  folders: [],
  placements: {},
  selectedFolderId: null,
  viewTrash: false,
  trash: [],
  loading: false,
  loaded: false,
  requestedOpenId: null,

  load: async (slug) => {
    const st = get()
    if (st.slug === slug && (st.loading || st.loaded)) return
    if (get().slug !== slug) {
      patchTimers.forEach((t) => clearTimeout(t))
      patchTimers.clear()
      moveTimers.forEach((t) => clearTimeout(t))
      moveTimers.clear()
      set({
        slug,
        notes: [],
        folders: [],
        placements: {},
        selectedFolderId: null,
        viewTrash: false,
        trash: [],
        loaded: false,
        requestedOpenId: null,
      })
    }
    set({ loading: true })
    try {
      const [notesData, placeData, folderData] = await Promise.all([
        api(`/api/companies/${slug}/notes`),
        api(`/api/companies/${slug}/note-widgets`),
        api(`/api/companies/${slug}/note-folders`),
      ])
      // Şirket bu await sırasında değiştiyse geç gelen sonucu YAZMA (yeni
      // şirketin verisini ezmesin — hızlı A→B geçişinde A geç dönebilir).
      if (get().slug !== slug) return
      const placements: Record<string, WidgetGeo> = {}
      for (const p of (placeData?.placements ?? []) as Placement[]) {
        placements[p.noteId] = { x: p.x, y: p.y, w: p.w, h: p.h }
      }
      set({
        notes: (notesData?.notes ?? []) as NoteData[],
        folders: (folderData?.folders ?? []) as NoteFolderData[],
        placements,
        loaded: true,
      })
    } finally {
      // Yalnız hâlâ bu slug için yükleniyorsak loading'i kapat.
      if (get().slug === slug) set({ loading: false })
    }
  },

  setFolder: (folderId) => set({ selectedFolderId: folderId, viewTrash: false }),

  openTrash: async () => {
    set({ viewTrash: true })
    const slug = get().slug
    if (!slug) return
    // Her açılışta tazele (silinenler değişmiş olabilir) — 30 gün penceresi
    // sunucuda tembel purge edilir.
    try {
      const data = await api(`/api/companies/${slug}/notes/trash`)
      // Şirket await sırasında değiştiyse yazma (stale-slug).
      if (get().slug !== slug) return
      set({ trash: (data?.notes ?? []) as NoteData[] })
    } catch {
      /* boş bırak — kullanıcı tekrar deneyebilir */
    }
  },

  restoreNote: async (id) => {
    const slug = get().slug
    if (!slug) return
    // Optimistic: çöpten çıkar.
    set((s) => ({ trash: s.trash.filter((n) => n.id !== id) }))
    try {
      const data = await api(`/api/companies/${slug}/notes/${id}/restore`, { method: "POST" })
      // Şirket değiştiyse başka şirketin listesine yazma.
      if (get().slug !== slug) return
      const note = data?.note as NoteData | undefined
      if (note) set((s) => ({ notes: [note, ...s.notes.filter((n) => n.id !== note.id)] }))
    } catch {
      // Başarısızsa çöpü yeniden çek (optimistic geri al).
      if (get().slug === slug) void get().openTrash()
    }
  },

  purgeNote: async (id) => {
    const slug = get().slug
    if (!slug) return
    set((s) => ({ trash: s.trash.filter((n) => n.id !== id) }))
    try {
      await api(`/api/companies/${slug}/notes/${id}?permanent=1`, { method: "DELETE" })
    } catch {
      // Başarısızsa optimistic kaldırmayı geri al (restore ile simetrik).
      if (get().slug === slug) void get().openTrash()
    }
  },

  createNote: async () => {
    const slug = get().slug
    if (!slug) return null
    const folderId = get().selectedFolderId
    const data = await api(`/api/companies/${slug}/notes`, {
      method: "POST",
      body: JSON.stringify({ text: "", bodyHtml: "", visibility: "author", folderId }),
    })
    const note = data?.note as NoteData | undefined
    if (!note) return null
    set((s) => ({ notes: [note, ...s.notes] }))
    return note.id
  },

  updateNote: (id, patch) => {
    const slug = get().slug
    if (!slug) return
    set((s) => ({
      notes: s.notes.map((n) => {
        if (n.id !== id) return n
        const next = { ...n, ...patch }
        if (patch.text !== undefined) next.title = deriveTitle(patch.text)
        return next
      }),
    }))
    const existing = patchTimers.get(id)
    if (existing) clearTimeout(existing)
    patchTimers.set(
      id,
      setTimeout(() => {
        patchTimers.delete(id)
        void api(`/api/companies/${slug}/notes/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }).catch(() => {})
      }, 700),
    )
  },

  deleteNote: async (id, permanent = false) => {
    const slug = get().slug
    if (!slug) return
    const t = patchTimers.get(id)
    if (t) {
      clearTimeout(t)
      patchTimers.delete(id)
    }
    // Geri alma için notu + placement'ı sakla (sunucu reddederse re-insert).
    const prevNote = get().notes.find((n) => n.id === id)
    const prevPlacement = get().placements[id]
    set((s) => {
      const placements = { ...s.placements }
      delete placements[id]
      return { notes: s.notes.filter((n) => n.id !== id), placements }
    })
    // permanent=true → boş bırakılan yeni not (çöpe gitmeden kalıcı sil).
    const qs = permanent ? "?permanent=1" : ""
    try {
      await api(`/api/companies/${slug}/notes/${id}${qs}`, { method: "DELETE" })
    } catch {
      // Sunucu reddettiyse (örn. 409: içerikli not çöpte değil) optimistic
      // kaldırmayı geri al — UI sunucu gerçeğinden sessizce sapmasın.
      if (get().slug === slug && prevNote) {
        set((s) => {
          if (s.notes.some((n) => n.id === id)) return {}
          const epoch = 0
          const notes = [prevNote, ...s.notes].sort(
            (a, b) =>
              (new Date(b.updatedAt).getTime() || epoch) -
              (new Date(a.updatedAt).getTime() || epoch),
          )
          const placements = prevPlacement
            ? { ...s.placements, [id]: prevPlacement }
            : s.placements
          return { notes, placements }
        })
      }
    }
  },

  moveNote: async (id, folderId) => {
    const slug = get().slug
    if (!slug) return
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, folderId } : n)),
    }))
    await api(`/api/companies/${slug}/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ folderId }),
    }).catch(() => {})
  },

  createFolder: async (name) => {
    const slug = get().slug
    if (!slug) return null
    const data = await api(`/api/companies/${slug}/note-folders`, {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    const folder = data?.folder as NoteFolderData | undefined
    if (!folder) return null
    set((s) => ({ folders: [...s.folders, folder].sort((a, b) => a.name.localeCompare(b.name)) }))
    return folder.id
  },

  renameFolder: async (id, name) => {
    const slug = get().slug
    if (!slug) return
    set((s) => ({
      folders: s.folders
        .map((f) => (f.id === id ? { ...f, name } : f))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    await api(`/api/companies/${slug}/note-folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }).catch(() => {})
  },

  deleteFolder: async (id) => {
    const slug = get().slug
    if (!slug) return
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      // Klasördeki notlar kategorisiz olur (sunucu da yapar).
      notes: s.notes.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
      selectedFolderId: s.selectedFolderId === id ? null : s.selectedFolderId,
    }))
    await api(`/api/companies/${slug}/note-folders/${id}`, { method: "DELETE" }).catch(() => {})
  },

  pin: async (id) => {
    const slug = get().slug
    if (!slug) return
    const count = Object.keys(get().placements).length
    const geo: WidgetGeo = {
      x: 40 + (count % 6) * 26,
      y: 96 + (count % 6) * 26,
      w: 280,
      h: 240,
    }
    set((s) => ({ placements: { ...s.placements, [id]: geo } }))
    await api(`/api/companies/${slug}/note-widgets/${id}`, {
      method: "PUT",
      body: JSON.stringify(geo),
    }).catch(() => {})
  },

  move: (id, geo) => {
    const slug = get().slug
    if (!slug) return
    set((s) => ({ placements: { ...s.placements, [id]: geo } }))
    const existing = moveTimers.get(id)
    if (existing) clearTimeout(existing)
    moveTimers.set(
      id,
      setTimeout(() => {
        moveTimers.delete(id)
        void api(`/api/companies/${slug}/note-widgets/${id}`, {
          method: "PUT",
          body: JSON.stringify(geo),
        }).catch(() => {})
      }, 500),
    )
  },

  unpin: async (id) => {
    const slug = get().slug
    if (!slug) return
    set((s) => {
      const placements = { ...s.placements }
      delete placements[id]
      return { placements }
    })
    await api(`/api/companies/${slug}/note-widgets/${id}`, { method: "DELETE" }).catch(() => {})
  },

  requestOpen: (id) => set({ requestedOpenId: id }),
  consumeOpen: () => set({ requestedOpenId: null }),
}))

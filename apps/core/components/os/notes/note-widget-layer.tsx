"use client"

import { useEffect, useMemo } from "react"
import { useNoteStore } from "./note-store"
import { NoteWidget } from "./note-widget"

/**
 * Masaüstü yüzen not widget'ları katmanı. Pencerelerin ALTINDA (z-[5];
 * WindowManager z-10) masaüstünde yüzer — açık pencereler üstünü kapatır
 * (kullanıcı isteği). Katmanın kendisi `pointer-events-none`; yalnız kartlar
 * etkileşimli, böylece boş alan alttaki masaüstü tıklamalarını engellemez.
 *
 * Kaynak: paylaşılan `useNoteStore` → Notlar app'inde düzenleme anında burada
 * yansır. Placement'lar sunucudan (cihazlar-arası).
 */
export function NoteWidgetLayer({
  slug,
  onOpenNotes,
}: {
  slug: string
  /** Notlar penceresini aç/öne getir (store.requestOpen zaten seçili notu verir). */
  onOpenNotes: () => void
}) {
  const notes = useNoteStore((s) => s.notes)
  const placements = useNoteStore((s) => s.placements)
  const load = useNoteStore((s) => s.load)
  const move = useNoteStore((s) => s.move)
  const unpin = useNoteStore((s) => s.unpin)
  const requestOpen = useNoteStore((s) => s.requestOpen)

  useEffect(() => {
    if (slug) void load(slug)
  }, [slug, load])

  const notesById = useMemo(
    () => new Map(notes.map((n) => [n.id, n])),
    [notes],
  )

  const pinnedIds = Object.keys(placements)
  if (pinnedIds.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {pinnedIds.map((id) => {
        const note = notesById.get(id)
        const geo = placements[id]
        if (!note || !geo) return null
        return (
          <NoteWidget
            key={id}
            note={note}
            geo={geo}
            onMove={(g) => move(id, g)}
            onUnpin={() => void unpin(id)}
            onOpen={() => {
              requestOpen(id)
              onOpenNotes()
            }}
          />
        )
      })}
    </div>
  )
}

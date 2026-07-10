"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, ArrowExpand01Icon } from "@hugeicons/core-free-icons"
import { sanitizeHtml } from "@workspace/console/lib/sanitize-html"
import { cn } from "@workspace/ui/lib/utils"
import type { NoteData, WidgetGeo } from "./note-store"
import { NOTE_COLOR_BORDER, NOTE_COLOR_GLASS } from "./note-theme"

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/**
 * Masaüstünde yüzen tek not widget'ı — renk-tonlu, sürüklenebilir kart.
 * Başlık çubuğundan sürüklenir (gövde metni seçilebilir/scroll edilebilir).
 * Gövde salt-okunur sanitize edilmiş HTML önizlemesi; düzenleme "open in Notes"
 * ile app'te yapılır. Konum drop'ta store.move ile (debounced) sunucuya yazılır.
 */
export function NoteWidget({
  note,
  geo,
  onMove,
  onUnpin,
  onOpen,
}: {
  note: NoteData
  geo: WidgetGeo
  onMove: (geo: WidgetGeo) => void
  onUnpin: () => void
  onOpen: () => void
}) {
  const t = useTranslations("os")
  const [pos, setPos] = useState({ x: geo.x, y: geo.y })
  const dragging = useRef(false)

  // Store'dan konum değişirse (başka etkileşim) senkronla — sürükleme sırasında değil.
  useEffect(() => {
    if (!dragging.current) setPos({ x: geo.x, y: geo.y })
  }, [geo.x, geo.y])

  const safeHtml = useMemo(
    () => (note.bodyHtml ? sanitizeHtml(note.bodyHtml) : null),
    [note.bodyHtml],
  )

  function startDrag(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    const el = e.currentTarget as Element
    el.setPointerCapture?.(e.pointerId)
    const start = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y }
    const compute = (ev: PointerEvent) => ({
      x: clamp(start.x + ev.clientX - start.px, 0, window.innerWidth - 80),
      y: clamp(start.y + ev.clientY - start.py, 40, window.innerHeight - 56),
    })
    const move = (ev: PointerEvent) => setPos(compute(ev))
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      el.releasePointerCapture?.(e.pointerId)
      dragging.current = false
      const p = compute(ev)
      setPos(p)
      onMove({ x: p.x, y: p.y, w: geo.w, h: geo.h })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <div
      className={cn(
        "group pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl border shadow-xl backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/10",
        NOTE_COLOR_GLASS[note.color],
        NOTE_COLOR_BORDER[note.color],
      )}
      style={{ left: pos.x, top: pos.y, width: geo.w, height: geo.h }}
    >
      {/* Başlık çubuğu = sürükleme tutamacı */}
      <div
        onPointerDown={startDrag}
        onDoubleClick={onOpen}
        className="flex shrink-0 cursor-grab touch-none items-center gap-1 border-b border-black/5 px-2.5 py-1.5 active:cursor-grabbing dark:border-white/10"
      >
        <span className="line-clamp-1 flex-1 text-[12px] font-semibold">
          {note.title || t("notes.untitled")}
        </span>
        {/* Butonlar yalnız hover'da görünür (macOS tarzı) */}
        <button
          type="button"
          onClick={onOpen}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t("notes.openInNotes")}
          title={t("notes.openInNotes")}
        >
          <HugeiconsIcon icon={ArrowExpand01Icon} strokeWidth={2} className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onUnpin}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t("notes.unpin")}
          title={t("notes.unpin")}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
        </button>
      </div>

      {/* Gövde — salt-okunur önizleme (başlıklar widget'ta küçük tutulur) */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {safeHtml ? (
          <div
            className="text-[13px] leading-relaxed [&_a]:text-primary [&_a]:underline [&_h1]:mb-1 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-[13px] [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-medium [&_p]:text-[13px] [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_pre]:rounded [&_pre]:bg-foreground/10 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : note.text ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
            {note.text}
          </p>
        ) : (
          <p className="text-[13px] italic text-muted-foreground">
            {t("notes.emptyNote")}
          </p>
        )}
      </div>
    </div>
  )
}

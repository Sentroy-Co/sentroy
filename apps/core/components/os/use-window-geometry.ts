"use client"

import { useState, type PointerEvent as ReactPointerEvent } from "react"

export interface Geo {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_W = 420
export const MIN_H = 300

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi))
}

/** 8-yön resize tutamakları — konum + cursor sınıfları. */
export const RESIZE_HANDLES: { dir: string; className: string }[] = [
  { dir: "n", className: "left-2 right-2 top-0 h-1.5 cursor-ns-resize" },
  { dir: "s", className: "left-2 right-2 bottom-0 h-1.5 cursor-ns-resize" },
  { dir: "e", className: "top-2 bottom-2 right-0 w-1.5 cursor-ew-resize" },
  { dir: "w", className: "top-2 bottom-2 left-0 w-1.5 cursor-ew-resize" },
  { dir: "ne", className: "top-0 right-0 size-3 cursor-nesw-resize" },
  { dir: "nw", className: "top-0 left-0 size-3 cursor-nwse-resize" },
  { dir: "se", className: "bottom-0 right-0 size-3 cursor-nwse-resize" },
  { dir: "sw", className: "bottom-0 left-0 size-3 cursor-nesw-resize" },
]

/**
 * Pencere sürükleme + 8-yön resize mantığı. Pointer capture + window listener
 * ile iframe olay yutmasını önler; sürüş boyunca `live` lokal state'te tutulur,
 * bırakınca `onCommit` ile kalıcılaşır. `locked` (maximize) ise no-op.
 */
export function useWindowGeometry({
  base,
  bounds,
  locked = false,
  minW = MIN_W,
  minH = MIN_H,
  onCommit,
}: {
  base: Geo
  bounds: { w: number; h: number }
  locked?: boolean
  minW?: number
  minH?: number
  onCommit: (g: Geo) => void
}) {
  const [live, setLive] = useState<Geo | null>(null)
  const geo = live ?? base
  const interacting = live !== null

  function startDrag(e: ReactPointerEvent) {
    if (e.button !== 0 || locked) return
    const start = { px: e.clientX, py: e.clientY, x: geo.x, y: geo.y }
    const el = e.currentTarget as Element
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const nx = clamp(start.x + ev.clientX - start.px, -(geo.w - 140), bounds.w - 48)
      const ny = clamp(start.y + ev.clientY - start.py, 0, bounds.h - 40)
      setLive({ x: nx, y: ny, w: geo.w, h: geo.h })
    }
    const up = () => {
      el.releasePointerCapture?.(e.pointerId)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      setLive((cur) => {
        if (cur) onCommit(cur)
        return null
      })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  function startResize(e: ReactPointerEvent, dir: string) {
    e.stopPropagation()
    if (locked) return
    const start = { px: e.clientX, py: e.clientY, ...geo }
    const el = e.currentTarget as Element
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      let { x, y, w, h } = start
      const dx = ev.clientX - start.px
      const dy = ev.clientY - start.py
      if (dir.includes("e")) w = start.w + dx
      if (dir.includes("s")) h = start.h + dy
      if (dir.includes("w")) {
        w = start.w - dx
        x = start.x + dx
      }
      if (dir.includes("n")) {
        h = start.h - dy
        y = start.y + dy
      }
      if (w < minW) {
        if (dir.includes("w")) x = start.x + start.w - minW
        w = minW
      }
      if (h < minH) {
        if (dir.includes("n")) y = start.y + start.h - minH
        h = minH
      }
      setLive({ x, y, w, h })
    }
    const up = () => {
      el.releasePointerCapture?.(e.pointerId)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      setLive((cur) => {
        if (cur) onCommit(cur)
        return null
      })
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return { geo, interacting, startDrag, startResize }
}

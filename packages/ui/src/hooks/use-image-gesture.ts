"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Image lightbox icin pan + zoom + rotate gesture state'i.
 *
 * Pinch zoom (multi-touch), wheel zoom (cursor-anchored), drag pan
 * (mouse + touch), double-click/tap zoom toggle. Sayfa reset'i caller
 * tarafindan tetiklenir (resetTransform), source degisiminde cagrilir.
 *
 * Performans: scale + translate transform string olarak inline style'a
 * yazilir, GPU-accelerated. Re-render her gesture step'inde olur ama
 * React batch'i + layout-only update oldugu icin pratikte takilmaz.
 *
 * Limitler:
 *   minScale = 0.1, maxScale = 10 — kullanıcının ekrana görünmez yapacak
 *   kadar zoom-out etmesini önlemek için clamp.
 *   Pan offset hard limit yok (caller'a `fit` cagrisi ile reset edilir).
 */

interface ImageGestureOptions {
  /** Container ref — gesture bind target. Image element AYRI; bu wrapper. */
  containerRef: React.RefObject<HTMLElement | null>
  /** Source key (URL) degistiginde state otomatik reset. */
  sourceKey: string
}

interface ImageGestureState {
  scale: number
  translateX: number
  translateY: number
  rotate: number
  isDragging: boolean
}

interface ImageGestureControls {
  zoomIn: () => void
  zoomOut: () => void
  rotate: () => void
  reset: () => void
  setScale: (value: number) => void
}

const MIN_SCALE = 0.1
const MAX_SCALE = 10
const ZOOM_STEP = 0.25
const DOUBLE_TAP_ZOOM = 2.5
const DOUBLE_TAP_THRESHOLD_MS = 300

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function useImageGesture(
  options: ImageGestureOptions,
): [ImageGestureState, ImageGestureControls] {
  const { containerRef, sourceKey } = options

  const [scale, setScaleState] = useState(1)
  const [translateX, setTranslateX] = useState(0)
  const [translateY, setTranslateY] = useState(0)
  const [rotate, setRotate] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // Source degisince transform sifirla
  useEffect(() => {
    setScaleState(1)
    setTranslateX(0)
    setTranslateY(0)
    setRotate(0)
  }, [sourceKey])

  const dragStateRef = useRef<{
    startX: number
    startY: number
    initialTx: number
    initialTy: number
  } | null>(null)

  // Multi-touch pinch state
  const pinchRef = useRef<{
    initialDistance: number
    initialScale: number
    centerX: number
    centerY: number
  } | null>(null)

  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)

  const reset = useCallback(() => {
    setScaleState(1)
    setTranslateX(0)
    setTranslateY(0)
    setRotate(0)
  }, [])

  const zoomAt = useCallback(
    (nextScale: number, anchorX: number, anchorY: number) => {
      const container = containerRef.current
      if (!container) {
        setScaleState(clamp(nextScale, MIN_SCALE, MAX_SCALE))
        return
      }
      const rect = container.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2

      // Anchor (cursor/pinch-center) container'in CENTER'ina gore offset.
      // Mevcut transform: translate(translateX, translateY) scale(scale)
      // Anchor world coord: (anchorRel - center - translate) / scale
      // Yeni translate: anchorRel - center - worldCoord * newScale
      const anchorRelX = anchorX - rect.left
      const anchorRelY = anchorY - rect.top
      const worldX = (anchorRelX - cx - translateX) / scale
      const worldY = (anchorRelY - cy - translateY) / scale

      const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE)
      const newTx = anchorRelX - cx - worldX * clamped
      const newTy = anchorRelY - cy - worldY * clamped

      setScaleState(clamped)
      setTranslateX(newTx)
      setTranslateY(newTy)
    },
    [containerRef, scale, translateX, translateY],
  )

  // Wheel zoom — cursor-anchored
  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const handleWheel = (e: WheelEvent) => {
      // ctrl/meta + wheel = pinch on trackpad; native wheel da yine zoom
      e.preventDefault()
      const delta = -e.deltaY * 0.005
      const nextScale = scale * (1 + delta)
      zoomAt(nextScale, e.clientX, e.clientY)
    }

    node.addEventListener("wheel", handleWheel, { passive: false })
    return () => node.removeEventListener("wheel", handleWheel)
  }, [containerRef, scale, zoomAt])

  // Mouse drag
  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const handleMouseDown = (e: MouseEvent) => {
      // Sadece sol tus
      if (e.button !== 0) return
      e.preventDefault()
      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialTx: translateX,
        initialTy: translateY,
      }
      setIsDragging(true)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current
      if (!drag) return
      setTranslateX(drag.initialTx + (e.clientX - drag.startX))
      setTranslateY(drag.initialTy + (e.clientY - drag.startY))
    }

    const handleMouseUp = () => {
      dragStateRef.current = null
      setIsDragging(false)
    }

    const handleDoubleClick = (e: MouseEvent) => {
      e.preventDefault()
      if (scale > 1.5) {
        reset()
      } else {
        zoomAt(DOUBLE_TAP_ZOOM, e.clientX, e.clientY)
      }
    }

    node.addEventListener("mousedown", handleMouseDown)
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    node.addEventListener("dblclick", handleDoubleClick)

    return () => {
      node.removeEventListener("mousedown", handleMouseDown)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
      node.removeEventListener("dblclick", handleDoubleClick)
    }
  }, [containerRef, translateX, translateY, scale, reset, zoomAt])

  // Touch — pinch + pan + double-tap
  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Tek parmak: pan + double-tap kontrolu
        const t = e.touches[0]!
        const now = Date.now()
        const last = lastTapRef.current
        if (
          last &&
          now - last.time < DOUBLE_TAP_THRESHOLD_MS &&
          Math.abs(t.clientX - last.x) < 30 &&
          Math.abs(t.clientY - last.y) < 30
        ) {
          // Double tap
          e.preventDefault()
          if (scale > 1.5) {
            reset()
          } else {
            zoomAt(DOUBLE_TAP_ZOOM, t.clientX, t.clientY)
          }
          lastTapRef.current = null
          return
        }
        lastTapRef.current = { time: now, x: t.clientX, y: t.clientY }
        dragStateRef.current = {
          startX: t.clientX,
          startY: t.clientY,
          initialTx: translateX,
          initialTy: translateY,
        }
        setIsDragging(true)
      } else if (e.touches.length === 2) {
        // Pinch zoom baslangici
        e.preventDefault()
        dragStateRef.current = null
        setIsDragging(false)
        const t1 = e.touches[0]!
        const t2 = e.touches[1]!
        const dx = t2.clientX - t1.clientX
        const dy = t2.clientY - t1.clientY
        pinchRef.current = {
          initialDistance: Math.hypot(dx, dy),
          initialScale: scale,
          centerX: (t1.clientX + t2.clientX) / 2,
          centerY: (t1.clientY + t2.clientY) / 2,
        }
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && dragStateRef.current) {
        e.preventDefault()
        const t = e.touches[0]!
        const drag = dragStateRef.current
        setTranslateX(drag.initialTx + (t.clientX - drag.startX))
        setTranslateY(drag.initialTy + (t.clientY - drag.startY))
      } else if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const t1 = e.touches[0]!
        const t2 = e.touches[1]!
        const dx = t2.clientX - t1.clientX
        const dy = t2.clientY - t1.clientY
        const distance = Math.hypot(dx, dy)
        const factor = distance / pinchRef.current.initialDistance
        const nextScale = pinchRef.current.initialScale * factor
        zoomAt(nextScale, pinchRef.current.centerX, pinchRef.current.centerY)
      }
    }

    const handleTouchEnd = () => {
      dragStateRef.current = null
      pinchRef.current = null
      setIsDragging(false)
    }

    node.addEventListener("touchstart", handleTouchStart, { passive: false })
    node.addEventListener("touchmove", handleTouchMove, { passive: false })
    node.addEventListener("touchend", handleTouchEnd)
    node.addEventListener("touchcancel", handleTouchEnd)

    return () => {
      node.removeEventListener("touchstart", handleTouchStart)
      node.removeEventListener("touchmove", handleTouchMove)
      node.removeEventListener("touchend", handleTouchEnd)
      node.removeEventListener("touchcancel", handleTouchEnd)
    }
  }, [containerRef, scale, translateX, translateY, reset, zoomAt])

  const controls: ImageGestureControls = {
    zoomIn: () => {
      const node = containerRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      zoomAt(scale + ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2)
    },
    zoomOut: () => {
      const node = containerRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      zoomAt(scale - ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2)
    },
    rotate: () => {
      setRotate((r) => (r + 90) % 360)
    },
    reset,
    setScale: (v) => {
      const node = containerRef.current
      if (!node) {
        setScaleState(clamp(v, MIN_SCALE, MAX_SCALE))
        return
      }
      const rect = node.getBoundingClientRect()
      zoomAt(v, rect.left + rect.width / 2, rect.top + rect.height / 2)
    },
  }

  return [
    { scale, translateX, translateY, rotate, isDragging },
    controls,
  ]
}

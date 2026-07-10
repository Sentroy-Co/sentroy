"use client"

// Magnetic — imlece hafifçe çekilen sarmalayıcı (CTA'lar için).
// pointer:fine cihazlarda çalışır; max ofset küçük tutulur (premium, oyuncak değil).

import { useRef, type ReactNode } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"

export function Magnetic({
  children,
  strength = 10,
  className,
}: {
  children: ReactNode
  /** Maksimum çekim ofseti (px). */
  strength?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.5 })
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.5 })

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
    x.set(dx * strength)
    y.set(dy * strength)
  }

  function reset() {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      style={{ x: sx, y: sy }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

"use client"

// Dock fisheye büyütme matematiği — TEK KAYNAK.
// Tüketiciler: OS dock'u (components/os/dock.tsx) + landing v2 DockNav
// (components/landing/v2/primitives/dock-nav.tsx). Sabitleri değiştirirken iki
// deneyimin de aynı hissi vereceğini unutma.

import { useRef, type RefObject } from "react"
import { useSpring, useTransform, type MotionValue } from "framer-motion"

export const DOCK_ICON_BASE = 46
export const DOCK_ICON_MAX = 76
export const DOCK_MAGNIFY_RANGE = 130 // imleç bu mesafe içindeyken büyür (fisheye)

/**
 * İmleç X koordinatına (mouseX) göre ikonun spring'li boyutunu üretir.
 * mouseX = Number.POSITIVE_INFINITY iken herkes BASE boyutta kalır.
 */
export function useDockMagnify(
  mouseX: MotionValue<number>,
  {
    base = DOCK_ICON_BASE,
    max = DOCK_ICON_MAX,
    range = DOCK_MAGNIFY_RANGE,
  }: { base?: number; max?: number; range?: number } = {},
): { ref: RefObject<HTMLButtonElement | null>; size: MotionValue<number> } {
  const ref = useRef<HTMLButtonElement>(null)
  const distance = useTransform(mouseX, (val) => {
    const b = ref.current?.getBoundingClientRect()
    const center = b ? b.x + b.width / 2 : 0
    return val - center
  })
  const sizeT = useTransform(distance, [-range, 0, range], [base, max, base])
  const size = useSpring(sizeT, { stiffness: 350, damping: 22, mass: 0.4 })
  return { ref, size }
}

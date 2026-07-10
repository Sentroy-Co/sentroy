"use client"

import { MotionConfig } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <MotionConfig
      reducedMotion="user"
      transition={
        reduce
          ? { duration: 0 }
          : { duration: 0.18, ease: [0.32, 0.72, 0, 1] }
      }
    >
      {children}
    </MotionConfig>
  )
}

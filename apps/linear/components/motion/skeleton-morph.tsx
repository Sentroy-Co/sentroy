"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type SkeletonMorphProps = {
  loading: boolean
  skeleton: React.ReactNode
  children: React.ReactNode
  layoutId?: string
  className?: string
}

export function SkeletonMorph({
  loading,
  skeleton,
  children,
  layoutId,
  className,
}: SkeletonMorphProps) {
  const reduce = useReducedMotion()
  const duration = reduce ? 0 : 0.18

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="skeleton"
            layoutId={layoutId ? `${layoutId}:skeleton` : undefined}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
          >
            {skeleton}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            layoutId={layoutId}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

"use client"

import { motion, type HTMLMotionProps } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type StaggerListProps = HTMLMotionProps<"ul"> & {
  staggerMs?: number
}

export function StaggerList({
  staggerMs = 50,
  children,
  ...rest
}: StaggerListProps) {
  const reduce = useReducedMotion()
  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: reduce ? 0 : staggerMs / 1000 },
        },
      }}
      {...rest}
    >
      {children}
    </motion.ul>
  )
}

export function StaggerItem({
  children,
  ...rest
}: HTMLMotionProps<"li">) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      variants={{
        hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 6 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      {...rest}
    >
      {children}
    </motion.li>
  )
}

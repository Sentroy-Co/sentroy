"use client"

import { motion, type HTMLMotionProps } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type FadeInProps = HTMLMotionProps<"div"> & {
  delay?: number
  y?: number
}

export function FadeIn({
  delay = 0,
  y = 4,
  children,
  ...rest
}: FadeInProps) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -y }}
      transition={{
        duration: reduce ? 0 : 0.18,
        ease: [0.32, 0.72, 0, 1],
        delay,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

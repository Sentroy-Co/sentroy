"use client"

import { motion } from "framer-motion"
import { cn } from "@workspace/ui/lib/utils"

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  )
}

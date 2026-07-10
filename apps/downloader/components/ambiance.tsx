"use client"

import { motion } from "framer-motion"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Ambiyans katmanı — yavaş, sonsuz (infinity) hareket eden gradient blob'lar.
 * Hero ve footer'a derinlik + premium his katar. `pointer-events-none`,
 * içeriğin arkasında (-z-10). Reduce-motion'da framer otomatik durağanlaşır.
 */
export function Ambiance({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
    >
      <motion.div
        className="absolute left-[8%] top-[12%] size-[42vmax] rounded-full bg-primary/15 blur-[130px]"
        animate={{ x: ["-8%", "16%", "-8%"], y: ["-6%", "12%", "-6%"], scale: [1, 1.15, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[8%] right-[4%] size-[36vmax] rounded-full bg-primary/10 blur-[140px]"
        animate={{ x: ["10%", "-14%", "10%"], y: ["8%", "-10%", "8%"], scale: [1.1, 0.92, 1.1] }}
        transition={{ duration: 33, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 size-[30vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.05] blur-[120px]"
        animate={{ scale: [1, 1.22, 1], opacity: [0.45, 0.8, 0.45] }}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  )
}

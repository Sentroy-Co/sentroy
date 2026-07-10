"use client"

import { motion } from "framer-motion"
import { cn } from "@workspace/ui/lib/utils"

/**
 * tools.sentroy.com çok renkli yumuşak gradient ambiyansı — blob'lar yavaşça
 * sürüklenir + konteynerde yavaş `hue-rotate` ile renkler "soft soft" tüm RGB
 * tonları arasında kayar. Varsayılan `fixed` (tüm viewport, landing). `className`
 * ile konum ezilebilir (örn. `absolute` → bir band içine hapsedilir, tool sayfası
 * başlık alanı). pointer-events-none, -z-10, içerik arkası.
 */
export function ToolsAmbiance({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}>
      <motion.div
        className="absolute inset-0"
        animate={{ filter: ["hue-rotate(0deg)", "hue-rotate(360deg)"] }}
        transition={{ duration: 44, repeat: Infinity, ease: "linear" }}
      >
        <motion.div
          className="absolute left-[6%] top-[8%] size-[44vmax] rounded-full blur-[150px]"
          style={{ background: "rgba(99,102,241,0.20)" }}
          animate={{ x: ["-6%", "14%", "-6%"], y: ["-5%", "12%", "-5%"], scale: [1, 1.15, 1] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[2%] top-[20%] size-[38vmax] rounded-full blur-[150px]"
          style={{ background: "rgba(56,189,248,0.18)" }}
          animate={{ x: ["8%", "-12%", "8%"], y: ["6%", "-10%", "6%"], scale: [1.1, 0.92, 1.1] }}
          transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[6%] left-[24%] size-[40vmax] rounded-full blur-[160px]"
          style={{ background: "rgba(244,63,94,0.16)" }}
          animate={{ x: ["-10%", "12%", "-10%"], y: ["8%", "-8%", "8%"], scale: [1, 1.2, 1] }}
          transition={{ duration: 38, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[12%] right-[18%] size-[34vmax] rounded-full blur-[150px]"
          style={{ background: "rgba(52,211,153,0.16)" }}
          animate={{ x: ["6%", "-14%", "6%"], y: ["-6%", "10%", "-6%"], scale: [1.05, 0.9, 1.05] }}
          transition={{ duration: 31, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  )
}

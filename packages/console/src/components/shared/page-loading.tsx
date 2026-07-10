"use client"

import { motion } from "framer-motion"
import { LogoIcon } from "./logo"

/**
 * Sentroy genel "sayfa yükleniyor" göstergesi — şirket/uygulama seçimi
 * geçişlerinde, auth gating sırasında, vb.
 *
 * Framer-motion ile çift katmanlı animasyon:
 *   - Logo: yumuşak nefes alma (scale + opacity), 1.6s döngü
 *   - Etrafında pulse halkası: scale 0.8 → 1.4, fade out, 2s döngü
 * Renk + spacing host theme tokens'a uyumlu (border / muted-foreground).
 *
 * `min-h-[60vh]` koruyor — eski API ile uyumlu, sayfayı kaplayan loading
 * yerinde duruyor.
 */
export function PageLoading() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex min-h-[60vh] items-center justify-center"
    >
      <div className="relative flex size-20 items-center justify-center">
        {/* Pulse halkası — logo'nun arkasında scale + fade */}
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border border-foreground/20"
          initial={{ scale: 0.8, opacity: 0.6 }}
          animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.6, 0, 0.6] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Logo — yumuşak nefes alma */}
        <motion.div
          animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative"
        >
          <LogoIcon size={48} />
        </motion.div>
      </div>
    </motion.div>
  )
}

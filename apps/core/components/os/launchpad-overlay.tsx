"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { LaunchpadApps } from "./launchpad-apps"

/**
 * Launchpad — Apple Launchpad tarzı TAM EKRAN overlay (pencere DEĞİL).
 * Duvar kağıdının üstüne ağır blur + karartma; ortada arama + app ızgarası
 * (LaunchpadApps reuse). App seçilince açılır ve overlay kapanır; boş alana
 * tık / Esc kapatır. Dock ikonu core/public/os-app-icons/launchpad.png.
 */
export function LaunchpadOverlay({
  open,
  apps,
  storeApps,
  onOpen,
  onClose,
}: {
  open: boolean
  apps: AppDescriptor[]
  storeApps?: AppDescriptor[]
  onOpen: (d: AppDescriptor) => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[55] bg-black/45 backdrop-blur-2xl"
          onClick={(e) => {
            // Yalnız boş alan (grid/arama dışı) tıklaması kapatır.
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ scale: 1.06, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.04, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="h-full w-full"
          >
            <LaunchpadApps apps={apps} storeApps={storeApps} onOpen={onOpen} onClose={onClose} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

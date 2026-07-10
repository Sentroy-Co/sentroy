"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { scrollToId } from "./smooth-scroll"

/**
 * Akışkan scroll göstergesi — hero'nun alt-orta kısmında, footer'a yumuşak
 * geçişi davet eder. "Sıvı" hissi için organik border-radius morph + nazik
 * bob animasyonu. Footer görünür olunca (scroll aşağı indi) kendini gizler.
 */
export function ScrollIndicator({ targetId = "site-footer" }: { targetId?: string }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > window.innerHeight * 0.5)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <AnimatePresence>
      {hidden ? null : (
        <motion.button
          type="button"
          aria-label="Scroll"
          onClick={() => scrollToId(targetId)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="group absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2"
        >
          <motion.span
            className="relative flex size-12 items-center justify-center"
            animate={{ y: [0, 9, 0] }}
            transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Akışkan dış katman — organik morph + nabız */}
            <motion.span
              className="absolute inset-0 bg-primary/15"
              animate={{
                borderRadius: [
                  "42% 58% 63% 37% / 41% 44% 56% 59%",
                  "58% 42% 37% 63% / 56% 59% 41% 44%",
                  "42% 58% 63% 37% / 41% 44% 56% 59%",
                ],
                scale: [1, 1.12, 1],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="absolute inset-1 rounded-full border border-primary/40 transition-colors group-hover:border-primary/70" />
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2.5}
              className="size-5 text-primary"
            />
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}

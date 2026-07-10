"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"

/**
 * Header amblemi — büyük başlar (header'ın dışına taşar), sayfa aşağı scroll
 * edilince küçülür. framer spring ile yumuşak geçiş.
 */
export function HeaderLogo({ label, suffix }: { label: string; suffix: string }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <a href="/" className="flex items-center gap-2.5 font-semibold">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src="/downloader-logo.png"
        alt=""
        initial={false}
        animate={{ width: scrolled ? 34 : 60, height: scrolled ? 34 : 60 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="shrink-0 object-contain"
      />
      <span>
        {label} <span className="text-muted-foreground">{suffix}</span>
      </span>
    </a>
  )
}

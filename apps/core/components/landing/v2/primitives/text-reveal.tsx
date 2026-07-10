"use client"

// TextReveal — manifesto word-scrub (jüri graft'ı, spatial-editorial'dan).
// Pin'siz serbest akış: container viewport'tan geçerken kelimeler sırayla
// opacity 0.14 → 1 "yanar". Tek useScroll + kelime başına bir useTransform
// (30-60 kelime için ucuz; MotionValue patlaması yok).

import { useMemo, useRef } from "react"
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion"
import { cn } from "@workspace/ui/lib/utils"

export function TextReveal({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    // Metin alt kenardan girerken başla, üst üçte-birde bitir.
    offset: ["start 0.85", "end 0.4"],
  })
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])

  return (
    <p ref={ref} className={cn("flex flex-wrap", className)}>
      {words.map((w, i) => (
        <Word key={`${w}-${i}`} progress={scrollYProgress} start={i / words.length} end={(i + 1) / words.length}>
          {w}
        </Word>
      ))}
    </p>
  )
}

function Word({
  children,
  progress,
  start,
  end,
}: {
  children: string
  progress: MotionValue<number>
  start: number
  end: number
}) {
  const opacity = useTransform(progress, [start, end], [0.14, 1])
  return (
    <motion.span style={{ opacity }} className="mr-[0.28em] mt-[0.12em] inline-block will-change-[opacity]">
      {children}
    </motion.span>
  )
}

"use client"

// InfiniteMarquee — sonsuz kayan şerit. CSS keyframe tabanlı (JS tick yok);
// hover'da yavaşlar, reduced-motion'da durur. İçerik iki kez render edilip
// -50% translate döngüsüyle dikişsiz akar. Keyframe'ler globals'a değil,
// styled-jsx yerine Tailwind arbitrary animasyonla değil — bileşene gömülü
// <style> ile gelir (landing-v2 dışında sızıntı yok).

import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"

export function InfiniteMarquee({
  children,
  durationSec = 40,
  reverse = false,
  className,
}: {
  children: ReactNode
  durationSec?: number
  reverse?: boolean
  className?: string
}) {
  return (
    <div className={cn("group/marquee overflow-hidden", className)}>
      <style>{`
        @keyframes lv2-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .lv2-marquee-track { animation: none !important; } }
      `}</style>
      <div
        className="lv2-marquee-track flex w-max items-center gap-6 will-change-transform [animation-play-state:running] group-hover/marquee:[animation-play-state:paused]"
        style={{
          animation: `lv2-marquee ${durationSec}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        <div className="flex shrink-0 items-center gap-6">{children}</div>
        <div className="flex shrink-0 items-center gap-6" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}

"use client"

import { motion } from "framer-motion"
import { cn } from "@workspace/ui/lib/utils"

const sizeMap = {
  sm: 22,
  md: 30,
  lg: 44,
} as const

const ICON_D =
  "M170.4 13.91l-41.33 72.93c-6.79,11.99 -10.19,20.27 -10.19,27.98 0,7.71 3.4,16 10.19,27.98l41.33 72.94 -16.17 9.18 -41.33 -72.94c-8.44,-14.9 -12.66,-25.74 -12.66,-37.16 0,-11.42 4.22,-22.26 12.66,-37.16l41.33 -72.94 16.17 9.18zm-86.78 4.86c-15.68,0.33 -27.44,0.59 -36.5,2.16 -7.65,1.33 -13.15,3.66 -17.62,8.12 -9.34,9.3 -9.72,24.66 -10.5,55.36l-0 0.13c-0.23,9.24 -0.35,19.33 -0.35,30.29 0,10.99 0.12,21.09 0.35,30.36l0 0.12c0.77,30.66 1.17,46.01 10.5,55.31 4.47,4.45 9.97,6.79 17.62,8.11 9.06,1.57 20.82,1.82 36.5,2.16 4.06,0.09 9.17,0.13 15.39,0.13 6.21,0 11.33,-0.04 15.39,-0.13 15.68,-0.33 27.44,-0.59 36.5,-2.16 7.65,-1.33 13.15,-3.66 17.62,-8.11 4.45,-4.44 6.81,-10.03 8.17,-17.88 1.62,-9.29 1.92,-21.39 2.33,-37.52 0.23,-9.27 0.35,-19.39 0.35,-30.39 0,-11.01 -0.12,-21.12 -0.35,-30.39 -0.4,-16.13 -0.71,-28.23 -2.33,-37.52 -1.37,-7.85 -3.72,-13.44 -8.17,-17.87 -4.47,-4.45 -9.97,-6.79 -17.62,-8.12 -9.06,-1.57 -20.82,-1.83 -36.5,-2.16 -4.04,-0.08 -9.17,-0.13 -15.39,-0.13 -6.22,0 -11.34,0.04 -15.39,0.13zm-39.63 -16.19c10.11,-1.76 22.61,-2.02 39.27,-2.38 6.35,-0.13 11.6,-0.2 15.75,-0.2 4.15,0 9.4,0.07 15.75,0.2 16.66,0.36 29.16,0.62 39.27,2.38 11.52,2 20.09,5.81 27.6,13.29 7.53,7.5 11.37,16.18 13.42,27.92 1.79,10.3 2.12,23.12 2.54,40.21 0.28,11.2 0.42,21.46 0.42,30.83 0,9.37 -0.14,19.63 -0.42,30.83 -0.43,17.09 -0.75,29.91 -2.54,40.21 -2.04,11.74 -5.89,20.43 -13.42,27.93 -7.51,7.48 -16.09,11.29 -27.6,13.29 -10.11,1.75 -22.61,2.02 -39.27,2.38 -6.34,0.13 -11.6,0.2 -15.75,0.2 -4.15,0 -9.41,-0.07 -15.75,-0.2 -16.66,-0.35 -29.16,-0.62 -39.27,-2.38 -11.51,-2 -20.09,-5.81 -27.6,-13.29 -14.6,-14.54 -15.06,-32.38 -15.96,-68l-0 -0.13c-0.28,-11.2 -0.42,-21.46 -0.42,-30.83 0,-9.35 0.14,-19.6 0.42,-30.78l0 -0.12c0.9,-35.67 1.36,-53.52 15.96,-68.06 7.51,-7.48 16.08,-11.29 27.6,-13.29z"

export function Logo({
  size = "md",
  className,
  forceDark = false,
}: {
  size?: "sm" | "md" | "lg"
  className?: string
  forceDark?: boolean
}) {
  const h = sizeMap[size]
  // Kurumsal logo SVG dosyalarindan (public/svg). CSS `.dark` toggle: acik modda
  // logo-light.svg (siyah), koyu modda logo-dark.svg (beyaz) — force-dark
  // container'larda (landing v2 / investor .dark) da dogru calisir. LogoIcon
  // (spinner) ayri, asagida inline kalir.
  return (
    <span className={cn("inline-flex select-none", className)} style={{ height: h }}>
      {forceDark ? (
        <>
         {/* eslint-disable-next-line @next/next/no-img-element */}
         <img src="/svg/logo-dark.svg" alt="Sentroy" draggable={false} style={{ height: h }} className="block w-auto" />
        </>
      ) : (
        <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/svg/logo-light.svg" alt="Sentroy" draggable={false} style={{ height: h }} className="block w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/svg/logo-dark.svg" alt="" aria-hidden draggable={false} style={{ height: h }} className="hidden w-auto dark:block" />
        </>
      )}
    </span>
  )
}

/**
 * Logo'nun sadece ikon kismi — loop ile nefes alan bir pulse animasyonu.
 * Page-loading gibi yerlerde marka spinner olarak kullanilir.
 */
export function LogoIcon({
  size = 48,
  loop = true,
}: {
  size?: number
  loop?: boolean
}) {
  // Aspect 198 / 229.66 — icon-only viewBox
  const w = Math.round(size * (198 / 229.66))

  const pulse = {
    scale: [0.88, 1, 0.88],
    opacity: [0.55, 1, 0.55],
  }
  const entry = { scale: 1, opacity: 1 }

  return (
    <motion.svg
      viewBox="0 0 198 229.66"
      width={w}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Sentroy"
      className="overflow-visible"
    >
      <motion.g
        style={{ transformOrigin: "99px 114.83px" }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={loop ? pulse : entry}
        transition={
          loop
            ? {
                duration: 1.6,
                repeat: Infinity,
                ease: [0.4, 0, 0.2, 1],
              }
            : { type: "spring", stiffness: 260, damping: 20 }
        }
      >
        <rect
          className="fill-[#F2EDD6] dark:fill-none"
          x="0"
          y="0"
          width="198"
          height="229.66"
          rx="28"
          ry="28"
        />
        <path
          d={ICON_D}
          fillRule="nonzero"
          className="fill-foreground dark:fill-[#F2EDD6]"
        />
      </motion.g>
    </motion.svg>
  )
}

"use client"

// ScrollScene — pinned-scrub sahne iskeleti.
//
// MİMARİ KURAL (jüri): pin container'ları ASLA transform almaz — position:sticky,
// transform'lu bir ata içinde kırılır. Kamera/koreografi hareketi daima İÇ
// katmanlara (children'ın kendi motion.div'lerine) uygulanır.
//
// Kullanım:
//   <ScrollScene heightVh={400}>
//     {(progress) => <motion.div style={{ x: useTransform(progress, ...) }} />}
//   </ScrollScene>
//
// `heightVh` toplam scroll uzunluğu; sticky viewport (100vh/dvh) içinde children,
// 0→1 arası MotionValue progress ile scrub edilir. `full=false` (mobil/reduced)
// durumunda sahneyi PIN'LEMEYİN — bu bileşeni hiç kullanmayıp poster render edin.

import { useRef, type ReactNode } from "react"
import { motion, useScroll, type MotionValue } from "framer-motion"

export function ScrollScene({
  heightVh,
  className,
  children,
  id,
}: {
  /** Pin süresi: kaç vh scroll boyunca sahne sabit kalır (örn. 400). */
  heightVh: number
  className?: string
  id?: string
  children: (progress: MotionValue<number>) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    // Sahne viewport'a tam oturduğunda 0, ayrıldığında 1.
    offset: ["start start", "end end"],
  })

  return (
    <section ref={ref} id={id} className={className} style={{ height: `${heightVh}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden supports-[height:100dvh]:h-dvh">
        {children(scrollYProgress)}
      </div>
    </section>
  )
}

/** Scrub edilen iç katman için kısayol — will-change yalnız görünürken. */
export const SceneLayer = motion.div

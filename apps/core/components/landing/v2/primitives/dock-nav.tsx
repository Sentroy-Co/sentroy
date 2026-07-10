"use client"

// DockNav — landing'in kalıcı anlatı omurgası: OS dock'unun marketing türevi.
// Aynı fisheye hissi (paylaşılan use-dock-magnify hook'u), üç ek görev:
//   1. Katalog: 12 ürün ikonu ilk saniyeden görünür (sönük başlar).
//   2. Koleksiyon: beat'i tamamlanan ürün kalıcı "yanar" (lit set'i).
//   3. Progress/nav: aktif ürün vurgusu + tıkla → ilgili sahneye scroll.
// "os" ikonu (12.) finale kadar gizli slottur; expose sahnesi light("os")
// çağırınca spring ile düşer ve sweep dalgası oynar.

import { useEffect, useRef, useState } from "react"
import { animate, motion, useMotionValue, type MotionValue } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@workspace/ui/lib/utils"
import { useDockMagnify } from "../../../os/use-dock-magnify"
import { LANDING_PRODUCTS, SCENE_ANCHORS, productLogoUrl, type LandingProduct } from "../data/products"
import { useLandingV2 } from "../landing-context"
import { scrollToSceneFraction } from "./lenis-store"

/** Ürünün SAHNE İÇİ anına scroll — yalnız sahne başına değil, pinned scrub'ta
 *  ürünün segmentine/merkezine iner (sceneOffset, products.ts tek kaynak). */
function scrollToProduct(product: LandingProduct) {
  scrollToSceneFraction(SCENE_ANCHORS[product.sceneTier], product.sceneOffset)
}

export function DockNav({
  productNames,
  className,
}: {
  /** id → görünen ad (i18n'den çözülmüş; tooltip + aria). */
  productNames: Record<string, string>
  className?: string
}) {
  const { lit, activeProductId, sweepSignal, dockHidden } = useLandingV2()
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const barRef = useRef<HTMLDivElement>(null)
  // Footer görünür olunca dock aşağı süzülüp gizlenir — footer linklerinin
  // üstüne binmez, final CTA sahnesinin altına "sarkmaz".
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let raf: number | null = null
    const update = () => {
      raf = null
      const footer = document.getElementById("lv2-footer")
      if (!footer) return
      setHidden(footer.getBoundingClientRect().top < window.innerHeight - 40)
    }
    const onScroll = () => {
      if (raf == null) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [])

  // Sweep: mouseX'i barın solundan sağına bir kez otomatik süpür — fisheye
  // dalgası kendini tanıtır; bitince gerçek imlece (∞ = nötr) döner.
  useEffect(() => {
    if (sweepSignal === 0) return
    const bar = barRef.current
    if (!bar) return
    const r = bar.getBoundingClientRect()
    const controls = animate(mouseX, [r.left - 40, r.right + 40], {
      duration: 1.1,
      ease: "easeInOut",
      onComplete: () => mouseX.set(Number.POSITIVE_INFINITY),
    })
    return () => controls.stop()
  }, [sweepSignal, mouseX])

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4",
        "transition-[transform,opacity] duration-500",
        // dockHidden: boot sekansı (yüzen ikonlar inene dek) — hidden: footer yakın.
        (hidden || dockHidden) && "translate-y-24 opacity-0",
        className,
      )}
    >
      <div
        ref={barRef}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        className={
          "pointer-events-auto flex h-[72px] items-end gap-2 rounded-[24px] border border-white/20 " +
          "max-w-[calc(100vw-2rem)] overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-x-visible " +
          "bg-gradient-to-b from-white/[0.14] to-white/[0.05] px-3 pb-2 " +
          "shadow-[0_10px_40px_-6px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] " +
          "backdrop-blur-2xl backdrop-saturate-150"
        }
      >
        {LANDING_PRODUCTS.map((p) => (
          <DockNavIcon
            key={p.id}
            product={p}
            name={productNames[p.id] ?? p.id}
            mouseX={mouseX}
            isLit={lit.has(p.id)}
            isActive={activeProductId === p.id}
          />
        ))}
      </div>
    </div>
  )
}

function DockNavIcon({
  product,
  name,
  mouseX,
  isLit,
  isActive,
}: {
  product: LandingProduct
  name: string
  mouseX: MotionValue<number>
  isLit: boolean
  isActive: boolean
}) {
  const { ref, size } = useDockMagnify(mouseX, { base: 40, max: 64, range: 110 })
  // OS dock ile ortak özel PNG logo; yoksa (yalnız "os") hugeicons glyph'i.
  const logoUrl = productLogoUrl(product.id)

  // 12. ikon (os): yanana dek slot boş görünür — finalde spring ile "düşer".
  const isOsFinale = product.sceneTier === "os"
  if (isOsFinale && !isLit) {
    return <span aria-hidden className="mb-[3px] h-10 w-10 shrink-0 rounded-[28%] border border-dashed border-white/15" />
  }

  return (
    <div className="group relative flex shrink-0 flex-col items-center justify-end">
      <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-lg bg-black/85 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        {name}
      </span>
      <motion.button
        ref={ref}
        type="button"
        onClick={() => scrollToProduct(product)}
        style={{ width: size, height: size }}
        initial={isOsFinale ? { y: -120, scale: 0.4, opacity: 0 } : false}
        animate={isOsFinale ? { y: 0, scale: 1, opacity: 1 } : undefined}
        transition={isOsFinale ? { type: "spring", stiffness: 320, damping: 20 } : undefined}
        whileTap={{ scale: 0.86 }}
        aria-label={name}
        className="relative"
      >
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden rounded-[28%] shadow-lg ring-1 ring-white/25",
            // Koleksiyon mekaniği: sönük → yanık. Filter animasyonu scrub'a değil
            // tek seferlik state geçişine bağlı (paint maliyeti kabul edilebilir).
            "transition-[filter,opacity] duration-700",
            isLit ? "opacity-100 saturate-100" : "opacity-40 saturate-[0.25]",
          )}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" draggable={false} className="pointer-events-none size-full object-cover select-none" />
          ) : (
            <span
              className="flex size-full items-center justify-center"
              style={{ background: `linear-gradient(150deg, ${product.color}, ${product.color}cc)` }}
            >
              <HugeiconsIcon icon={product.icon} className="size-[44%] text-white drop-shadow-md" strokeWidth={2} />
            </span>
          )}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-white/5 to-transparent" />
        </span>
      </motion.button>
      <span
        className={cn(
          "mt-1 size-1 rounded-full transition-colors duration-300",
          isActive ? "bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]" : isLit ? "bg-white/45" : "bg-transparent",
        )}
      />
    </div>
  )
}

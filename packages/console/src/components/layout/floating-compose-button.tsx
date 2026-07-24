"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, usePathname } from "next/navigation"
import { motion, useMotionValue, animate, type PanInfo } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { Edit01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Sentroy genelinde floating "compose mail" widget'ı. Tüm app'lerin
 * dashboard layout'una mount edilir; tıklama mail subdomain'ine
 * `?compose=1` ile yönlendirir (mail içindeyse aynı origin'de aynı path).
 * Sürüklenebilir, ekranın en yakın yatay kenarına (sol/sağ) magnetic
 * snap eder, dikey position'ı korur. Konum localStorage'a yazılır,
 * tüm app'lerde paylaşılır (subdomain bazlı izolasyon yok — kasıtlı,
 * widget her yerde aynı yerde "kalır" hissi versin).
 *
 * Drag mantığı: drag başlangıcında click guard açılır; drag sonunda
 * kapanır. Bu sayede kullanıcı sürüklerken yanlışlıkla mail compose
 * tetiklemez.
 */

const STORAGE_KEY = "sentroy.floatingCompose.position"
const BUTTON_SIZE = 56
const EDGE_PADDING = 16

interface StoredPosition {
  side: "left" | "right"
  /** viewport yüksekliğine göre 0-1 normalized y */
  yRatio: number
}

function loadPosition(): StoredPosition {
  if (typeof window === "undefined") return { side: "right", yRatio: 0.7 }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { side: "right", yRatio: 0.7 }
    const parsed = JSON.parse(raw) as StoredPosition
    if (
      (parsed.side === "left" || parsed.side === "right") &&
      typeof parsed.yRatio === "number" &&
      parsed.yRatio >= 0 &&
      parsed.yRatio <= 1
    ) {
      return parsed
    }
    return { side: "right", yRatio: 0.7 }
  } catch {
    return { side: "right", yRatio: 0.7 }
  }
}

function savePosition(pos: StoredPosition) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    // quota / privacy mode — ignore
  }
}

function snapX(side: "left" | "right"): number {
  if (typeof window === "undefined") return 0
  return side === "left"
    ? EDGE_PADDING
    : window.innerWidth - BUTTON_SIZE - EDGE_PADDING
}

function clampY(y: number): number {
  if (typeof window === "undefined") return y
  return Math.max(
    EDGE_PADDING + 60,
    Math.min(window.innerHeight - BUTTON_SIZE - EDGE_PADDING, y),
  )
}

export interface FloatingComposeButtonProps {
  /**
   * Mail uygulamasının absolute URL'i. Bu app mail değilse cross-app
   * navigation için kullanılır. Boşsa relative `/[lang]/d/[slug]/inbox`
   * (mail app içinde). Diğer app'ler için env'den geçilmeli.
   */
  mailAppUrl?: string
  /** Bu render mail app'inde mi? Eğer öyleyse cross-app link kullanma. */
  isMailApp?: boolean
  /** Erişim aria-label (i18n caller tarafından çözülür). */
  label?: string
  /**
   * Bu segment'lerde FAB gizlenir (ör. mail admin sayfaları:
   * domains/mailboxes/logs/webhooks/team/settings/access-tokens). Compose
   * mail bu sayfalarda bağlam dışı. `/d/[slug]/<segment>` path'inden çözülür.
   */
  hideOnSegments?: string[]
}

export function FloatingComposeButton({
  mailAppUrl = "",
  isMailApp = false,
  label = "Compose mail",
  hideOnSegments,
}: FloatingComposeButtonProps) {
  const params = useParams<{ lang: string; "company-slug": string }>()
  const lang = params?.lang || "en"
  const slug = params?.["company-slug"]
  const pathname = usePathname()

  // Vault dashboard'unda compose FAB anlamsız (env-vault key/secret CRUD;
  // mail context'i yok). vault.sentroy.com proxy → core'da
  // `/[lang]/d/[slug]/vault` path'ine düşüyor, bu yüzden pathname check
  // hem direct route hem subdomain proxy'i kapsıyor.
  const isVaultRoute = pathname?.endsWith(`/d/${slug}/vault`) ?? false

  // Admin/yapılandırma sayfalarında (caller `hideOnSegments` ile geçer) FAB
  // gizlenir. `/d/[slug]/<segment>/...` path'inin ilk segment'ini çözer.
  const currentSegment =
    slug && pathname
      ? (pathname.split(`/d/${slug}/`)[1]?.split(/[/?#]/)[0] ?? "")
      : ""
  const isHiddenSegment = hideOnSegments?.includes(currentSegment) ?? false

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [mounted, setMounted] = useState(false)
  const dragGuardRef = useRef(false)

  // Initial position — mount sonrası viewport ölçülerine göre yerleştir.
  useEffect(() => {
    if (typeof window === "undefined") return
    const pos = loadPosition()
    x.set(snapX(pos.side))
    y.set(clampY(pos.yRatio * window.innerHeight))
    setMounted(true)

    function onResize() {
      const stored = loadPosition()
      x.set(snapX(stored.side))
      y.set(clampY(stored.yRatio * window.innerHeight))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [x, y])

  function handleDragEnd(_e: unknown, info: PanInfo) {
    if (typeof window === "undefined") return
    const currentX = x.get() + info.offset.x
    const currentY = clampY(y.get() + info.offset.y)
    const mid = window.innerWidth / 2
    const side: "left" | "right" =
      currentX + BUTTON_SIZE / 2 < mid ? "left" : "right"
    const targetX = snapX(side)
    const yRatio = currentY / window.innerHeight
    savePosition({ side, yRatio })
    animate(x, targetX, {
      type: "spring",
      stiffness: 380,
      damping: 30,
    })
    animate(y, currentY, {
      type: "spring",
      stiffness: 380,
      damping: 30,
    })
    // Drag bittikten kısa süre sonra click serbest — Framer drag'i
    // bazen tap event'i fırlatır, bunu engelle.
    setTimeout(() => {
      dragGuardRef.current = false
    }, 50)
  }

  function handleClick(e: React.MouseEvent) {
    if (dragGuardRef.current) {
      e.preventDefault()
      return
    }
    if (!slug) return
    const inboxPath = `/${lang}/d/${slug}/inbox`
    if (isMailApp) {
      // Mail app içindeyiz: cross-origin değil. Inbox sayfasındaysak
      // doğrudan inbox-content'in lokal composer'ını tetikle. Başka
      // mail sayfasındaysak (settings/dashboard/etc.) inbox'a yönlendirmek
      // yerine global compose sheet event'ini dispatch et — sheet o
      // sayfada açılır, kullanıcı bağlamını kaybetmez.
      if (pathname === inboxPath) {
        window.dispatchEvent(new CustomEvent("sentroy:compose-open"))
      } else {
        window.dispatchEvent(new CustomEvent("sentroy:compose-open-global"))
      }
    } else {
      // Cross-app (storage / core → mail). Origin değiştiği için Next
      // router push yapamayız; full nav.
      const base = mailAppUrl.replace(/\/+$/, "")
      window.location.href = `${base}${inboxPath}?compose=1`
    }
  }

  if (!slug || !mounted || isVaultRoute || isHiddenSegment) return null

  return (
    <motion.button
      type="button"
      drag
      dragMomentum={false}
      dragElastic={0.05}
      onDragStart={() => {
        dragGuardRef.current = true
      }}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.06 }}
      style={{ x, y, width: BUTTON_SIZE, height: BUTTON_SIZE }}
      className={cn(
        "fixed top-0 left-0 z-50 flex items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
        "ring-1 ring-primary/40 backdrop-blur",
        "cursor-grab active:cursor-grabbing",
        "transition-shadow hover:shadow-xl hover:shadow-primary/40",
      )}
      aria-label={label}
    >
      <HugeiconsIcon icon={Edit01Icon} strokeWidth={2.2} className="size-6" />
    </motion.button>
  )
}

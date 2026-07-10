"use client"

import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Menu01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

/**
 * Ortak header kabuğu — sadece amblem (metin yok), yatayda ortalı ve header'dan
 * taşar (medalyon hissi). Sayfa aşağı scroll edilince tam-bar → floating "pill"
 * şekline morph eder ve amblem küçülür.
 *
 * `collapsible` (tools mega menü için): pill modda sol slot (mega menü) gizlenir,
 * yerine hamburger ikonu gelir; tıklanınca pill'i geçici olarak açıp (expanded)
 * mega menüyü gösterir. Üste scroll edilince sıfırlanır.
 */
export function HeaderShell({
  left,
  right,
  collapsible = false,
  emblemSrc = "/downloader-logo.png",
  emblemAlt = "Sentroy",
}: {
  left?: ReactNode
  right?: ReactNode
  collapsible?: boolean
  emblemSrc?: string
  emblemAlt?: string
}) {
  const [scrolled, setScrolled] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const s = window.scrollY > 40
      setScrolled(s)
      if (!s) setExpanded(false) // üstte normal tam-bar
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const pill = collapsible ? scrolled && !expanded : scrolled
  const showLeft = !collapsible || !scrolled || expanded

  return (
    <header data-app-chrome className="pointer-events-none sticky top-0 z-40 px-3">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex items-center gap-3 px-4 transition-all duration-300 ease-out",
          pill
            ? "mt-2.5 max-w-3xl rounded-full bg-background/70 py-1.5 shadow-xl ring-1 ring-border/50 backdrop-blur-md"
            : "mt-0 max-w-6xl rounded-none bg-transparent py-2.5",
        )}
      >
        {/* sol slot — collapsible'da pill modda hamburger, açıkken mega menü */}
        <div className="flex flex-1 items-center justify-start gap-2">
          {collapsible && scrolled ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              aria-label="Menu"
              aria-expanded={expanded}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted"
            >
              <HugeiconsIcon icon={expanded ? Cancel01Icon : Menu01Icon} strokeWidth={2} className="size-5" />
            </button>
          ) : null}
          {showLeft ? left : null}
        </div>

        {/* ortalı amblem — header'dan taşar, pill'de küçülür */}
        <a href="/" className="relative z-10 flex shrink-0 items-center justify-center" aria-label={emblemAlt}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={emblemSrc}
            alt={emblemAlt}
            className={cn(
              "object-contain drop-shadow-md transition-all duration-300 ease-out",
              pill ? "size-9" : "size-16",
            )}
          />
        </a>

        {/* sağ slot */}
        <div className="flex flex-1 items-center justify-end gap-2">{right}</div>
      </div>
    </header>
  )
}

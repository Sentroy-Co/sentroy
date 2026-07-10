"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"
import { PageActions } from "./page-actions"

/**
 * Docs page'in sağında sticky "On this page" TOC + page actions.
 *
 * Heading'leri runtime'da `<article>` DOM'undan tarar — her docs sayfası
 * `<Section id>` (= h2) ve `<Sub id>` (= h3) wrapper'larıyla yazıldığı
 * için id'ler bu wrapper'larda taşınıyor. h2/h3'ün kendi `id`'leri yok,
 * o yüzden seçicimiz parent wrapper'a göre.
 *
 * IntersectionObserver ile aktif başlık highlight; rootMargin
 * `-20% / -70%` viewport'un üst 1/5'lik bandında olanı "aktif" sayar
 * (Stripe / Vercel docs deneyiminden).
 *
 * Mobile'da gizli — yalnızca `lg+` ekran. PageActions her sayfada
 * burada renderlandığı için page komponentlerine inline koymaya
 * gerek yok.
 */

interface Heading {
  id: string
  text: string
  level: 2 | 3
}

function extractHeadings(article: HTMLElement): Heading[] {
  const headings: Heading[] = []
  const sections = article.querySelectorAll<HTMLElement>("section[id]")
  sections.forEach((section) => {
    const id = section.id
    const h2 = section.querySelector("h2")
    if (h2 && id) {
      headings.push({
        id,
        text: (h2.textContent ?? "").trim().replace(/#$/, "").trim(),
        level: 2,
      })
    }
    // Sub wrapper'lar `.mt-10` class'lı div'lerde — bunlar section
    // içindeki h3 grupları.
    section
      .querySelectorAll<HTMLElement>(":scope > div.mt-10[id], :scope div.mt-10[id]")
      .forEach((sub) => {
        if (!sub.id) return
        const h3 = sub.querySelector("h3")
        if (!h3) return
        headings.push({
          id: sub.id,
          text: (h3.textContent ?? "").trim().replace(/#$/, "").trim(),
          level: 3,
        })
      })
  })
  return headings
}

export function OnThisPage() {
  const pathname = usePathname()
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    // Client-side navigation'da layout mount kalıyor, page (children)
    // değişiyor. pathname dependency'siyle her route geçişinde yeni
    // article DOM'u tara. Bir tick bekle — Next.js DOM'u commit etmiş
    // olsun (route transition + paint sırası).
    let cancelled = false
    setActiveId(null)
    setHeadings([])
    const tick = requestAnimationFrame(() => {
      if (cancelled) return
      const article = document.querySelector("article")
      if (!article) return
      setHeadings(extractHeadings(article as HTMLElement))
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(tick)
    }
  }, [pathname])

  useEffect(() => {
    if (headings.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActiveId(visible.target.id)
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.25, 0.5, 1] },
    )
    headings.forEach((h) => {
      const el = document.getElementById(h.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [headings])

  // TOC tıklaması → smooth scroll (native anchor "pat diye" gidiyordu).
  function scrollToHash(e: React.MouseEvent, id: string) {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ behavior: "smooth" })
    window.history.pushState(null, "", `#${id}`)
  }

  return (
    <aside className="hidden lg:block">
      {/* Sticky + kendi içinde scroll — TOC uzunsa (ör. Auth Projects) ekran
          dışına taşıp kesilmesin (max-h + overflow-y-auto). */}
      <div className="sticky top-20 flex max-h-[calc(100vh-7rem)] flex-col gap-4 overflow-y-auto">
        <PageActions />
        {headings.length > 0 && (
          <nav aria-label="On this page" className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </div>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {headings.map((h) => {
                const isActive = activeId === h.id
                return (
                  <li
                    key={h.id}
                    className={cn(
                      h.level === 3 && "ml-3",
                    )}
                  >
                    <a
                      href={`#${h.id}`}
                      onClick={(e) => scrollToHash(e, h.id)}
                      className={cn(
                        "block border-l border-border py-0.5 pl-3 transition-colors",
                        isActive
                          ? "border-foreground text-foreground"
                          : "text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                      )}
                    >
                      {h.text}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
        )}
      </div>
    </aside>
  )
}

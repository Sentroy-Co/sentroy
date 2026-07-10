"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Logo } from "@workspace/console/components/shared/logo"
import { NAV_SECTIONS } from "../lib/nav"

const MenuIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
)

const CloseIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
)

const LlmFileIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="2" width="10" height="12" rx="1.5" />
    <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
  </svg>
)

const ExternalIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 3.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h7A1.5 1.5 0 0 0 12.5 12v-2" />
    <path d="M9.5 2.5H13.5V6.5M13.5 2.5L7.5 8.5" />
  </svg>
)

function isActive(pathname: string, href: string) {
  const [path, hash] = href.split("#")
  if (hash) return false
  return pathname === path
}

export function DocsSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Hash link tıklaması: bölüm bu sayfadaysa smooth scroll (App Router <Link>
  // aynı pathname'de yalnız-hash navigasyonunda güvenilir scroll etmiyordu →
  // "aynı kategoriden ikinci link çalışmıyor" bug'ı). Bölüm başka sayfadaysa
  // (el yok) <a> normal tam navigasyon yapar, hedef sayfada hash'e iner.
  function scrollToHash(e: React.MouseEvent, href: string) {
    const hash = href.split("#")[1]
    if (!hash) return
    const el = document.getElementById(hash)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ behavior: "smooth" })
    window.history.pushState(null, "", `#${hash}`)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={() => setOpen((v) => !v)}
        className="fixed left-3 top-3 z-30 flex size-9 items-center justify-center rounded-md border border-border bg-background/80 text-foreground shadow-sm backdrop-blur lg:hidden"
      >
        {open ? <CloseIcon className="size-4" /> : <MenuIcon className="size-4" />}
      </button>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 bg-background/60 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 flex w-[260px] -translate-x-full flex-col border-r border-border bg-background transition-transform lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        {/* Logo — pinned top (shrink-0, never scrolls) */}
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
          <Link
            href="/"
            className="flex items-center gap-2 text-foreground hover:opacity-80"
            aria-label="Sentroy"
          >
            <Logo size="sm" />
            <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Docs
            </span>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-5">
              <div className="px-2 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </div>
              <ul className="space-y-px">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href)
                  const isHash = item.href.includes("#")
                  const itemClass = cn(
                    "block rounded-md px-2 py-1.5 text-[13px] transition",
                    isHash
                      ? "pl-5 text-muted-foreground hover:text-foreground"
                      : active
                        ? "bg-muted font-medium text-foreground"
                        : "text-foreground hover:bg-muted/60",
                  )
                  // Cross-subdomain link → next/link prefetch + client-side
                  // nav anlamlı değil, plain <a> ile direkt navigate.
                  if (item.external) {
                    return (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={itemClass}
                        >
                          {item.label}
                        </a>
                      </li>
                    )
                  }
                  // Hash (aynı/başka sayfadaki bölüm) → plain <a> + JS smooth
                  // scroll (sağ TOC ile aynı davranış). <Link> DEĞİL: App Router
                  // yalnız-hash re-navigasyonunda scroll etmiyor.
                  if (isHash) {
                    return (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          onClick={(e) => scrollToHash(e, item.href)}
                          className={itemClass}
                        >
                          {item.label}
                        </a>
                      </li>
                    )
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={itemClass}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer — pinned bottom (shrink-0, always visible). The full
            plain-text docs mirror for LLMs stays one click away regardless
            of scroll position. */}
        <div className="shrink-0 space-y-2 border-t border-border p-3">
          <a
            href="/llms-full.txt"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2 text-[13px] font-medium text-foreground transition hover:bg-muted"
          >
            <LlmFileIcon className="size-3.5 text-muted-foreground" />
            <span>llms-full.txt</span>
            <ExternalIcon className="ml-auto size-3 text-muted-foreground" />
          </a>
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block px-2.5 text-[12px] text-muted-foreground transition hover:text-foreground"
          >
            ← Back to sentroy.com
          </Link>
        </div>
      </aside>
    </>
  )
}

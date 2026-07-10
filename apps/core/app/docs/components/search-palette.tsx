"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import { SEARCH_INDEX, type SearchEntry } from "../lib/search-index"

const SearchIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="7" cy="7" r="5" />
    <path d="m11 11 3 3" />
  </svg>
)

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/.test(navigator.platform)

type GroupedEntry = {
  group: string
  entries: SearchEntry[]
}

function groupAndFilter(query: string): GroupedEntry[] {
  const q = query.trim().toLowerCase()
  const filtered = !q
    ? SEARCH_INDEX
    : SEARCH_INDEX.filter((e) => {
        const haystack =
          `${e.label} ${e.description ?? ""} ${e.keywords ?? ""}`.toLowerCase()
        return haystack.includes(q)
      })

  const map = new Map<string, SearchEntry[]>()
  for (const e of filtered) {
    const list = map.get(e.group) ?? []
    list.push(e)
    map.set(e.group, list)
  }
  return [...map.entries()].map(([group, entries]) => ({ group, entries }))
}

export function SearchPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const grouped = useMemo(() => groupAndFilter(query), [query])
  const flat = useMemo(() => grouped.flatMap((g) => g.entries), [grouped])

  // Reset selection cursor when results change
  useEffect(() => {
    setActive(0)
  }, [query])

  // Hotkeys: Cmd/Ctrl+K toggles, "/" opens (when not typing in another input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === "/" && !open) {
        const target = e.target as HTMLElement | null
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  // Focus input + reset query whenever the palette opens
  useEffect(() => {
    if (!open) return
    setQuery("")
    setActive(0)
    const id = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(id)
  }, [open])

  const navigate = (href: string, external?: boolean) => {
    setOpen(false)
    // Cross-subdomain (https://...sentroy.com) hedefler için Next router
    // anlamlı değil; full window navigation gerekli.
    if (external || /^https?:\/\//i.test(href)) {
      window.location.href = href
      return
    }
    router.push(href)
  }

  // Listbox keyboard navigation while the palette is open
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(0, flat.length - 1)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      const target = flat[active]
      if (target) navigate(target.href, target.external)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 text-[12.5px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="Search docs"
      >
        <SearchIcon className="size-3.5" />
        <span className="flex-1 text-left">Search docs…</span>
        <kbd className="rounded border border-border bg-background px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Search docs</DialogTitle>
            <DialogDescription>
              Search Sentroy documentation by page, section, or keyword.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <SearchIcon className="size-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Type to search…"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              spellCheck={false}
              autoComplete="off"
            />
            <kbd className="rounded border border-border bg-muted/60 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {flat.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results.
              </div>
            ) : (
              grouped.map((g) => (
                <div key={g.group} className="mb-2 last:mb-0">
                  <div className="px-3 pb-1.5 pt-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.group}
                  </div>
                  <ul>
                    {g.entries.map((it) => {
                      const idx = flat.indexOf(it)
                      const isActive = idx === active
                      return (
                        <li key={it.href}>
                          <button
                            type="button"
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => navigate(it.href, it.external)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] transition",
                              isActive
                                ? "bg-muted text-foreground"
                                : "text-foreground/90",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{it.label}</div>
                              {it.description ? (
                                <div className="truncate text-[11.5px] text-muted-foreground">
                                  {it.description}
                                </div>
                              ) : null}
                            </div>
                            <span className="hidden font-mono text-[10.5px] text-muted-foreground sm:block">
                              {it.href.replace("/docs", "") || "/"}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-background px-1 py-px font-mono">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-background px-1 py-px font-mono">↵</kbd>
                open
              </span>
            </span>
            <span>{flat.length} result{flat.length === 1 ? "" : "s"}</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

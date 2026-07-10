"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  DashboardSquare01FreeIcons,
  TaskAdd01FreeIcons,
  ChartHistogramFreeIcons,
  Sun03FreeIcons,
  Moon02FreeIcons,
  ComputerFreeIcons,
  Logout01FreeIcons,
  Search01FreeIcons,
  Clock01FreeIcons,
} from "@hugeicons/core-free-icons"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@workspace/ui/components/command"
import { signOutAndRedirectToCore } from "@workspace/auth/client/auth-client"
import { useFetcher, useNavigate } from "@/lib/router-compat"
import { useUiStore } from "@/stores/ui-store"
import { TaskHoverCard } from "@/components/tasks/task-hover-card"

type SearchHit = {
  id: string
  identifier: string
  title: string
  url: string
  state: { id: string; name: string; type: string; color: string }
}

/**
 * Arama yanıtını normalize et. Search route'u `jsonSuccess({term, results})`
 * zarfıyla (`{data: {...}}`) döner; triage'ın çıplak `{ok, results}` şekli de
 * geriye-uyumluluk için desteklenir.
 */
function extractResults(raw: unknown): SearchHit[] {
  if (!raw || typeof raw !== "object") return []
  const obj = raw as Record<string, unknown>
  const payload =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : obj
  if (payload.ok === false) return []
  return Array.isArray(payload.results) ? (payload.results as SearchHit[]) : []
}

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPalette)
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const t = useTranslations("linearLite.layout.palette")
  // Tema etiketleri theme-toggle ile ortak namespace'ten gelir.
  const tTheme = useTranslations("linearLite.theme")
  const params = useParams<{ lang?: string }>()
  const [query, setQuery] = useState("")
  const fetcher = useFetcher()
  const recentSearches = useUiStore((s) => s.recentSearches)
  const recentCards = useUiStore((s) => s.recentCards)
  const addRecentSearch = useUiStore((s) => s.addRecentSearch)
  const addRecentCard = useUiStore((s) => s.addRecentCard)
  const clearRecentSearches = useUiStore((s) => s.clearRecentSearches)
  const clearRecentCards = useUiStore((s) => s.clearRecentCards)
  const showHistory =
    query.trim().length < 2 &&
    (recentSearches.length > 0 || recentCards.length > 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        setOpen(!useUiStore.getState().commandPaletteOpen)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setOpen])

  // Dialog kapatılınca query temizle.
  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  // Debounced Linear arama. 2 karakter altı atla; 200ms bekle ki her
  // tuş bir istek atılmasın. `/api/search` shim'in resolveAction'ı ile
  // `${apiBase}/search`e çevrilir.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) return
    const id = window.setTimeout(() => {
      void fetcher.load(`/api/search?q=${encodeURIComponent(q)}`)
    }, 200)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open])

  const results = extractResults(fetcher.data)
  const searching = fetcher.state !== "idle"

  const go = (to: string) => () => {
    setOpen(false)
    navigate(to)
  }

  const submitLogout = () => {
    setOpen(false)
    const lang = typeof params?.lang === "string" ? params.lang : "en"
    void signOutAndRedirectToCore(lang)
  }

  const pickTheme = (theme: "light" | "dark" | "system") => () => {
    setTheme(theme)
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="sm:max-w-2xl">
      <Command>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={t("placeholder")}
        />

        {/* Geçmiş: yalnız arama yokken yatay-scroll önizleme şeritleri */}
        {showHistory ? (
          <div className="flex flex-col gap-3 border-b border-border/60 px-3 py-3">
            {recentSearches.length > 0 ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">
                    <HugeiconsIcon
                      icon={Search01FreeIcons as IconSvgElement}
                      size={11}
                      strokeWidth={2}
                    />
                    {t("recentSearches")}
                  </span>
                  <button
                    type="button"
                    onClick={clearRecentSearches}
                    className="text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground"
                  >
                    {t("clear")}
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:border-border hover:bg-accent/50"
                    >
                      <HugeiconsIcon
                        icon={Search01FreeIcons as IconSvgElement}
                        size={11}
                        strokeWidth={2}
                        className="text-muted-foreground"
                      />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {recentCards.length > 0 ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">
                    <HugeiconsIcon
                      icon={Clock01FreeIcons as IconSvgElement}
                      size={11}
                      strokeWidth={2}
                    />
                    {t("recentCards")}
                  </span>
                  <button
                    type="button"
                    onClick={clearRecentCards}
                    className="text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground"
                  >
                    {t("clear")}
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {recentCards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        addRecentCard(c) // tekrar tıklananı öne al
                        setOpen(false)
                        navigate(`/tasks/${c.id}`)
                      }}
                      className="inline-flex max-w-60 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs transition-colors hover:border-border hover:bg-accent/50"
                    >
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                        {c.identifier}
                      </span>
                      <span className="truncate text-foreground/80">
                        {c.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <CommandList className="max-h-[440px]">
          <CommandEmpty>
            {searching ? t("searching") : t("empty")}
          </CommandEmpty>

          {results.length > 0 ? (
            <>
              <CommandGroup heading={t("groupTasks")}>
                {results.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`${r.identifier} ${r.title}`}
                    onSelect={() => {
                      // Aratılıp seçilen → hem terimi hem kartı geçmişe yaz.
                      addRecentSearch(query)
                      addRecentCard({
                        id: r.id,
                        identifier: r.identifier,
                        title: r.title,
                        color: r.state.color,
                      })
                      setOpen(false)
                      navigate(`/tasks/${r.id}`)
                    }}
                  >
                    <TaskHoverCard issueId={r.id}>
                      <span className="flex w-full items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: r.state.color }}
                        />
                        <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                          {r.identifier}
                        </span>
                        <span className="truncate">{r.title}</span>
                      </span>
                    </TaskHoverCard>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          <CommandGroup heading={t("groupPages")}>
            <CommandItem onSelect={go("/")}>
              <HugeiconsIcon
                icon={DashboardSquare01FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("dashboard")}
              <CommandShortcut>g d</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={go("/metrics")}>
              <HugeiconsIcon
                icon={ChartHistogramFreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("metrics")}
            </CommandItem>
            <CommandItem onSelect={go("/tasks/new")}>
              <HugeiconsIcon
                icon={TaskAdd01FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("newTask")}
              <CommandShortcut>c</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("groupTheme")}>
            <CommandItem onSelect={pickTheme("light")}>
              <HugeiconsIcon
                icon={Sun03FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {tTheme("light")}
            </CommandItem>
            <CommandItem onSelect={pickTheme("dark")}>
              <HugeiconsIcon
                icon={Moon02FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {tTheme("dark")}
            </CommandItem>
            <CommandItem onSelect={pickTheme("system")}>
              <HugeiconsIcon
                icon={ComputerFreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {tTheme("system")}
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("groupAccount")}>
            <CommandItem onSelect={submitLogout}>
              <HugeiconsIcon
                icon={Logout01FreeIcons as IconSvgElement}
                size={14}
                strokeWidth={2}
              />
              {t("logout")}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

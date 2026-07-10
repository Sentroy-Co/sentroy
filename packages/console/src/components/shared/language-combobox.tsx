"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Tick02Icon, Globe02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Paylaşılan dil seçici — globe ikonu + üstünde aktif dil kodunu notification
 * badge gibi gösteren kompakt trigger, aranabilir combobox. UI-only: locale
 * değişimini `onSelect` callback'i ile çağıran uygulamaya bırakır (her app kendi
 * next-intl routing'ini kullanır — downloader 10 dil, core 2).
 * NOT: bayrak kullanılmaz (tasarım tercihi) — dil kodu badge'i + globe yeterli affordans.
 */
const LANG_META: Record<string, { label: string }> = {
  en: { label: "English" },
  tr: { label: "Türkçe" },
  es: { label: "Español" },
  pt: { label: "Português" },
  de: { label: "Deutsch" },
  fr: { label: "Français" },
  ru: { label: "Русский" },
  ar: { label: "العربية" },
  hi: { label: "हिन्दी" },
  id: { label: "Bahasa Indonesia" },
}

export interface LanguageComboboxProps {
  current: string
  locales: readonly string[]
  onSelect: (locale: string) => void
  className?: string
  align?: "start" | "center" | "end"
}

export function LanguageCombobox({
  current,
  locales,
  onSelect,
  className,
  align = "end",
}: LanguageComboboxProps) {
  const [open, setOpen] = useState(false)
  const cur = LANG_META[current] ?? { label: current.toUpperCase() }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("h-9 gap-1.5 px-2.5", className)}
            aria-label={`Language: ${cur.label}`}
          >
            {/* Globe + üstünde aktif dil kodu (notification badge stili) */}
            <span className="relative flex items-center justify-center">
              <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} className="size-[18px] opacity-80" />
              {/* WCAG AA: beyaz metin marka-kırmızısı #FF1744 üzerinde 3.86:1 (fail).
                  #D5002E ≈5.4:1 (pass) ve 9px'te aynı marka kırmızısı okunur. */}
              <span className="absolute -right-2 -top-2 flex min-w-[15px] items-center justify-center rounded-full bg-[#D5002E] px-1 text-[9px] font-bold uppercase leading-[15px] tracking-tight text-white shadow-sm">
                {current.toUpperCase()}
              </span>
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className="size-3.5 opacity-50"
            />
          </Button>
        }
      />
      <PopoverContent align={align} className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Search language…" />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              {locales.map((l) => {
                const m = LANG_META[l] ?? { label: l.toUpperCase() }
                return (
                  <CommandItem
                    key={l}
                    value={`${l} ${m.label}`}
                    onSelect={() => {
                      onSelect(l)
                      setOpen(false)
                    }}
                    className="gap-2"
                  >
                    <span className="flex-1">{m.label}</span>
                    {l === current ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from "@workspace/ui/components/navigation-menu"

/** Server'dan gelen serileştirilebilir mega menü verisi. */
export interface MegaMenuTool {
  slug: string
  title: string
  description: string
  href: string
  status: "live" | "soon"
}
export interface MegaMenuCategory {
  key: string
  label: string
  tools: MegaMenuTool[]
}

/**
 * tools.sentroy.com mega menü — kategori başına bir trigger, açılır panelde o
 * kategorinin araçları (başlık + açıklama). base-ui navigation-menu üzerine.
 * "soon" araçlar "Yakında" rozetiyle işaretlenir (link yine sayfasına gider).
 */
export function MegaMenu({
  categories,
  soonLabel,
}: {
  categories: MegaMenuCategory[]
  soonLabel: string
}) {
  if (categories.length === 0) return null
  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList>
        {categories.map((cat) => (
          <NavigationMenuItem key={cat.key}>
            <NavigationMenuTrigger>{cat.label}</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-[340px] gap-1">
                {cat.tools.map((tool) => (
                  <li key={tool.slug}>
                    <NavigationMenuLink
                      href={tool.href}
                      className="flex flex-col items-start gap-0.5 !rounded-2xl p-3"
                    >
                      <span className="flex w-full items-center gap-2 font-medium text-foreground">
                        {tool.title}
                        {tool.status === "soon" ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {soonLabel}
                          </span>
                        ) : null}
                        <HugeiconsIcon
                          icon={ArrowUpRight01Icon}
                          strokeWidth={2}
                          className="ms-auto size-3.5 text-muted-foreground"
                        />
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {tool.description}
                      </span>
                    </NavigationMenuLink>
                  </li>
                ))}
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  )
}

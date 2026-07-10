"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

interface QuickstartTab {
  id: string
  label: string
  /** Filename hint, e.g. `auth.ts`. */
  filename: string
  /** Language for the syntax block (used for styling, not real highlighting). */
  language: string
  code: string
}

interface QuickstartTabsProps {
  tabs: QuickstartTab[]
  /** Heading shown above the tab list. */
  title: string
}

export function QuickstartTabs({ tabs, title }: QuickstartTabsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function copy(id: string, code: string) {
    navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <Tabs defaultValue={tabs[0]?.id} className="flex flex-col gap-0">
        <TabsList className="mx-5 mt-3 w-fit shrink-0">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="px-5 pb-5">
            <div className="overflow-hidden rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 px-3 py-1.5">
                <code className="font-mono text-[11px] text-muted-foreground">
                  {tab.filename}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => copy(tab.id, tab.code)}
                  title="Copy"
                  className="size-7"
                >
                  <HugeiconsIcon
                    icon={copiedId === tab.id ? Tick02Icon : Copy01Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                </Button>
              </div>
              <pre
                className={cn(
                  "max-h-[28rem] overflow-x-auto overflow-y-auto p-4 font-mono text-[12.5px] leading-relaxed",
                )}
                data-language={tab.language}
              >
                <code>{tab.code}</code>
              </pre>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

"use client"

import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

const CopyIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M3 11V3.5C3 2.67157 3.67157 2 4.5 2H11" />
  </svg>
)

const CheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 8.5L6.5 12L13 4" />
  </svg>
)

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy code"}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className={cn(
        "absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100",
        className,
      )}
    >
      {copied ? <CheckIcon className="size-3.5 text-emerald-500" /> : <CopyIcon className="size-3.5" />}
    </button>
  )
}

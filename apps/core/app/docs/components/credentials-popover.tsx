"use client"

import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { useDocsStore } from "../lib/store"
import { cn } from "@workspace/ui/lib/utils"

const KeyIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6" />
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
  </svg>
)

const EyeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export function CredentialsPopover() {
  const token = useDocsStore((s) => s.token)
  const slug = useDocsStore((s) => s.companySlug)
  const setToken = useDocsStore((s) => s.setToken)
  const setSlug = useDocsStore((s) => s.setCompanySlug)
  const reset = useDocsStore((s) => s.reset)

  const [show, setShow] = useState(false)

  const isSet = Boolean(token || slug)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "relative flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium transition",
              isSet
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <KeyIcon className="size-3.5" />
            <span className="hidden sm:inline">Credentials</span>
            {isSet ? (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-background" />
            ) : null}
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[320px] rounded-xl border border-border bg-popover p-4 shadow-lg outline-none"
      >
        <div className="mb-3">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Your credentials
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Stored locally in your browser. Every code sample on the docs
            site uses these values.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Company slug
            </label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-company"
              className="h-9 rounded-md font-mono text-[12.5px]"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Access token
            </label>
            <div className="relative">
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="stk_..."
                type={show ? "text" : "password"}
                className="h-9 rounded-md pr-9 font-mono text-[12.5px]"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                aria-label={show ? "Hide token" : "Show token"}
                onClick={() => setShow((v) => !v)}
                className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                {show ? (
                  <EyeOffIcon className="size-3.5" />
                ) : (
                  <EyeIcon className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">
            {isSet ? "Active in code samples" : "Defaults shown"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isSet}
            onClick={reset}
            className="h-7 px-2 text-[12px]"
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

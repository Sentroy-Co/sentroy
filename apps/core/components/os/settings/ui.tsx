"use client"

import { useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"

type IconType = typeof ArrowRight01Icon

/** macOS System Settings tarzı pane primitiv'leri — hepsi select-none. */

export function Pane({ children }: { children: ReactNode }) {
  return <div className="h-full select-none overflow-y-auto bg-muted/20 px-5 py-5">{children}</div>
}

export function PaneTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 text-xl font-semibold text-foreground">{children}</h2>
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 mt-6 px-1 text-xs font-medium text-muted-foreground first:mt-0">{children}</p>
}

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl bg-card ring-1 ring-border/60", className)}>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  )
}

export function Row({
  icon,
  iconColor,
  label,
  description,
  right,
  onClick,
  danger,
}: {
  icon?: IconType
  iconColor?: string
  label: ReactNode
  description?: ReactNode
  right?: ReactNode
  onClick?: () => void
  danger?: boolean
}) {
  const interactive = !!onClick
  const content = (
    <>
      {icon ? (
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm"
          style={{ background: iconColor }}
        >
          <HugeiconsIcon icon={icon} className="size-4" strokeWidth={2} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", danger ? "font-medium text-red-500" : "text-foreground")}>{label}</div>
        {description ? <div className="truncate text-xs text-muted-foreground">{description}</div> : null}
      </div>
      {right ? <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">{right}</div> : null}
      {interactive ? (
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground/50" strokeWidth={2} />
      ) : null}
    </>
  )
  if (interactive) {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]">
        {content}
      </button>
    )
  }
  return <div className="flex w-full items-center gap-3 px-3.5 py-2.5">{content}</div>
}

export function EditRow({
  label,
  value,
  placeholder,
  multiline,
  dialogTitle,
  editable = true,
  validate,
  onSave,
}: {
  label: string
  value: string
  placeholder?: string
  multiline?: boolean
  dialogTitle?: string
  editable?: boolean
  validate?: (v: string) => string | null
  onSave: (v: string) => Promise<void>
}) {
  const t = useTranslations("os")
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function openDialog() {
    setDraft(value)
    setErr(null)
    setOpen(true)
  }
  async function save() {
    const v = draft.trim()
    const e = validate?.(v) ?? null
    if (e) {
      setErr(e)
      return
    }
    setSaving(true)
    try {
      await onSave(v)
      setOpen(false)
    } catch (x) {
      setErr((x as Error)?.message || t("common.couldNotSave"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Row
        label={label}
        onClick={editable ? openDialog : undefined}
        right={
          <span className={cn("max-w-[220px] truncate", !value && "text-muted-foreground/50")}>
            {value || placeholder || "—"}
          </span>
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="select-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle || label}</DialogTitle>
          </DialogHeader>
          {multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
              className="min-h-24 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} autoFocus />
          )}
          {err ? <p className="text-xs text-red-500">{err}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ToggleRow({
  icon,
  iconColor,
  label,
  description,
  checked,
  onChange,
}: {
  icon?: IconType
  iconColor?: string
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Row
      icon={icon}
      iconColor={iconColor}
      label={label}
      description={description}
      right={<Switch checked={checked} onCheckedChange={onChange} />}
    />
  )
}

/** Kullanım çubuğu (plan limitleri). */
export function UsageBar({ label, used, limit, format }: { label: string; used: number; limit: number; format?: (n: number) => string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const fmt = format ?? ((n: number) => String(n))
  return (
    <div className="px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {fmt(used)} {limit > 0 ? `/ ${fmt(limit)}` : ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function PaneLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="size-7 animate-spin rounded-full border-2 border-muted border-t-foreground/40" />
    </div>
  )
}

export function PaneNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full select-none items-center justify-center px-8 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

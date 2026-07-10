"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ArrowDown01FreeIcons,
  Search01FreeIcons,
} from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

export type ChipItem = {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  swatch?: string
  /**
   * Optional grouping: if set, this item is rendered as a child under
   * the parent group header (id match). If item is itself a group
   * (isGroup=true), it becomes a section heading + remains selectable.
   */
  parentId?: string | null
  isGroup?: boolean
}

type CommonProps = {
  triggerIcon: React.ReactNode
  placeholder: string
  items: ChipItem[]
  searchable?: boolean
  emptyText?: string
  className?: string
}

type Props =
  | (CommonProps & {
      multi?: false
      valueId: string | null
      onChange: (id: string | null) => void
      allowClear?: boolean
      clearLabel?: string
    })
  | (CommonProps & {
      multi: true
      valueIds: string[]
      onChange: (ids: string[]) => void
    })

export function TaskFormChip(props: Props) {
  const t = useTranslations("linearLite.tasks.chip")
  const {
    triggerIcon,
    placeholder,
    items,
    searchable = items.length > 6,
    emptyText,
    className,
  } = props

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const resolvedEmptyText = emptyText ?? t("empty")

  const filtered = useMemo(() => {
    if (!query) return items
    const q = query.toLowerCase()
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q),
    )
  }, [items, query])

  // Organise into root / group sections. If any item has parentId or
  // isGroup hints, render hierarchical; otherwise plain list.
  const hierarchical = useMemo(
    () => items.some((i) => i.isGroup || i.parentId),
    [items],
  )

  const sections = useMemo(() => {
    if (!hierarchical) return null
    const groups = new Map<string, ChipItem>()
    const children = new Map<string, ChipItem[]>()
    const roots: ChipItem[] = []
    for (const i of filtered) {
      if (i.isGroup) groups.set(i.id, i)
    }
    for (const i of filtered) {
      if (i.parentId && groups.has(i.parentId)) {
        const arr = children.get(i.parentId) ?? []
        arr.push(i)
        children.set(i.parentId, arr)
      } else if (!i.isGroup) {
        roots.push(i)
      }
    }
    return {
      roots,
      orderedGroups: Array.from(groups.values()).sort((a, b) =>
        a.label.localeCompare(b.label, "tr"),
      ),
      children,
    }
  }, [filtered, hierarchical])

  const isMulti = props.multi === true
  const selectedIds = isMulti
    ? props.valueIds
    : props.valueId
      ? [props.valueId]
      : []

  const selectedItems = items.filter((i) => selectedIds.includes(i.id))

  const triggerLabel = (() => {
    if (selectedItems.length === 0) return placeholder
    if (!isMulti) return selectedItems[0].label
    if (selectedItems.length === 1) return selectedItems[0].label
    return t("selected_count", { count: selectedItems.length })
  })()

  const triggerSwatch =
    !isMulti && selectedItems[0]?.swatch ? selectedItems[0].swatch : null

  const toggle = (id: string) => {
    if (isMulti) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
      props.onChange(next)
    } else {
      props.onChange(id)
      setOpen(false)
    }
  }

  const onClear = () => {
    if (isMulti) props.onChange([])
    else props.onChange(null)
    setOpen(false)
  }

  const hasSelection = selectedItems.length > 0
  const allowClear = isMulti
    ? selectedItems.length > 0
    : (props.allowClear ?? false) && hasSelection

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setQuery("")
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "group inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2.5 text-xs font-medium transition-colors",
              "hover:border-border hover:bg-accent/40",
              hasSelection
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
              className,
            )}
          >
            {triggerSwatch ? (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: triggerSwatch }}
              />
            ) : (
              <span className="shrink-0 text-muted-foreground">
                {triggerIcon}
              </span>
            )}
            <span className="max-w-[160px] truncate">{triggerLabel}</span>
            {isMulti && selectedItems.length > 1 ? (
              <span className="rounded-md bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                {selectedItems.length}
              </span>
            ) : null}
            <HugeiconsIcon
              icon={ArrowDown01FreeIcons as IconSvgElement}
              size={11}
              strokeWidth={2}
              className="text-muted-foreground/70 transition-transform group-data-[state=open]:rotate-180"
            />
          </button>
        }
      />
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 gap-1 p-1.5"
      >
        {searchable ? (
          <div className="flex items-center gap-2 border-b border-border/40 px-2 pb-2">
            <HugeiconsIcon
              icon={Search01FreeIcons as IconSvgElement}
              size={12}
              strokeWidth={2}
              className="text-muted-foreground"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        ) : null}

        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {resolvedEmptyText}
            </p>
          ) : sections ? (
            <>
              {sections.roots.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  checked={selectedIds.includes(item.id)}
                  onToggle={() => toggle(item.id)}
                />
              ))}
              {sections.orderedGroups.map((group) => {
                const kids = sections.children.get(group.id) ?? []
                if (kids.length === 0 && !filtered.includes(group)) return null
                return (
                  <div key={group.id} className="flex flex-col">
                    <div className="mt-1 mb-0.5 flex items-center gap-2 px-2 pt-1">
                      {group.swatch ? (
                        <span
                          className="size-1.5 shrink-0 rounded-full opacity-80"
                          style={{ backgroundColor: group.swatch }}
                          aria-hidden
                        />
                      ) : null}
                      <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/80 uppercase">
                        {group.label}
                      </span>
                    </div>
                    {kids.map((child) => (
                      <ItemRow
                        key={child.id}
                        item={child}
                        checked={selectedIds.includes(child.id)}
                        onToggle={() => toggle(child.id)}
                        indent
                      />
                    ))}
                    {kids.length === 0 ? (
                      <p className="px-3 py-1 pl-6 text-[10px] text-muted-foreground/60">
                        {t("no_labels_in_group")}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </>
          ) : (
            filtered.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                checked={selectedIds.includes(item.id)}
                onToggle={() => toggle(item.id)}
              />
            ))
          )}
        </div>

        {allowClear ? (
          <button
            type="button"
            onClick={onClear}
            className="mt-1 w-full rounded-md border-t border-border/40 px-3 py-1.5 text-center text-[11px] text-muted-foreground transition-colors hover:text-destructive"
          >
            {isMulti
              ? t("clear_all")
              : (props.clearLabel ?? t("clear"))}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function ItemRow({
  item,
  checked,
  onToggle,
  indent = false,
}: {
  item: ChipItem
  checked: boolean
  onToggle: () => void
  indent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group/item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        "hover:bg-accent/60",
        checked && "bg-accent/40",
        indent && "pl-5",
      )}
    >
      {item.swatch ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: item.swatch }}
        />
      ) : item.icon ? (
        <span className="shrink-0 text-muted-foreground group-hover/item:text-foreground">
          {item.icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0">
        <span className="truncate font-medium text-foreground">
          {item.label}
        </span>
        {item.description ? (
          <span className="truncate text-[10px] text-muted-foreground">
            {item.description}
          </span>
        ) : null}
      </span>
      {checked ? <span className="text-foreground/80">✓</span> : null}
    </button>
  )
}

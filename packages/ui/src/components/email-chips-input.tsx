"use client"

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react"
import { cn } from "@workspace/ui/lib/utils"

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_VISIBLE_CHIPS = 2
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const POPULAR_PROVIDERS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "protonmail.com",
  "aol.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
]

// ── Types ───────────────────────────────────────────────────────────────────

export interface ContactSuggestion {
  email: string
  name?: string
}

export interface EmailChipsInputProps {
  value: string[]
  onChange: (emails: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Fetch contact suggestions for autocomplete */
  onSearch?: (query: string) => Promise<ContactSuggestion[]>
}

// ── Component ───────────────────────────────────────────────────────────────

export function EmailChipsInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  onSearch,
}: EmailChipsInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [providerSuggestions, setProviderSuggestions] = useState<string[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const overflowCount = !focused && value.length > MAX_VISIBLE_CHIPS
    ? value.length - MAX_VISIBLE_CHIPS
    : 0

  const containerRef = useRef<HTMLDivElement>(null)
  const chipsRowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const allSuggestions: ContactSuggestion[] = [
    ...suggestions,
    ...providerSuggestions
      .filter((p) => !suggestions.some((s) => s.email.endsWith(p)))
      .map((p) => {
        const localPart = inputValue.split("@")[0]
        return { email: `${localPart}@${p}` }
      }),
  ].filter((s) => !value.includes(s.email))

  const showDropdown =
    focused && allSuggestions.length > 0 && inputValue.length > 0

  // ── Chip management ───────────────────────────────────────────────────────

  const addEmail = useCallback(
    (raw: string) => {
      const email = raw.trim().toLowerCase()
      if (!email) return false
      if (!EMAIL_RE.test(email)) return false
      if (value.includes(email)) return false
      onChange([...value, email])
      return true
    },
    [value, onChange]
  )

  const removeEmail = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [value, onChange]
  )

  function commitInput() {
    if (addEmail(inputValue)) {
      setInputValue("")
      setSuggestions([])
      setProviderSuggestions([])
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault()

      if (showDropdown && highlightedIndex >= 0) {
        selectSuggestion(allSuggestions[highlightedIndex])
        return
      }

      commitInput()
      return
    }

    if (e.key === "Tab" && inputValue.trim()) {
      // Accept highlighted suggestion or commit input
      if (showDropdown && highlightedIndex >= 0) {
        e.preventDefault()
        selectSuggestion(allSuggestions[highlightedIndex])
        return
      }
      if (EMAIL_RE.test(inputValue.trim())) {
        e.preventDefault()
        commitInput()
      }
      return
    }

    if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      e.preventDefault()
      const lastEmail = value[value.length - 1]
      onChange(value.slice(0, -1))
      setInputValue(lastEmail)
      return
    }

    if (e.key === "ArrowDown" && showDropdown) {
      e.preventDefault()
      setHighlightedIndex((prev) =>
        prev < allSuggestions.length - 1 ? prev + 1 : 0
      )
      return
    }

    if (e.key === "ArrowUp" && showDropdown) {
      e.preventDefault()
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : allSuggestions.length - 1
      )
      return
    }

    if (e.key === "Escape") {
      setSuggestions([])
      setProviderSuggestions([])
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text")
    const emails = pasted.split(/[\s,;]+/).filter((s) => EMAIL_RE.test(s.trim()))
    if (emails.length > 0) {
      e.preventDefault()
      const newEmails = emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => !value.includes(e))
      if (newEmails.length > 0) {
        onChange([...value, ...newEmails])
      }
    }
  }

  // ── Suggestions ───────────────────────────────────────────────────────────

  function selectSuggestion(s: ContactSuggestion) {
    if (!value.includes(s.email)) {
      onChange([...value, s.email])
    }
    setInputValue("")
    setSuggestions([])
    setProviderSuggestions([])
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  // Fetch contacts + provider suggestions as user types
  useEffect(() => {
    if (!inputValue.trim()) {
      setSuggestions([])
      setProviderSuggestions([])
      setHighlightedIndex(-1)
      return
    }

    // Provider suggestions after @
    const atIndex = inputValue.indexOf("@")
    if (atIndex >= 0) {
      const domainPart = inputValue.slice(atIndex + 1).toLowerCase()
      if (domainPart && !domainPart.includes(".")) {
        setProviderSuggestions(
          POPULAR_PROVIDERS.filter((p) => p.startsWith(domainPart))
        )
      } else if (domainPart) {
        setProviderSuggestions(
          POPULAR_PROVIDERS.filter((p) => p.includes(domainPart))
        )
      } else {
        setProviderSuggestions(POPULAR_PROVIDERS.slice(0, 5))
      }
    } else {
      setProviderSuggestions([])
    }

    // Contact search with debounce
    if (onSearch && inputValue.length >= 2) {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const results = await onSearch(inputValue)
          setSuggestions(results)
        } catch {
          setSuggestions([])
        }
      }, 250)
    } else {
      setSuggestions([])
    }

    setHighlightedIndex(-1)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [inputValue, onSearch])

  // ── Focus handling ────────────────────────────────────────────────────────

  function handleContainerClick() {
    if (!disabled) {
      setFocused(true)
      inputRef.current?.focus()
    }
  }

  function handleBlur(e: React.FocusEvent) {
    // Don't blur if clicking inside the container or suggestions
    if (containerRef.current?.contains(e.relatedTarget as Node)) return

    // Commit anything in the input
    if (inputValue.trim() && EMAIL_RE.test(inputValue.trim())) {
      addEmail(inputValue)
      setInputValue("")
    }

    setFocused(false)
    setSuggestions([])
    setProviderSuggestions([])
    setHighlightedIndex(-1)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Main container */}
      <div
        onClick={handleContainerClick}
        className={cn(
          "flex min-h-[2.25rem] w-full cursor-text items-start gap-1 rounded-3xl border border-transparent bg-input/20 px-2 py-1 text-sm transition-[color,box-shadow,background-color]",
          focused && "border-ring ring-3 ring-ring/30",
          disabled && "pointer-events-none opacity-50",
          !focused && "overflow-hidden max-h-[2.25rem]",
          focused && "flex-wrap",
        )}
      >
        {/* Chips row */}
        <div
          ref={chipsRowRef}
          className={cn(
            "flex items-center gap-1",
            focused && "flex-wrap",
            !focused && "min-w-0 overflow-hidden",
          )}
        >
          {value.map((email, i) => (
            <span
              key={email}
              data-chip
              style={
                !focused && i >= MAX_VISIBLE_CHIPS
                  ? { display: "none" }
                  : undefined
              }
              className="group/chip relative inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-secondary-foreground transition-colors border border-muted/60 hover:bg-muted/80"
            >
              <span className="max-w-[180px] truncate">{email}</span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation()
                  removeEmail(i)
                }}
                className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-foreground/10 group-hover/chip:opacity-100"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  className="fill-current"
                >
                  <path d="M1.17 0.23a0.67 0.67 0 0 0-0.94 0.94L3.06 4 0.23 6.83a0.67 0.67 0 0 0 0.94 0.94L4 4.94l2.83 2.83a0.67 0.67 0 0 0 0.94-0.94L4.94 4l2.83-2.83a0.67 0.67 0 0 0-0.94-0.94L4 3.06z" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        {/* Overflow counter (when blurred) */}
        {!focused && overflowCount > 0 && (
          <button
            type="button"
            onClick={handleContainerClick}
            className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/80"
          >
            +{overflowCount}
          </button>
        )}

        {/* Text input (visible when focused) */}
        {focused && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
            placeholder={value.length === 0 ? placeholder : ""}
            disabled={disabled}
            className="min-w-[120px] flex-1 border-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        )}

        {/* Placeholder when blurred and empty */}
        {!focused && value.length === 0 && (
          <span className="py-0.5 text-sm text-muted-foreground">
            {placeholder}
          </span>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-2xl border bg-popover p-1 shadow-lg">
          {allSuggestions.map((s, i) => (
            <button
              key={s.email}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault()
                selectSuggestion(s)
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors",
                i === highlightedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/50",
              )}
            >
              <span className="flex flex-col gap-0">
                {s.name && (
                  <span className="text-xs font-medium">{s.name}</span>
                )}
                <span
                  className={cn(
                    "truncate",
                    s.name ? "text-xs text-muted-foreground" : "text-sm",
                  )}
                >
                  {s.email}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

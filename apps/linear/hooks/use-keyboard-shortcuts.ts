"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { useNavigate } from "@/lib/router-compat"
import { useUiStore } from "@/stores/ui-store"

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  if (el.isContentEditable) return true
  // Popovers (e.g. command palette input) may be focused at body level
  if (el.closest('[role="dialog"]')) return true
  return false
}

const PREFIX_TIMEOUT_MS = 900

/**
 * Vim-style global shortcuts:
 *   t      → theme cycle (light ↔ dark)
 *   c      → create new task
 *   /      → open command palette
 *   g d    → go to dashboard
 *   g i    → go to requests (inbox)
 *   g n    → go to new task
 *
 * Disabled when focus is inside an input / textarea / contenteditable
 * or any open dialog. Hook mounts a single window-level listener.
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const setCommandPalette = useUiStore((s) => s.setCommandPalette)
  const commandOpen = useUiStore((s) => s.commandPaletteOpen)
  const setShortcutsHelp = useUiStore((s) => s.setShortcutsHelp)
  const shortcutsHelpOpen = useUiStore((s) => s.shortcutsHelpOpen)

  const pendingPrefixUntil = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore everything while a dialog/palette is open
      if (commandOpen || shortcutsHelpOpen) return
      if (isTypingTarget(e.target)) return
      if (e.altKey || e.ctrlKey || e.metaKey) return

      // Allow Shift only for symbols (e.g. "?"); ignore plain shifted letters.
      const isShifted = e.shiftKey
      const k = e.key.toLowerCase()

      // Resolve a previously-held "g" prefix
      if (
        pendingPrefixUntil.current !== null &&
        performance.now() < pendingPrefixUntil.current
      ) {
        pendingPrefixUntil.current = null
        if (isShifted) return
        if (k === "d") {
          e.preventDefault()
          navigate("/")
          return
        }
        if (k === "n") {
          e.preventDefault()
          navigate("/tasks/new")
          return
        }
        if (k === "i") {
          e.preventDefault()
          // Triage'daki /inbox rotası Linear Lite'ta /requests segmentine
          // taşındı (PLAN §3).
          navigate("/requests")
          return
        }
        return
      }
      pendingPrefixUntil.current = null

      if (isShifted) {
        if (e.key === "?") {
          e.preventDefault()
          setShortcutsHelp(true)
        }
        return
      }

      switch (k) {
        case "g":
          e.preventDefault()
          pendingPrefixUntil.current = performance.now() + PREFIX_TIMEOUT_MS
          break
        case "t":
          e.preventDefault()
          setTheme(resolvedTheme === "dark" ? "light" : "dark")
          break
        case "c":
          e.preventDefault()
          navigate("/tasks/new")
          break
        case "/":
          e.preventDefault()
          setCommandPalette(true)
          break
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    navigate,
    resolvedTheme,
    setTheme,
    setCommandPalette,
    commandOpen,
    setShortcutsHelp,
    shortcutsHelpOpen,
  ])
}

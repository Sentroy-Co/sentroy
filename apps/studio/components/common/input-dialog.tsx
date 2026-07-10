"use client"

import { useEffect, useRef, useState } from "react"
import { create } from "zustand"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"

/**
 * Studio-lokal prompt() ikamesi — confirm store'la (packages/console/stores/
 * confirm) aynı promise-tabanlı desen. Tek global mount ([lang]/layout.tsx
 * içinde <InputDialog />), her yerden `await promptInput({...})` ile çağrılır.
 *
 * Dönüş: kullanıcı onaylarsa girilen string (trim edilmemiş — caller trim
 * eder), iptal/ESC/backdrop'ta null. Enter = confirm, Esc = cancel.
 */

export interface PromptInputOptions {
  title: string
  /** Input üstünde küçük label satırı. */
  label?: string
  /** Title altında açıklama metni. */
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
}

interface InputDialogState {
  isOpen: boolean
  options: PromptInputOptions | null
  /** Internal — pending promise'i çözen fonksiyon. */
  resolver: ((value: string | null) => void) | null

  promptInput: (options: PromptInputOptions) => Promise<string | null>
  handleSubmit: (value: string) => void
  handleCancel: () => void
}

export const useInputDialogStore = create<InputDialogState>((set, get) => ({
  isOpen: false,
  options: null,
  resolver: null,

  promptInput: (options) => {
    // Önceki bekleyen promise varsa null ile çöz (tek dialog aynı anda)
    const prev = get().resolver
    if (prev) prev(null)

    return new Promise<string | null>((resolve) => {
      set({ isOpen: true, options, resolver: resolve })
    })
  },

  handleSubmit: (value) => {
    const { resolver } = get()
    resolver?.(value)
    set({ isOpen: false, resolver: null })
  },

  handleCancel: () => {
    const { resolver } = get()
    resolver?.(null)
    set({ isOpen: false, resolver: null })
  },
}))

/** Component dışından doğrudan çağırmak için kolaylık helper'ı. */
export const promptInput = (
  options: PromptInputOptions,
): Promise<string | null> => useInputDialogStore.getState().promptInput(options)

/**
 * Global mount — editör layout'una bir kez eklenir. `promptInput({ ... })`
 * çağrısıyla açılır ve kullanıcının cevabını promise olarak döndürür.
 */
export function InputDialog() {
  const { isOpen, options, handleSubmit, handleCancel } = useInputDialogStore()
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Dialog her açılışında defaultValue ile senkronize + input'a focus/select.
  useEffect(() => {
    if (!isOpen) return
    setValue(options?.defaultValue ?? "")
    // Dialog mount animasyonu sonrası focus — bir frame beklemek yeterli.
    const id = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 50)
    return () => window.clearTimeout(id)
  }, [isOpen, options])

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description && (
            <DialogDescription>{options.description}</DialogDescription>
          )}
        </DialogHeader>
        {/* Form wrapper → Enter ile submit; Esc Dialog'un kendisi kapatır */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit(value)
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            {options?.label && (
              <Label htmlFor="studio-input-dialog-field">{options.label}</Label>
            )}
            <Input
              id="studio-input-dialog-field"
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={options?.placeholder}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              {options?.cancelText ?? "Cancel"}
            </Button>
            <Button type="submit">{options?.confirmText ?? "OK"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

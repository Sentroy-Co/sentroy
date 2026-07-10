"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react"
import { useTranslations } from "next-intl"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

export type ChoiceVariant = "default" | "destructive"

export type ChoiceOption = {
  label: string
  value: string
  variant?: ChoiceVariant
}

export type ChoiceOptions = {
  title: string
  description?: string
  /**
   * Buton listesi — soldan sağa render edilir. ESC veya backdrop kapanışı
   * Promise'i `null` ile resolve eder; "vazgeç" davranışı için listede
   * `value: "cancel"` (veya benzeri) bir buton eklemek genelde yeterli.
   */
  options: ChoiceOption[]
  cancelValue?: string | null
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>
type Choice = (opts: ChoiceOptions) => Promise<string | null>

type Ctx = {
  confirm: Confirm
  choice: Choice
}

const ConfirmCtx = createContext<Ctx | null>(null)

type ConfirmState = { kind: "confirm"; opts: ConfirmOptions; open: boolean }
type ChoiceState = { kind: "choice"; opts: ChoiceOptions; open: boolean }
type DialogState = ConfirmState | ChoiceState

export function ConfirmDialogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations("linearLite.confirmDialog")
  const [state, setState] = useState<DialogState | null>(null)
  const resolveBoolRef = useRef<((v: boolean) => void) | null>(null)
  const resolveStrRef = useRef<((v: string | null) => void) | null>(null)

  const confirm = useCallback<Confirm>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolveBoolRef.current = resolve
      setState({ kind: "confirm", opts, open: true })
    })
  }, [])

  const choice = useCallback<Choice>((opts) => {
    return new Promise<string | null>((resolve) => {
      resolveStrRef.current = resolve
      setState({ kind: "choice", opts, open: true })
    })
  }, [])

  const closeConfirm = (ok: boolean) => {
    const resolve = resolveBoolRef.current
    resolveBoolRef.current = null
    setState((s) => (s ? { ...s, open: false } : null))
    setTimeout(() => resolve?.(ok), 0)
  }

  const closeChoice = (value: string | null) => {
    const resolve = resolveStrRef.current
    resolveStrRef.current = null
    setState((s) => (s ? { ...s, open: false } : null))
    setTimeout(() => resolve?.(value), 0)
  }

  const isConfirm = state?.kind === "confirm"
  const isChoice = state?.kind === "choice"

  return (
    <ConfirmCtx.Provider value={{ confirm, choice }}>
      {children}
      <AlertDialog
        open={state?.open ?? false}
        onOpenChange={(v) => {
          if (v) return
          if (isConfirm) closeConfirm(false)
          else if (isChoice)
            closeChoice(
              (state as ChoiceState).opts.cancelValue ?? null,
            )
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state?.opts.title ?? ""}</AlertDialogTitle>
            {state?.opts.description ? (
              <AlertDialogDescription>
                {state.opts.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {isConfirm ? (
              <>
                <AlertDialogCancel onClick={() => closeConfirm(false)}>
                  {(state as ConfirmState).opts.cancelLabel ?? t("cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => closeConfirm(true)}
                  className={cn(
                    (state as ConfirmState).opts.variant === "destructive" &&
                      "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40",
                  )}
                >
                  {(state as ConfirmState).opts.confirmLabel ?? t("confirm")}
                </AlertDialogAction>
              </>
            ) : isChoice ? (
              (state as ChoiceState).opts.options.map((o, i) => {
                const isLast =
                  i === (state as ChoiceState).opts.options.length - 1
                return isLast ? (
                  <AlertDialogAction
                    key={o.value}
                    onClick={() => closeChoice(o.value)}
                    className={cn(
                      o.variant === "destructive" &&
                        "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40",
                    )}
                  >
                    {o.label}
                  </AlertDialogAction>
                ) : (
                  <AlertDialogCancel
                    key={o.value}
                    onClick={() => closeChoice(o.value)}
                    className={cn(
                      o.variant === "destructive" &&
                        "border-destructive/40 text-destructive hover:bg-destructive/10",
                    )}
                  >
                    {o.label}
                  </AlertDialogCancel>
                )
              })
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmCtx.Provider>
  )
}

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) {
    throw new Error(
      "useConfirm() requires <ConfirmDialogProvider> in the tree",
    )
  }
  return ctx.confirm
}

export function useChoice(): Choice {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) {
    throw new Error(
      "useChoice() requires <ConfirmDialogProvider> in the tree",
    )
  }
  return ctx.choice
}

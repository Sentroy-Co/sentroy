"use client"

import * as React from "react"
import {
  AnimatePresence,
  motion,
  type HTMLMotionProps,
} from "framer-motion"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type Size = "sm" | "md"

type MorphButtonProps = Omit<
  HTMLMotionProps<"button">,
  "children" | "size"
> & {
  submitting?: boolean
  layoutId?: string
  loaderLabel?: string
  intent?: "primary" | "ghost" | "destructive" | "secondary"
  fullWidth?: boolean
  size?: Size
  hoverIcon?: React.ReactNode
  children?: React.ReactNode
}

const SIZE: Record<
  Size,
  { h: number; pad: number; loader: number; text: string }
> = {
  sm: { h: 32, pad: 12, loader: 32, text: "text-xs" },
  md: { h: 40, pad: 16, loader: 40, text: "text-sm" },
}

export const MorphButton = React.forwardRef<
  HTMLButtonElement,
  MorphButtonProps
>(function MorphButton(
  {
    submitting = false,
    layoutId = "morph-cta",
    loaderLabel,
    intent = "primary",
    fullWidth = false,
    size = "md",
    hoverIcon,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  const t = useTranslations("linearLite")
  const reduce = useReducedMotion()
  const s = SIZE[size]

  const transition = reduce
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.32, 0.72, 0, 1] as const }

  const colorClass =
    intent === "primary"
      ? "bg-primary text-primary-foreground hover:opacity-90"
      : intent === "destructive"
        ? "bg-destructive text-white hover:opacity-90"
        : "bg-secondary text-secondary-foreground hover:bg-accent"

  return (
    <motion.button
      ref={ref}
      type={type ?? "button"}
      layoutId={layoutId}
      disabled={disabled || submitting}
      animate={{
        borderRadius: submitting ? 999 : 12,
        width: submitting ? s.loader : fullWidth ? "100%" : "auto",
        paddingLeft: submitting ? 0 : s.pad,
        paddingRight: submitting ? 0 : s.pad,
      }}
      transition={transition}
      style={{ height: s.h }}
      className={cn(
        "group/morph relative inline-flex items-center justify-center overflow-hidden font-medium shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
        s.text,
        colorClass,
        className,
      )}
      {...rest}
    >
      <AnimatePresence mode="wait" initial={false}>
        {submitting ? (
          <motion.span
            key="loader"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.6 }}
            transition={transition}
            className="flex items-center justify-center"
            aria-label={loaderLabel ?? t("motion.working")}
          >
            <Spinner size={size} />
          </motion.span>
        ) : (
          <motion.span
            key="label"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            className="flex items-center whitespace-nowrap"
          >
            <span>{children}</span>
            {hoverIcon ? (
              <span
                aria-hidden
                className={cn(
                  "ml-0 inline-flex w-0 items-center justify-end overflow-hidden opacity-0",
                  "transition-all duration-200 ease-out",
                  "group-hover/morph:ml-1.5 group-hover/morph:w-4 group-hover/morph:opacity-100",
                  reduce && "transition-none",
                )}
              >
                {hoverIcon}
              </span>
            ) : null}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
})

function Spinner({ size }: { size: Size }) {
  const px = size === "sm" ? 12 : 16
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: px, height: px }}
    >
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-current border-r-transparent" />
    </span>
  )
}

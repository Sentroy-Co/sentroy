"use client"

import type { ReactNode, ReactElement, ButtonHTMLAttributes } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

/**
 * Tip — generic Tooltip wrapper. Children olarak tek bir element alır
 * (button, div, span, anchor, …), bunu shadcn Tooltip ile sarmalı.
 *
 * Kullanım:
 *   <Tip text="Save now">
 *     <button onClick={save}>Save</button>
 *   </Tip>
 *
 * `text` falsy ise children doğrudan render edilir (tooltip skip).
 * Conditional tooltip pattern'i (örn. disabled durumunda hint metin
 * göstermemek) için kullanışlı.
 */
export function Tip({
  text,
  children,
}: {
  text?: ReactNode
  children: ReactElement
}) {
  if (!text) return children
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

/**
 * TipButton — `<button>` + shadcn Tooltip wrapper. UX migration helper:
 * studio app'te `title=` HTML attribute'lerini browser-native tooltip
 * yerine custom Tooltip popup'a çevirmek için kullanılır.
 *
 * Native `title` cross-platform inconsistent (Safari yavaş, mobile yok,
 * delay configurable değil); custom Tooltip her platformda aynı görsel +
 * dark theme'le tutarlı.
 *
 * `tooltip` falsy ise Tooltip wrapper skip — plain button render.
 * Bu sayede conditional tooltip pattern'i (örn. clip durumu) tek prop
 * ile yönetilebilir.
 */
export interface TipButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title"
> {
  tooltip?: ReactNode
  children?: ReactNode
}

export function TipButton({
  tooltip,
  children,
  type = "button",
  ...rest
}: TipButtonProps) {
  if (!tooltip) {
    return (
      <button type={type} {...rest}>
        {children}
      </button>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type={type} {...rest}>
            {children}
          </button>
        }
      />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

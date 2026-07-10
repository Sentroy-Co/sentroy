"use client"

import { forwardRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Password input + reveal toggle. type="password" ↔ type="text" arası
 * geçiş, sağ tarafta absolute icon button. `aria-pressed` toggle state'i,
 * `aria-label` localized prop ile çevrilebilir.
 *
 * Reveal default off; UX: kullanıcı yazarken passwordini gizli görür,
 * doğrulamak için ikona tıklayabilir. Otomatik şifre yönetici (1Password,
 * Bitwarden) bu pattern'le uyumlu — `autoComplete` korunur.
 */
type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  showLabel?: string
  hideLabel?: string
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { showLabel = "Show password", hideLabel = "Hide password", className, ...props },
    ref,
  ) {
    const [revealed, setRevealed] = useState(false)
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={revealed ? "text" : "password"}
          // pe-10 ile sağ ikon butonu için yer aç; trigger overlay'in altına
          // metin sokulmasın.
          className={cn("pe-10", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          tabIndex={-1}
          aria-pressed={revealed}
          aria-label={revealed ? hideLabel : showLabel}
          title={revealed ? hideLabel : showLabel}
          className="absolute end-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <HugeiconsIcon
            icon={revealed ? ViewOffIcon : ViewIcon}
            strokeWidth={2}
            className="size-4"
          />
        </button>
      </div>
    )
  },
)

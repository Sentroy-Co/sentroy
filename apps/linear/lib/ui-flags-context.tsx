"use client"

/**
 * UI flag + viewer context (PLAN §5).
 *
 * Triage'da bu veriler app-layout loader'ından `useRouteLoaderData` ile
 * okunuyordu; Next'te company dashboard layout'u server-side doldurup bu
 * provider ile aşağı geçirir. Port edilen sayfalar `useUiFlags`/`useIsAdmin`/
 * `useViewer` hook'larını buradan import eder.
 */

import * as React from "react"
import { DEFAULT_UI_FLAGS, type UiFlags } from "./ui-flags"

export type { UiFlags }

/**
 * Oturumdaki kullanıcının Linear kimliği. `kind: "linear"` → e-postası bir
 * Linear kullanıcısıyla eşleşti (linearUserId dolu); `kind: "proxy"` →
 * eşleşme yok, işlemler panel adına (proxy header ile) yapılır.
 */
export interface Viewer {
  email: string
  linearUserId: string | null
  appUserId: string
  kind: "linear" | "proxy"
}

interface UiFlagsContextValue {
  flags: UiFlags
  isAdmin: boolean
  viewer: Viewer | null
  aiEnabled: boolean
  /** Web Push VAPID public key (server env'den). Yoksa push devre dışı. */
  pushPublicKey: string | null
}

const UiFlagsContext = React.createContext<UiFlagsContextValue>({
  flags: DEFAULT_UI_FLAGS,
  isAdmin: false,
  viewer: null,
  aiEnabled: false,
  pushPublicKey: null,
})

export function UiFlagsProvider({
  flags,
  isAdmin,
  viewer,
  aiEnabled = false,
  pushPublicKey = null,
  children,
}: {
  flags: UiFlags
  isAdmin: boolean
  /** Linear bağlı değilse ya da session çözülemezse null. */
  viewer: Viewer | null
  /** AI assist v1 kapsam dışı — daima false. */
  aiEnabled?: boolean
  /** VAPID public key — server component env'den geçirir (secret değil). */
  pushPublicKey?: string | null
  children: React.ReactNode
}) {
  const value = React.useMemo(
    () => ({ flags, isAdmin, viewer, aiEnabled, pushPublicKey }),
    [flags, isAdmin, viewer, aiEnabled, pushPublicKey],
  )
  return (
    <UiFlagsContext.Provider value={value}>{children}</UiFlagsContext.Provider>
  )
}

export function useUiFlags(): UiFlags {
  return React.useContext(UiFlagsContext).flags
}

export function useIsAdmin(): boolean {
  return React.useContext(UiFlagsContext).isAdmin
}

export function useViewer(): Viewer | null {
  return React.useContext(UiFlagsContext).viewer
}

/** AI assist bayrağı — v1'de her zaman false (kapsam dışı). */
export function useAiEnabled(): boolean {
  return React.useContext(UiFlagsContext).aiEnabled
}

/** Web Push VAPID public key — null ise push desteklenmiyor. */
export function usePushPublicKey(): string | null {
  return React.useContext(UiFlagsContext).pushPublicKey
}

"use client"

/**
 * react-router → Next.js App Router uyumluluk katmanı (PLAN §5 sözleşmesi).
 *
 * Triage'dan port edilen sayfalar react-router API'leriyle (Link, NavLink,
 * useNavigate, useFetcher, ...) yazıldı. Bu shim aynı isim ve imzaları
 * Next.js primitives üstünde sağlar; sayfa kodu minimum diff'le taşınır.
 *
 * Path modeli:
 *   - `basePath` = `/${lang}/d/${companySlug}` — UI route'larının kökü.
 *   - `apiBase`  = `/api/companies/${companySlug}` — API route'larının kökü.
 *   - Triage'ın route-action URL'leri (`/`, `/tasks/new`, `/api/search`, ...)
 *     `resolveAction` ile Sentroy API endpoint'lerine çevrilir.
 */

import * as React from "react"
import NextLink from "next/link"
import { usePathname, useRouter, useSearchParams as useNextSearchParams } from "next/navigation"

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DashRouterContextValue {
  basePath: string
  apiBase: string
  currentAction?: string
}

const DashRouterContext = React.createContext<DashRouterContextValue | null>(
  null,
)

export function DashRouterProvider({
  basePath,
  apiBase,
  currentAction,
  children,
}: {
  /** UI route kökü: `/${lang}/d/${companySlug}` */
  basePath: string
  /** API kökü: `/api/companies/${companySlug}` */
  apiBase: string
  /** Sayfanın varsayılan action endpoint'i (fetcher.submit action vermezse). */
  currentAction?: string
  children: React.ReactNode
}) {
  const value = React.useMemo(
    () => ({ basePath, apiBase, currentAction }),
    [basePath, apiBase, currentAction],
  )
  return (
    <DashRouterContext.Provider value={value}>
      {children}
    </DashRouterContext.Provider>
  )
}

function useDashRouterContext(): DashRouterContextValue {
  const ctx = React.useContext(DashRouterContext)
  if (!ctx) {
    throw new Error(
      "router-compat: DashRouterProvider bulunamadı — dashboard layout'un altında mısın?",
    )
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Triage route-action path'i → Sentroy API endpoint'i eşlemesi. */
function mapActionPath(apiBase: string, path: string): string | null {
  if (path === "/") return `${apiBase}/issues/actions`
  if (path === "/tasks/new") return `${apiBase}/issues`
  const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
  if (taskMatch) return `${apiBase}/issues/${taskMatch[1]}/actions`
  if (path === "/api/upload") return `${apiBase}/upload`
  if (path === "/api/search") return `${apiBase}/search`
  if (path === "/api/issue-preview") return `${apiBase}/issue-preview`
  if (path === "/api/inbox-thread") return `${apiBase}/inbox-thread`
  return null
}

export function useDashPaths(): {
  basePath: string
  apiBase: string
  href: (p: string) => string
  resolveAction: (a?: string) => string
} {
  const { basePath, apiBase, currentAction } = useDashRouterContext()
  const pathname = usePathname()

  return React.useMemo(() => {
    const href = (p: string) => {
      if (!p.startsWith("/")) return p
      if (p === "/") return basePath || "/"
      return `${basePath}${p}`
    }

    const resolveAction = (a?: string): string => {
      if (a !== undefined) {
        // Query string'i koru — path kısmını eşle.
        const qIndex = a.indexOf("?")
        const path = qIndex === -1 ? a : a.slice(0, qIndex)
        const query = qIndex === -1 ? "" : a.slice(qIndex)
        const mapped = mapActionPath(apiBase, path)
        return mapped ? `${mapped}${query}` : a
      }
      if (currentAction !== undefined) return currentAction
      // Fallback: mevcut sayfa path'ini (basePath'siz) eşlemeden geçir —
      // react-router'ın "action'sız submit mevcut route'a gider" semantiği.
      let local = pathname.startsWith(basePath)
        ? pathname.slice(basePath.length)
        : pathname
      if (!local.startsWith("/")) local = `/${local}`
      if (local === "") local = "/"
      return mapActionPath(apiBase, local) ?? local
    }

    return { basePath, apiBase, href, resolveAction }
  }, [basePath, apiBase, currentAction, pathname])
}

// ---------------------------------------------------------------------------
// Link / NavLink
// ---------------------------------------------------------------------------

type LinkProps = Omit<React.ComponentProps<typeof NextLink>, "href"> & {
  /** react-router uyumu: `to` da desteklenir. */
  to?: string
  href?: string
}

/**
 * next/link sarmalayıcısı — `href`/`to` "/" ile başlıyorsa basePath ile
 * prefix'lenir. target/rel vb. tüm prop'lar passthrough.
 */
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  function Link({ to, href, ...rest }, ref) {
    const { href: buildHref } = useDashPaths()
    const raw = href ?? to ?? "/"
    return <NextLink ref={ref} href={buildHref(raw)} {...rest} />
  },
)

type NavLinkClassName =
  | string
  | ((state: { isActive: boolean }) => string | undefined)

export function NavLink({
  to,
  className,
  children,
  end,
  ...rest
}: Omit<React.ComponentProps<typeof NextLink>, "href" | "className" | "children"> & {
  to: string
  className?: NavLinkClassName
  end?: boolean
  children?:
    | React.ReactNode
    | ((state: { isActive: boolean }) => React.ReactNode)
}) {
  const { href: buildHref } = useDashPaths()
  const pathname = usePathname()
  const target = buildHref(to)

  // react-router semantiği: "/" (index) her yerde aktif görünmesin; diğer
  // path'lerde prefix match (segment sınırında) yeterli.
  const isActive =
    to === "/" || end
      ? pathname === target || pathname === `${target}/`
      : pathname === target || pathname.startsWith(`${target}/`)

  const resolvedClassName =
    typeof className === "function" ? className({ isActive }) : className

  return (
    <NextLink
      href={target}
      className={resolvedClassName}
      aria-current={isActive ? "page" : undefined}
      {...rest}
    >
      {typeof children === "function" ? children({ isActive }) : children}
    </NextLink>
  )
}

// ---------------------------------------------------------------------------
// Navigation hooks
// ---------------------------------------------------------------------------

export function useNavigate(): (to: string | number) => void {
  const router = useRouter()
  const { href } = useDashPaths()
  return React.useCallback(
    (to: string | number) => {
      if (typeof to === "number") {
        // react-router: navigate(-1) → geri.
        router.back()
        return
      }
      router.push(href(to))
    },
    [router, href],
  )
}

export function useLocation(): { pathname: string; search: string } {
  const { basePath } = useDashRouterContext()
  const pathname = usePathname()
  const searchParams = useNextSearchParams()

  let local = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname
  if (!local.startsWith("/")) local = `/${local}`
  if (local === "") local = "/"

  const qs = searchParams.toString()
  return { pathname: local, search: qs ? `?${qs}` : "" }
}

export function useSearchParams(): [
  URLSearchParams,
  (
    next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
    opts?: { replace?: boolean },
  ) => void,
] {
  const router = useRouter()
  const pathname = usePathname()
  const nextParams = useNextSearchParams()

  const params = React.useMemo(
    () => new URLSearchParams(nextParams.toString()),
    [nextParams],
  )

  const setParams = React.useCallback(
    (
      next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
      opts?: { replace?: boolean },
    ) => {
      const resolved =
        typeof next === "function"
          ? next(new URLSearchParams(nextParams.toString()))
          : next
      const qs = resolved.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (opts?.replace) router.replace(url)
      else router.push(url)
    },
    [router, pathname, nextParams],
  )

  return [params, setParams]
}

// ---------------------------------------------------------------------------
// Coalesced refresh — hızlı ardışık mutasyonlar (kanban sürükleme, çoklu
// intent) tek RSC refetch'e indirgenir. router.refresh() maliyetli (tüm route
// tree'sini server'da yeniden çalıştırır); trailing-edge debounce ile art arda
// gelen refresh istekleri son çağrıdan REFRESH_DEBOUNCE_MS sonra bir kez atar.
// Modül-seviye → tüm useFetcher/useRevalidator örnekleri arası coalesce olur.
type NextRouter = ReturnType<typeof useRouter>
const REFRESH_DEBOUNCE_MS = 180
let _refreshTimer: ReturnType<typeof setTimeout> | null = null
let _pendingRouter: NextRouter | null = null

function scheduleRefresh(router: NextRouter): void {
  _pendingRouter = router
  if (_refreshTimer) clearTimeout(_refreshTimer)
  _refreshTimer = setTimeout(() => {
    _refreshTimer = null
    const r = _pendingRouter
    _pendingRouter = null
    r?.refresh()
  }, REFRESH_DEBOUNCE_MS)
}

export function useRevalidator(): {
  revalidate: () => void
  state: "idle" | "loading"
} {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const revalidate = React.useCallback(() => {
    // SSE/interval kaynaklı tazelemeler de aynı debouncer'dan geçsin →
    // webhook fırtınası + mutasyonlar tek refresh'te birleşir.
    startTransition(() => {
      scheduleRefresh(router)
    })
  }, [router])
  return { revalidate, state: isPending ? "loading" : "idle" }
}

// ---------------------------------------------------------------------------
// useFetcher
// ---------------------------------------------------------------------------

type FetcherTarget = FormData | HTMLFormElement | Record<string, string>

function toFormData(target: FetcherTarget): FormData {
  if (target instanceof FormData) return target
  if (typeof HTMLFormElement !== "undefined" && target instanceof HTMLFormElement) {
    return new FormData(target)
  }
  const fd = new FormData()
  for (const [key, value] of Object.entries(target as Record<string, string>)) {
    fd.append(key, value)
  }
  return fd
}

export function useFetcher<T = unknown>(): {
  submit: (
    target: FetcherTarget,
    opts?: { method?: "post" | "get"; action?: string },
  ) => Promise<void>
  load: (href: string) => Promise<void>
  data?: T
  state: "idle" | "submitting" | "loading"
  Form: React.FC<React.FormHTMLAttributes<HTMLFormElement> & { action?: string }>
} {
  const router = useRouter()
  const { resolveAction } = useDashPaths()
  const [data, setData] = React.useState<T | undefined>(undefined)
  const [state, setState] = React.useState<"idle" | "submitting" | "loading">(
    "idle",
  )

  const submit = React.useCallback(
    async (
      target: FetcherTarget,
      opts?: { method?: "post" | "get"; action?: string },
    ) => {
      const method = opts?.method ?? "post"
      // HTMLFormElement ise action attribute'u fallback olarak kullan
      // (react-router <fetcher.Form action="..."> semantiği).
      let action = opts?.action
      if (
        action === undefined &&
        typeof HTMLFormElement !== "undefined" &&
        target instanceof HTMLFormElement
      ) {
        const attr = target.getAttribute("action")
        if (attr) action = attr
      }
      const url = resolveAction(action)
      const formData = toFormData(target)

      if (method === "get") {
        setState("loading")
        try {
          const params = new URLSearchParams()
          formData.forEach((value, key) => {
            if (typeof value === "string") params.append(key, value)
          })
          const qs = params.toString()
          const res = await fetch(qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url, {
            headers: { Accept: "application/json" },
          })
          const json = (await res.json().catch(() => undefined)) as T | undefined
          setData(json)
        } finally {
          setState("idle")
        }
        return
      }

      setState("submitting")
      try {
        const res = await fetch(url, {
          method: "POST",
          body: formData,
          headers: { Accept: "application/json" },
        })
        const json = (await res.json().catch(() => undefined)) as T | undefined
        setData(json)
        if (res.ok) {
          // react-router: action sonrası loader'lar revalidate olur. Hızlı
          // ardışık mutasyonlarda tek refetch'e coalesce (scheduleRefresh).
          scheduleRefresh(router)
        }
      } finally {
        setState("idle")
      }
    },
    [resolveAction, router],
  )

  const load = React.useCallback(
    async (href: string) => {
      setState("loading")
      try {
        const url = resolveAction(href)
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = (await res.json().catch(() => undefined)) as T | undefined
        setData(json)
      } finally {
        setState("idle")
      }
    },
    [resolveAction],
  )

  const Form = React.useMemo(() => {
    const FetcherForm: React.FC<
      React.FormHTMLAttributes<HTMLFormElement> & { action?: string }
    > = ({ action, onSubmit, children, ...rest }) => {
      return (
        <form
          {...rest}
          onSubmit={(e) => {
            onSubmit?.(e)
            if (e.defaultPrevented) return
            e.preventDefault()
            void submit(e.currentTarget, { action })
          }}
        >
          {children}
        </form>
      )
    }
    return FetcherForm
  }, [submit])

  return { submit, load, data, state, Form }
}

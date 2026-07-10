"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon, ArrowLeft01Icon, StarIcon, CheckmarkBadge01Icon, ArrowRight01Icon, DashboardSquare01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Store01Icon } from "@hugeicons/core-free-icons"
import { useSentroyApps } from "@workspace/console/components/layout/app-launcher"
import { useOsStore } from "../os-store"
import { confirm } from "@workspace/console/stores/confirm"
import { StoreMyAppsSidebar } from "./store-my-apps-sidebar"

const CATEGORIES = ["developer-tools", "productivity", "analytics", "communication", "marketing", "finance", "design", "other"]
const SCOPE_LABELS: Record<string, string> = {
  openid: "Sign you in",
  profile: "Your name and picture",
  email: "Your email address",
  offline_access: "Stay signed in",
}

interface Card {
  appId: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string
  color: string
  category: string
  ratingAvg: number
  ratingCount: number
  installCount: number
  pricing: { model: string }
  /** `hasPublicProfile` yalnız detail response'unda dolu — public developer
   *  profili çözülebiliyorsa (şirketin ≥1 public app'i) true. Store list
   *  card'ında undefined (linklenmez zaten). */
  developer: { name: string; slug: string; hasPublicProfile?: boolean } | null
  /** First-party (Sentroy) app — katalog kartı; detay client-side. */
  firstParty?: boolean
  publisher?: string | null
  installed?: boolean
  addedAt?: string
  /** First-party uzun açıklama (client detay). */
  description?: string
}

interface Sections {
  editorsChoice: Card[]
  new: Card[]
  mostDownloaded: Card[]
}

interface Detail {
  app: Card & {
    screenshots: { url: string; alt: string | null }[]
    description: string
    longDescription: string | null
    supportUrl: string | null
    privacyUrl: string
    authMode: "none" | "token" | "oauth"
    requiredScopes: string[]
    embedUrl: string
    sandboxAttr: string
    allowAttr: string
    injectedParams: string[]
    supportedLangs: string[]
    fallbackLang: string
    minHeight: number | null
    currentVersion: string
  }
  reviews: { id: string; rating: number; body: string | null; createdAt: string; author: { name: string | null; image: string | null }; isMine: boolean }[]
  userReview: { rating: number; body: string | null } | null
  installed: boolean
  canReview: boolean
}

function Logo({ url, color, size }: { url: string; color: string; size: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5`} style={{ background: color }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    </span>
  )
}

function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <HugeiconsIcon key={i} icon={StarIcon} className={"size-3.5 " + (i <= Math.round(value) ? "text-amber-500" : "text-muted-foreground/30")} strokeWidth={2} />
        ))}
      </span>
      {typeof count === "number" ? <span>{value.toFixed(1)} ({count})</span> : null}
    </span>
  )
}

export function StorePanel({ lang, companySlug }: { lang: string; companySlug: string }) {
  const t = useTranslations("os")
  const openApp = useOsStore((s) => s.openApp)
  // First-party "Open" için ürün descriptor'ları (permissions VERİLMEZ → hepsi
  // gelir; store'dan açmak install durumundan bağımsızdır). Dock ile aynı id'ler.
  const productApps = useSentroyApps({ lang, companySlug })

  // "My Apps" sağ sidebar'ı — geliştirici app'leri + publish stack. "Publish
  // your app" artık ayrı OS penceresi değil, bu sidebar'ın submit ekranı.
  const [myAppsOpen, setMyAppsOpen] = useState(false)
  const [myAppsScreen, setMyAppsScreen] = useState<"list" | "submit">("list")
  function openMyApps(screen: "list" | "submit") {
    setMyAppsScreen(screen)
    setMyAppsOpen(true)
  }

  // Geliştirici adı → public geliştirici profilini OS PENCERESİNDE aç (yeni
  // sekme değil). /store/dev/[slug] zaten chrome'suz standalone bir sayfa.
  function openDevProfile(dev: { name: string; slug: string }) {
    openApp(`dev-profile:${dev.slug}`, {
      id: `dev-profile:${dev.slug}`,
      name: dev.name,
      description: "",
      cta: "",
      icon: Store01Icon,
      color: "#0a84ff",
      href: `/${lang}/store/dev/${dev.slug}`,
    })
  }
  const [apps, setApps] = useState<Card[]>([])
  const [sections, setSections] = useState<Sections | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null) // detail view
  const [fpCard, setFpCard] = useState<Card | null>(null) // first-party detay (client-side)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewBody, setReviewBody] = useState("")

  const filtering = Boolean(search.trim() || category)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (category) qs.set("category", category)
      if (search.trim()) qs.set("search", search.trim())
      qs.set("company", companySlug) // aktif şirketin private app'leri de gelsin
      qs.set("lang", lang) // first-party metinleri
      const res = await fetch(`/api/app-store/store?${qs.toString()}`)
      const json = await res.json()
      setApps((json?.data?.apps as Card[]) ?? [])
      setSections((json?.data?.sections as Sections | null) ?? null)
    } catch {
      toast.error(t("store.loadStoreFailed"))
    } finally {
      setLoading(false)
    }
  }, [category, search, companySlug, lang, t])

  useEffect(() => {
    if (!slug) void loadList()
  }, [slug, loadList])

  const loadDetail = useCallback(
    async (s: string) => {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/app-store/store/${s}?company=${encodeURIComponent(companySlug)}`)
        const json = await res.json()
        const d = json?.data as Detail | undefined
        setDetail(d ?? null)
        setReviewRating(d?.userReview?.rating ?? 0)
        setReviewBody(d?.userReview?.body ?? "")
      } catch {
        toast.error(t("store.loadAppFailed"))
      } finally {
        setDetailLoading(false)
      }
    },
    [companySlug, t],
  )

  // 3rd-party detay fetch — first-party (fpCard) client-side render edilir.
  useEffect(() => {
    if (slug && !fpCard) void loadDetail(slug)
  }, [slug, fpCard, loadDetail])

  function openCard(card: Card) {
    if (card.firstParty) {
      setFpCard(card)
      setSlug(card.slug)
    } else {
      setFpCard(null)
      setSlug(card.slug)
    }
  }

  function backToList() {
    setSlug(null)
    setDetail(null)
    setFpCard(null)
  }

  async function doInstall(consentedScopes: string[]) {
    if (!detail) return
    setBusy(true)
    try {
      const res = await fetch(`/api/app-store/${detail.app.appId}/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companySlug, consentedScopes }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? t("store.installFailed"))
        return
      }
      toast.success(t("store.installedToast", { app: detail.app.name }))
      setConsentOpen(false)
      window.dispatchEvent(new Event("sentroy:apps-changed"))
      void loadDetail(detail.app.slug)
    } finally {
      setBusy(false)
    }
  }

  async function onInstallClick() {
    if (!detail) return
    // Scope'lu app → consent dialog (zaten onay niteliğinde). Aksi halde
    // store-tarzı confirm (native değil).
    if (detail.app.authMode !== "none" && detail.app.requiredScopes.length > 0) {
      setConsentOpen(true)
      return
    }
    const ok = await confirm({
      title: t("store.confirmInstallTitle", { app: detail.app.name }),
      description: t("store.confirmInstallDesc"),
      confirmText: t("store.install"),
    })
    if (ok) void doInstall([])
  }

  // Yüklü store app'ini OS penceresinde aç (Launchpad "Your apps" ile aynı descriptor).
  function openInstalledApp() {
    if (!detail) return
    const a = detail.app
    openApp(`store:${a.appId}`, {
      id: `store:${a.appId}`,
      name: a.name,
      description: "",
      cta: "",
      icon: Store01Icon,
      color: a.color,
      href: a.embedUrl,
      logoUrl: a.logoUrl,
      kind: "store",
      embed: {
        appId: a.appId,
        sandbox: a.sandboxAttr,
        allow: a.allowAttr,
        injectedParams: a.injectedParams,
        authMode: a.authMode,
        companySlug,
        supportedLangs: a.supportedLangs,
        fallbackLang: a.fallbackLang,
        minHeight: a.minHeight,
      },
    })
  }

  async function doCheckout() {
    if (!detail) return
    setBusy(true)
    try {
      const res = await fetch(`/api/app-store/${detail.app.appId}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companySlug, returnTo: window.location.href }),
      })
      const json = await res.json()
      if (!res.ok || !json?.data?.url) {
        toast.error(json?.error ?? t("store.checkoutFailed"))
        return
      }
      window.location.href = json.data.url as string
    } finally {
      setBusy(false)
    }
  }

  async function doUninstall() {
    if (!detail) return
    const ok = await confirm({
      title: t("store.confirmRemoveTitle", { app: detail.app.name }),
      description: t("store.confirmRemoveDesc"),
      confirmText: t("store.remove"),
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/app-store/${detail.app.appId}/install?company=${encodeURIComponent(companySlug)}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(t("store.removeFailed"))
        return
      }
      toast.success(t("store.removedToast", { app: detail.app.name }))
      window.dispatchEvent(new Event("sentroy:apps-changed"))
      void loadDetail(detail.app.slug)
    } finally {
      setBusy(false)
    }
  }

  // ── First-party install/uninstall/open (katalog appId ile) ───────────────
  async function fpInstall() {
    if (!fpCard) return
    const ok = await confirm({
      title: t("store.confirmInstallTitle", { app: fpCard.name }),
      description: t("store.confirmInstallDesc"),
      confirmText: t("store.install"),
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/app-store/${fpCard.appId}/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companySlug }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? t("store.installFailed"))
        return
      }
      toast.success(t("store.installedToast", { app: fpCard.name }))
      setFpCard({ ...fpCard, installed: true })
      window.dispatchEvent(new Event("sentroy:apps-changed"))
    } finally {
      setBusy(false)
    }
  }

  async function fpUninstall() {
    if (!fpCard) return
    const ok = await confirm({
      title: t("store.confirmRemoveTitle", { app: fpCard.name }),
      description: t("store.confirmRemoveDesc"),
      confirmText: t("store.remove"),
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/app-store/${fpCard.appId}/install?company=${encodeURIComponent(companySlug)}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(t("store.removeFailed"))
        return
      }
      toast.success(t("store.removedToast", { app: fpCard.name }))
      setFpCard({ ...fpCard, installed: false })
      window.dispatchEvent(new Event("sentroy:apps-changed"))
    } finally {
      setBusy(false)
    }
  }

  function openFirstParty() {
    if (!fpCard) return
    const d = productApps.find((a) => a.id === fpCard.appId)
    if (d) openApp(d.id, d)
    else window.dispatchEvent(new Event("sentroy:apps-changed"))
  }

  async function submitReview() {
    if (!detail || reviewRating < 1) return
    setBusy(true)
    try {
      const res = await fetch(`/api/app-store/${detail.app.appId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companySlug, rating: reviewRating, body: reviewBody }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? t("store.reviewFailed"))
        return
      }
      toast.success(t("store.reviewSaved"))
      void loadDetail(detail.app.slug)
    } finally {
      setBusy(false)
    }
  }

  // ── First-party detail view (client-side, katalog) ─────────────────────────
  if (slug && fpCard) {
    return (
      <div className="flex h-full select-none flex-col overflow-y-auto bg-background">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={backToList}>
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" /> {t("store.back")}
          </Button>
        </div>
        <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
          <div className="flex items-start gap-4">
            <Logo url={fpCard.logoUrl} color={fpCard.color} size="size-20" />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold">{fpCard.name}</h2>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                {t("store.by")} <span className="font-medium text-foreground">{fpCard.publisher ?? t("store.sentroy")}</span>
                <span title={t("store.verified")} className="inline-flex">
                  <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-3.5 text-sky-500" />
                </span>
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="outline">{t(`store.categories.${fpCard.category}`)}</Badge>
                <Badge variant="secondary">{t("store.free")}</Badge>
              </div>
            </div>
            <div className="shrink-0">
              {fpCard.installed ? (
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={openFirstParty}>{t("store.open")}</Button>
                  <Button variant="outline" disabled={busy} onClick={fpUninstall}>{t("store.remove")}</Button>
                </div>
              ) : (
                <Button disabled={busy} onClick={fpInstall}>{t("store.install")}</Button>
              )}
            </div>
          </div>
          {fpCard.tagline ? <p className="text-sm text-foreground/90">{fpCard.tagline}</p> : null}
          {fpCard.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{fpCard.description}</p> : null}
        </div>
      </div>
    )
  }

  // ── 3rd-party detail view ──────────────────────────────────────────────────
  if (slug) {
    return (
      <div className="flex h-full select-none flex-col overflow-y-auto bg-background">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={backToList}>
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" /> {t("store.back")}
          </Button>
        </div>
        {detailLoading || !detail ? (
          <div className="space-y-4 p-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
            <div className="flex items-start gap-4">
              <Logo url={detail.app.logoUrl} color={detail.app.color} size="size-20" />
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold">{detail.app.name}</h2>
                {detail.app.developer ? (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    {t("store.by")}{" "}
                    {detail.app.developer.hasPublicProfile ? (
                      <button
                        type="button"
                        onClick={() => detail.app.developer && openDevProfile(detail.app.developer)}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {detail.app.developer.name}
                      </button>
                    ) : (
                      // Public profil çözülmüyorsa (private app / şirketin public
                      // app'i yok) linklenmez — 404 ölü link olmaz.
                      <span className="font-medium text-foreground">{detail.app.developer.name}</span>
                    )}
                    <span title={t("store.verified")} className="inline-flex">
                      <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-3.5 text-sky-500" />
                    </span>
                  </p>
                ) : null}
                <div className="mt-1.5 flex items-center gap-3">
                  <Stars value={detail.app.ratingAvg} count={detail.app.ratingCount} />
                  <Badge variant="outline">{t(`store.categories.${detail.app.category}`)}</Badge>
                  {detail.app.pricing.model === "paid" ? <Badge>{t("store.paid")}</Badge> : <Badge variant="secondary">{t("store.free")}</Badge>}
                </div>
              </div>
              <div className="shrink-0">
                {detail.installed ? (
                  <div className="flex gap-2">
                    <Button disabled={busy} onClick={openInstalledApp}>{t("store.open")}</Button>
                    <Button variant="outline" disabled={busy} onClick={doUninstall}>{t("store.remove")}</Button>
                  </div>
                ) : detail.app.pricing.model === "paid" ? (
                  <Button disabled={busy} onClick={doCheckout}>{t("store.buy")}</Button>
                ) : (
                  <Button disabled={busy} onClick={onInstallClick}>{t("store.install")}</Button>
                )}
              </div>
            </div>

            {detail.app.screenshots.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {detail.app.screenshots.map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={s.url} alt={s.alt ?? ""} className="h-48 rounded-xl border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                ))}
              </div>
            ) : null}

            <p className="text-sm text-foreground/90">{detail.app.description}</p>
            {detail.app.longDescription ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{detail.app.longDescription}</p>
            ) : null}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>v{detail.app.currentVersion}</span>
              <a href={detail.app.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{t("store.privacy")}</a>
              {detail.app.supportUrl ? <a href={detail.app.supportUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{t("store.support")}</a> : null}
            </div>

            {/* Reviews */}
            <div className="space-y-4 border-t border-border/60 pt-5">
              <h3 className="text-sm font-semibold">{t("store.reviews")}</h3>
              {detail.canReview ? (
                <div className="space-y-2 rounded-xl border p-3">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button key={i} type="button" onClick={() => setReviewRating(i)}>
                        <HugeiconsIcon icon={StarIcon} className={"size-6 " + (i <= reviewRating ? "text-amber-500" : "text-muted-foreground/30")} strokeWidth={2} />
                      </button>
                    ))}
                  </div>
                  <Textarea value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder={t("store.reviewPlaceholder")} rows={2} />
                  <Button size="sm" disabled={busy || reviewRating < 1} onClick={submitReview}>{detail.userReview ? t("store.updateReview") : t("store.submitReview")}</Button>
                </div>
              ) : !detail.installed ? (
                <p className="text-xs text-muted-foreground">{t("store.installToReview")}</p>
              ) : null}

              {detail.reviews.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("store.noReviews")}</p>
              ) : (
                <div className="space-y-3">
                  {detail.reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{r.author.name ?? t("store.anonymous")}</span>
                        <Stars value={r.rating} />
                      </div>
                      {r.body ? <p className="mt-1 text-sm text-muted-foreground">{r.body}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("store.consentTitle", { app: detail?.app.name ?? "" })}</DialogTitle>
              <DialogDescription>{t("store.consentDesc")}</DialogDescription>
            </DialogHeader>
            <ul className="space-y-1.5 text-sm">
              {(detail?.app.requiredScopes ?? []).map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-4 text-emerald-500" />
                  {SCOPE_LABELS[s] ?? s}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConsentOpen(false)}>{t("common.cancel")}</Button>
              <Button disabled={busy} onClick={() => doInstall(detail?.app.requiredScopes ?? [])}>{t("store.allowInstall")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────
  const cats: (string | null)[] = [null, ...CATEGORIES]
  const catLabel = (c: string | null) => t(`store.categories.${c ?? "all"}`)
  return (
    <div className="relative flex h-full select-none flex-col overflow-hidden bg-muted/20">
      {/* Üst bar — arama + "My Apps" (sağda) */}
      <div className="shrink-0 border-b border-border/60 p-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("store.searchPlaceholder")}
              className="w-full rounded-full border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 rounded-full"
            onClick={() => openMyApps("list")}
          >
            <HugeiconsIcon icon={DashboardSquare01Icon} className="size-4" strokeWidth={2} />
            <span className="hidden sm:inline">{t("store.myApps")}</span>
          </Button>
        </div>
      </div>

      {/* Gövde — kategori nav (web: sol sidebar, mobil/dar: üst yatay) + içerik */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <aside className="flex shrink-0 flex-row gap-0.5 overflow-x-auto border-b border-border/60 bg-background/40 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-44 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-3 sm:os-scrollbar">
          {cats.map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setCategory(c)}
              className={
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm font-medium capitalize transition-colors sm:w-full " +
                (category === c ? "bg-[#0a84ff] text-white" : "text-foreground hover:bg-foreground/5")
              }
            >
              {catLabel(c)}
            </button>
          ))}
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : filtering ? (
            // Arama/kategori → düz grid
            apps.length === 0 ? (
              <p className="mt-10 text-center text-sm text-muted-foreground">{t("store.empty")}</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {apps.map((a) => <AppCard key={a.appId} card={a} onOpen={openCard} />)}
              </div>
            )
          ) : sections && (sections.editorsChoice.length || sections.new.length || sections.mostDownloaded.length) ? (
            // Bölümlü görünüm (Apple App Store hissi)
            <div className="mx-auto w-full max-w-5xl space-y-9">
              {sections.editorsChoice.length > 0 ? (
                <section className="space-y-3">
                  <SectionTitle>{t("store.editorsChoice")}</SectionTitle>
                  <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
                    {sections.editorsChoice.map((a) => <FeatureCard key={a.appId} card={a} onOpen={openCard} />)}
                  </div>
                </section>
              ) : null}

              {sections.new.length > 0 ? (
                <section className="space-y-3">
                  <SectionTitle>{t("store.new")}</SectionTitle>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                    {sections.new.map((a) => <AppCard key={a.appId} card={a} onOpen={openCard} />)}
                  </div>
                </section>
              ) : null}

              {sections.mostDownloaded.length > 0 ? (
                <section className="space-y-3">
                  <SectionTitle>{t("store.mostDownloaded")}</SectionTitle>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                    {sections.mostDownloaded.map((a) => <AppCard key={a.appId} card={a} onOpen={openCard} />)}
                  </div>
                </section>
              ) : null}

              <p className="pt-2 text-center text-xs text-muted-foreground">
                {t("store.publishCta")}{" "}
                <button type="button" onClick={() => openMyApps("submit")} className="font-medium text-foreground underline-offset-2 hover:underline">
                  {t("store.publishLink")}
                </button>
              </p>
            </div>
          ) : (
            <p className="mt-10 text-center text-sm text-muted-foreground">{t("store.empty")}</p>
          )}
        </div>
      </div>

      <StoreMyAppsSidebar
        open={myAppsOpen}
        onClose={() => setMyAppsOpen(false)}
        companySlug={companySlug}
        initialScreen={myAppsScreen}
      />
    </div>
  )
}

// ─── Section building blocks ──────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold tracking-tight">{children}</h2>
}

function PublisherLine({ card }: { card: Card }) {
  const t = useTranslations("os")
  const label = card.firstParty ? (card.publisher ?? t("store.sentroy")) : card.tagline ?? card.developer?.name ?? ""
  return <div className="truncate text-xs text-muted-foreground">{label}</div>
}

/** Kompakt satır kartı — New / Most Popular / arama gridleri. */
function AppCard({ card, onOpen }: { card: Card; onOpen: (c: Card) => void }) {
  const t = useTranslations("os")
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="group relative flex items-center gap-3 rounded-2xl border bg-background p-3 text-left outline-none transition hover:shadow-md"
    >
      <Logo url={card.logoUrl} color={card.color} size="size-12" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{card.name}</span>
          {card.firstParty ? (
            <Badge variant="secondary" className="h-4 shrink-0 gap-0.5 px-1 text-[9px]">
              <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-2.5 text-sky-500" /> {t("store.sentroy")}
            </Badge>
          ) : null}
        </div>
        <PublisherLine card={card} />
        {card.firstParty ? null : <div className="mt-1"><Stars value={card.ratingAvg} count={card.ratingCount} /></div>}
      </div>
      {card.installed ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" /> {t("store.installedBadge")}
        </span>
      ) : (
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      )}
    </button>
  )
}

/** Büyük öne-çıkan kart — Editor's Choice yatay şeridi (cam + marka gradyan). */
function FeatureCard({ card, onOpen }: { card: Card; onOpen: (c: Card) => void }) {
  const t = useTranslations("os")
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      style={{ background: `linear-gradient(135deg, ${card.color}22, ${card.color}0a)` }}
      className="group relative flex w-64 shrink-0 flex-col justify-between overflow-hidden rounded-3xl border border-border/60 p-4 text-left outline-none transition hover:shadow-lg"
    >
      <div className="flex items-start justify-between">
        <Logo url={card.logoUrl} color={card.color} size="size-14" />
        {card.installed ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 backdrop-blur">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" /> {t("store.installedBadge")}
          </span>
        ) : null}
      </div>
      <div className="mt-6 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-base font-bold">{card.name}</span>
          {card.firstParty ? <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-3.5 shrink-0 text-sky-500" /> : null}
        </div>
        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {card.tagline ?? (card.firstParty ? (card.publisher ?? t("store.sentroy")) : card.developer?.name ?? "")}
        </div>
      </div>
    </button>
  )
}

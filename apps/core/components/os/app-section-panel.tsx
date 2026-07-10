"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { InternetIcon } from "@hugeicons/core-free-icons"
import { canAccessRoute } from "@workspace/auth/server/route-permissions"
import type { CompanyMember } from "@workspace/db/types"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { isTrustedOsOrigin } from "./os-open"
import { AppLaunchFallback, useAppProbe } from "./iframe-fallback"

type IconType = AppDescriptor["icon"]

export interface SectionConfig {
  id: string
  /** /[lang]/d/[slug]/<slug> — boşsa app kökü. */
  slug: string
  /** os.appSections.<labelKey> çeviri anahtarı. */
  labelKey: string
  icon: IconType
  color: string
  /** ROUTE_PERMISSIONS segment'i (canAccessRoute ile gate) — "" → herkese açık. */
  perm: string
  /** os.appSections.<groupKey> grup başlığı (opsiyonel). */
  groupKey?: string
  /** true → doğrulanmış domain gerektirir. Domain yüklenirken buton disable;
   *  domain yoksa içerik uyarı + domains linki gösterir (mail inbox/send vb.). */
  requiresDomain?: boolean
  /** iframe URL'ine eklenecek ek query (örn. "team=<id>") — `?embed=1&<search>`. */
  search?: string
  /** Dinamik (çevrilemez) etiket — verilirse labelKey çevirisi atlanır (takım adları). */
  rawLabel?: string
  /** Dinamik rozet — badgeSources poll'ünden bağımsız sabit sayı (takım backlog'u). */
  rawBadge?: number
  /** Harf-avatar — verilirse ikon yerine renkli karede bu harf render edilir (takımlar). */
  rawIconText?: string
}

/** Dinamik takım section'ları için renk paleti (linear TeamNavGroup ile aynı). */
const TEAM_SECTION_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
] as const

/**
 * OS içinde bir alt-app'i (mail/storage) OS-tarzı kenar çubuğuyla gösterir.
 * App'in kendi sidebar'ı embed'de gizli; navigasyon buradan. Her bölüm
 * `${appHref}/<slug>?embed=1` iframe'i. Bölümler aktif şirketteki üyelik
 * yetkilerine göre `canAccessRoute` ile filtrelenir (app sidebar'larıyla aynı
 * sistem). Ziyaret edilen bölümler mount kalır.
 */
export function AppSectionPanel({
  lang: _lang,
  slug,
  appHref,
  isAdmin,
  sections,
  accentIcon,
  accentColor,
  title,
  domainStatusUrl,
  badgeSources,
  teamNavUrl,
}: {
  lang: string
  slug: string
  appHref: string
  isAdmin: boolean
  sections: SectionConfig[]
  accentIcon: IconType
  accentColor: string
  title: string
  /** Verilirse `requiresDomain` section'ları bu URL'den domain durumuna göre
   *  gate edilir (mail: aktif domain var mı). Sonuç ölçülemezse (403/hata)
   *  gate UYGULANMAZ — API tarafı zaten domain'siz boş döner. */
  domainStatusUrl?: string
  /** Section tab rozetleri: her kaynak bir section id'sine bağlı bir URL'i
   *  60sn poll'ler (GET → `{data:{count}}`). Örn. Linear Inbox okunmamış.
   *  Section aktif edilince ilgili rozet iyimser sıfırlanır (sayfa server'da
   *  seen işaretler → sonraki poll 0). */
  badgeSources?: { sectionId: string; url: string }[]
  /** Takım navigasyonu (Linear): URL `{data:{groupByTeam, teams:[{id,key,name,
   *  backlogCount}]}}` döner. groupByTeam açıksa "overview" section'ı grup
   *  başlığına dönüşür: altında Tümü + takım linkleri (`?team=<id>` iframe'i),
   *  rozet = backlog sayısı. 60sn'de bir tazelenir. */
  teamNavUrl?: string
}) {
  const t = useTranslations("os")
  const [membership, setMembership] = useState<CompanyMember | null | undefined>(undefined)

  // Domain durumu: "loading" → bekliyor (domain section'ları disable),
  // "has" → en az bir aktif domain (gate yok), "none" → domain yok (uyarı).
  const [domainState, setDomainState] = useState<"loading" | "has" | "none">(
    domainStatusUrl ? "loading" : "has",
  )
  useEffect(() => {
    if (!domainStatusUrl) {
      setDomainState("has")
      return
    }
    let cancelled = false
    setDomainState("loading")
    ;(async () => {
      try {
        const r = await fetch(domainStatusUrl)
        // 403 (domain yetkisi yok) / hata → gate uygulama; API domain'siz boş döner.
        if (!r.ok) {
          if (!cancelled) setDomainState("has")
          return
        }
        const j = await r.json()
        const list = (j?.data as Array<{ status?: string }> | undefined) ?? []
        const hasActive = list.some((d) => d.status === "active")
        if (!cancelled) setDomainState(hasActive ? "has" : "none")
      } catch {
        if (!cancelled) setDomainState("has")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [domainStatusUrl])

  useEffect(() => {
    let cancelled = false
    setMembership(undefined)
    ;(async () => {
      try {
        const r = await fetch(`/api/companies/${slug}`)
        const j = await r.json()
        if (!cancelled) setMembership((j?.data?.membership as CompanyMember | undefined) ?? null)
      } catch {
        if (!cancelled) setMembership(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  const systemRole = isAdmin ? "admin" : undefined
  // --- Takım navigasyonu (Linear groupByTeam) ------------------------------
  const [teamNav, setTeamNav] = useState<
    { id: string; key: string; name: string; backlogCount: number }[] | null
  >(null)
  useEffect(() => {
    if (!teamNavUrl) return
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(teamNavUrl)
        if (!res.ok) return
        const json = (await res.json()) as {
          data?: { groupByTeam?: boolean; teams?: { id: string; key: string; name: string; backlogCount: number }[] }
        }
        if (!alive) return
        setTeamNav(json.data?.groupByTeam && Array.isArray(json.data.teams) ? json.data.teams : null)
      } catch {
        /* sessiz — takım nav'ı kritik yol değil */
      }
    }
    void load()
    const id = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [teamNavUrl])

  // groupByTeam açıkken overview grup başlığına dönüşür ve YALNIZ takım
  // linkleri listelenir ("tümü" girdisi bilinçli yok — kullanıcı kararı).
  const effectiveSections = useMemo<SectionConfig[]>(() => {
    if (!teamNav || teamNav.length === 0) return sections
    const out: SectionConfig[] = []
    for (const s of sections) {
      if (s.id === "overview") {
        teamNav.forEach((team, i) => {
          out.push({
            ...s,
            id: `team:${team.id}`,
            search: `team=${encodeURIComponent(team.id)}`,
            rawLabel: team.key || team.name,
            rawBadge: team.backlogCount,
            rawIconText: (team.key || team.name).charAt(0).toUpperCase(),
            color: TEAM_SECTION_COLORS[i % TEAM_SECTION_COLORS.length]!,
            groupKey: s.groupKey ?? "overview",
          })
        })
      } else {
        out.push(s)
      }
    }
    return out
  }, [sections, teamNav])

  const allowed =
    membership === undefined
      ? []
      : effectiveSections.filter((s) => canAccessRoute(membership, s.perm || "", systemRole))

  const [active, setActive] = useState<string>("")
  const [visited, setVisited] = useState<Set<string>>(() => new Set())
  // Section başına reload token — bump edilince ilgili iframe remount olur
  // (SectionFrame key'i değişir → sectionUrl yeniden yüklenir). Embed edilen
  // app "durumu değişti, bu section'ı tazele" dediğinde kullanılır.
  const [reloadTokens, setReloadTokens] = useState<Record<string, number>>({})

  useEffect(() => {
    if (membership === undefined) return
    setActive((prev) => (prev && allowed.some((s) => s.id === prev) ? prev : (allowed[0]?.id ?? "")))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership, slug])
  useEffect(() => {
    if (active) setVisited((v) => (v.has(active) ? v : new Set(v).add(active)))
  }, [active])

  // --- Section tab rozetleri (unread vb.) ----------------------------------
  const [badges, setBadges] = useState<Record<string, number>>({})
  const badgeKey = (badgeSources ?? [])
    .map((b) => `${b.sectionId}:${b.url}`)
    .join("|")
  useEffect(() => {
    if (!badgeSources || badgeSources.length === 0) return
    let cancelled = false
    const poll = async () => {
      await Promise.all(
        badgeSources.map(async (src) => {
          try {
            const r = await fetch(src.url)
            if (!r.ok) return
            const j = await r.json()
            const count = Number(j?.data?.count) || 0
            if (!cancelled)
              setBadges((m) =>
                m[src.sectionId] === count
                  ? m
                  : { ...m, [src.sectionId]: Math.max(0, count) },
              )
          } catch {
            /* ağ hatası rozeti bozmasın */
          }
        }),
      )
    }
    void poll()
    const id = setInterval(poll, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badgeKey])
  // Section aktif edilince rozetini iyimser sıfırla (sayfa server'da seen
  // işaretler; sonraki poll zaten 0 döner ama anında geri bildirim için).
  useEffect(() => {
    if (active) setBadges((m) => (m[active] ? { ...m, [active]: 0 } : m))
  }, [active])

  // Embed edilen alt-app iframe'inden "section değiştir" mesajı (örn. Linear
  // "not connected" CTA'sı → ayarlar). App kendi iframe'ini başka bir section'a
  // navigate edemez (o iframe'i strand eder + cross-origin geri alınamaz);
  // bunun yerine OS'a haber verir, OS doğru section tab'ına geçer. Yalnız bu
  // panel'in app origin'inden gelen mesajlar dikkate alınır.
  useEffect(() => {
    let appOrigin = ""
    try {
      appOrigin = new URL(appHref).origin
    } catch {
      /* relative appHref (dev) — origin eşleşmesi atlanır */
    }
    const onMessage = (e: MessageEvent) => {
      if (!isTrustedOsOrigin(e.origin)) return
      if (appOrigin && e.origin !== appOrigin) return
      const d = e.data as
        | { type?: string; slug?: string; reload?: boolean; switch?: boolean }
        | null
      if (!d || d.type !== "sentroy-os:section" || typeof d.slug !== "string") return
      const target = sections.find((s) => s.slug === d.slug)
      if (!target) return
      // switch:false → aktif section'ı değiştirmeden yalnız arka planda tazele
      // (örn. Linear yeni bağlandı → overview'i sessizce yenile, kullanıcı
      // ayarlarda kalsın). Varsayılan: geç (switch !== false).
      if (d.switch !== false) {
        setActive(target.id)
        setVisited((v) => (v.has(target.id) ? v : new Set(v).add(target.id)))
      }
      if (d.reload) {
        setReloadTokens((m) => ({ ...m, [target.id]: (m[target.id] ?? 0) + 1 }))
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [appHref, sections])

  const sectionUrl = (s: SectionConfig) =>
    `${appHref}${s.slug ? `/${s.slug}` : ""}?embed=1${s.search ? `&${s.search}` : ""}`

  const activeSection = allowed.find((s) => s.id === active)
  const domainsSectionId = allowed.find((s) => s.id === "domains")?.id
  // Aktif section domain gerektiriyor ama domain henüz yok/yükleniyor → iframe
  // yerine overlay (loading | uyarı) göster.
  const gateActive = Boolean(activeSection?.requiresDomain) && domainState !== "has"

  let lastGroup: string | undefined

  return (
    <div className="flex h-full select-none flex-col bg-background sm:flex-row">
      {/* Mobilde sidebar üstte yatay-scroll; sm+ solda dikey. */}
      <aside className="flex shrink-0 flex-row gap-0.5 overflow-x-auto border-b border-border/60 bg-muted/30 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-56 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-3 sm:os-scrollbar">
        <div className="mb-2 hidden items-center gap-2.5 px-1 pt-1 sm:flex">
          <span className="flex size-8 items-center justify-center rounded-lg text-white shadow-sm" style={{ background: accentColor }}>
            <HugeiconsIcon icon={accentIcon} className="size-4" strokeWidth={2} />
          </span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>

        {membership === undefined ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground/40" />
          </div>
        ) : allowed.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t("noAccessibleSections")}</p>
        ) : (
          allowed.map((s) => {
            const showGroup = s.groupKey && s.groupKey !== lastGroup
            lastGroup = s.groupKey
            const isActive = s.id === active
            // Domain yüklenirken domain'e bağlı section'lar tıklanamaz.
            const disabled = Boolean(s.requiresDomain) && domainState === "loading"
            return (
              <div key={s.id} className="shrink-0">
                {showGroup ? (
                  <p className="mb-0.5 mt-3 hidden px-2 text-[11px] font-medium text-muted-foreground first:mt-0 sm:block">
                    {t(`appSections.${s.groupKey}`)}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  title={disabled ? t("domainGate.loadingHint") : undefined}
                  onClick={() => {
                    if (disabled) return
                    if (s.id === active) {
                      // Bottom-tabs davranışı: aktifken tekrar tıklama iframe'i
                      // section köküne döndürür (remount → sectionUrl'e reset).
                      setReloadTokens((m) => ({ ...m, [s.id]: (m[s.id] ?? 0) + 1 }))
                      return
                    }
                    setActive(s.id)
                  }}
                  className={
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors " +
                    (disabled
                      ? "cursor-not-allowed opacity-40"
                      : isActive
                        ? "bg-[#0a84ff] text-white"
                        : "text-foreground hover:bg-foreground/5")
                  }
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm" style={{ background: s.color }}>
                    {s.rawIconText ? (
                      <span className="text-[11px] font-bold">{s.rawIconText}</span>
                    ) : (
                      <HugeiconsIcon icon={s.icon} className="size-4" strokeWidth={2} />
                    )}
                  </span>
                  <span className="whitespace-nowrap sm:truncate">
                    {s.rawLabel ?? t(`appSections.${s.labelKey}`)}
                  </span>
                  {s.requiresDomain && domainState === "loading" ? (
                    <span className="ml-auto hidden size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60 sm:block" />
                  ) : !isActive && (badges[s.id] ?? s.rawBadge ?? 0) > 0 ? (
                    <span
                      className={
                        "ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none " +
                        "bg-red-500 text-white"
                      }
                    >
                      {(badges[s.id] ?? s.rawBadge ?? 0) > 99 ? "99+" : (badges[s.id] ?? s.rawBadge)}
                    </span>
                  ) : null}
                </button>
              </div>
            )
          })
        )}
      </aside>

      <div className="relative min-w-0 flex-1 bg-background">
        {/* iframe'ler — domain gerektiren section'lar yalnız domain "has" iken
            mount edilir (aksi halde overlay gösterilir). */}
        {allowed
          .filter((s) => visited.has(s.id) && !(s.requiresDomain && domainState !== "has"))
          .map((s) => (
            <SectionFrame key={`${s.id}:${reloadTokens[s.id] ?? 0}`} title={s.rawLabel ?? t(`appSections.${s.labelKey}`)} src={sectionUrl(s)} active={s.id === active} color={s.color} icon={s.icon} />
          ))}

        {/* Aktif section domain bekliyor/eksik → overlay */}
        {gateActive ? (
          domainState === "loading" ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background">
              <span className="size-8 animate-spin rounded-full border-2 border-muted border-t-transparent" style={{ borderTopColor: activeSection?.color }} />
            </div>
          ) : (
            <DomainGate
              onGoToDomains={domainsSectionId ? () => setActive(domainsSectionId) : undefined}
            />
          )
        ) : null}
      </div>
    </div>
  )
}

/** Domain yokken domain-bağımlı bir section açıldığında gösterilen şık uyarı —
 *  kullanıcıyı domains bölümüne yönlendirir. */
function DomainGate({ onGoToDomains }: { onGoToDomains?: () => void }) {
  const t = useTranslations("os")
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500">
          <HugeiconsIcon icon={InternetIcon} className="size-7" strokeWidth={2} />
        </span>
        <h3 className="text-base font-semibold text-foreground">{t("domainGate.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("domainGate.desc")}</p>
        {onGoToDomains ? (
          <button
            type="button"
            onClick={onGoToDomains}
            className="mt-1 inline-flex items-center gap-2 rounded-lg bg-[#0a84ff] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0a84ff]/90"
          >
            <HugeiconsIcon icon={InternetIcon} className="size-4" strokeWidth={2} />
            {t("domainGate.cta")}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SectionFrame({ title, src, active, color, icon }: { title: string; src: string; active: boolean; color: string; icon: IconType }) {
  const [loaded, setLoaded] = useState(false)
  // Alt-app erişilemezse (502 vb.) çıplak hata HTML'i yerine OS fallback'i.
  const { state: probe, retry } = useAppProbe(src)
  if (probe === "down") {
    return (
      <div className="absolute inset-0" style={{ visibility: active ? "visible" : "hidden", zIndex: active ? 10 : 0 }}>
        <AppLaunchFallback icon={icon} color={color} name={title} onRetry={retry} />
      </div>
    )
  }
  return (
    <div className="absolute inset-0" style={{ visibility: active ? "visible" : "hidden", zIndex: active ? 10 : 0 }}>
      <iframe
        src={src}
        title={title}
        className="size-full border-0 bg-background"
        onLoad={() => setLoaded(true)}
        allow="clipboard-write; clipboard-read"
      />
      {!loaded ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <span className="size-8 animate-spin rounded-full border-2 border-muted border-t-transparent" style={{ borderTopColor: color }} />
        </div>
      ) : null}
    </div>
  )
}

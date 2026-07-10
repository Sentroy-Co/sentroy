import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { buildPublicSnapshot } from "@workspace/console/handlers/status-page-public"
import type { PublicStatusSnapshot } from "@workspace/console/handlers/status-page-public"
import {
  getPublicStrings,
  resolvePublicLang,
  type PublicStrings,
} from "../../../lib/public-strings"
import { SubscribeDialog } from "../../../../components/public/subscribe-dialog"
import { UptimeBar } from "../../../../components/public/uptime-bar"

export const dynamic = "force-dynamic"
export const revalidate = 30

interface Props {
  params: Promise<{ slug: string; lang: string }>
  searchParams: Promise<{ lang?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, lang } = await params
  const { lang: queryLang } = await searchParams
  // URL'deki [lang] path segmenti (/en, /tr) önceliklidir; ?lang= query
  // fallback, o da yoksa Accept-Language. Önceden sadece query'ye bakılıyordu
  // → /en/p/... sayfasında tarayıcı dili TR ise TR metin görünüyordu.
  const resolved = await resolvePublicLang(lang || queryLang)
  const snapshot = await buildPublicSnapshot(slug, { lang: resolved })
  if (!snapshot) return { title: "Status page not found" }
  const t = getPublicStrings(resolved)
  return {
    title: `${snapshot.page.branding.displayName || snapshot.page.name} ${t.metaTitleSuffix}`,
    description:
      snapshot.page.branding.tagline ||
      `${t.metaDescription}: ${snapshot.page.name}.`,
  }
}

export default async function PublicStatusPage({ params, searchParams }: Props) {
  const { slug, lang } = await params
  const { lang: queryLang } = await searchParams
  const resolved = await resolvePublicLang(lang || queryLang)
  const snapshot = await buildPublicSnapshot(slug, { lang: resolved })
  if (!snapshot) notFound()

  const t = getPublicStrings(resolved)
  const accent = snapshot.page.branding.primaryColor || "#111111"

  return (
    <div className="min-h-svh bg-background text-foreground">
      <Header snapshot={snapshot} accent={accent} t={t} />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <OverallBanner overall={snapshot.overall} accent={accent} t={t} />
        {snapshot.activeIncidents.length > 0 ? (
          <IncidentList
            title={t.activeIncidents}
            affectsLabel={t.affects}
            incidents={snapshot.activeIncidents}
            componentLookup={makeComponentLookup(snapshot)}
          />
        ) : null}
        {snapshot.activeMaintenances.length > 0 ? (
          <MaintenanceList
            title={t.activeMaintenance}
            affectsLabel={t.affects}
            maintenances={snapshot.activeMaintenances}
            componentLookup={makeComponentLookup(snapshot)}
            active
          />
        ) : null}
        {snapshot.upcomingMaintenances.length > 0 ? (
          <MaintenanceList
            title={t.scheduledMaintenance}
            affectsLabel={t.affects}
            maintenances={snapshot.upcomingMaintenances}
            componentLookup={makeComponentLookup(snapshot)}
          />
        ) : null}
        <ComponentsGrid components={snapshot.components} accent={accent} t={t} />
        {snapshot.pastIncidents.length > 0 ? (
          <PastIncidents
            title={t.pastIncidentsHeading}
            emptyLabel={t.pastIncidentsEmpty}
            incidents={snapshot.pastIncidents}
          />
        ) : null}
        <Footer snapshot={snapshot} t={t} />
      </main>
    </div>
  )
}

function makeComponentLookup(snapshot: PublicStatusSnapshot) {
  const map = new Map<string, string>()
  for (const c of snapshot.components) map.set(c.id, c.name)
  return (id: string) => map.get(id) ?? "Unknown component"
}

// ─── Header ───────────────────────────────────────────────────────────────

function Header({
  snapshot,
  accent,
  t,
}: {
  snapshot: PublicStatusSnapshot
  accent: string
  t: PublicStrings
}) {
  const { branding, name } = snapshot.page
  const displayName = branding.displayName || name
  const logoNode = branding.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={branding.logoUrl}
      alt={displayName}
      className="h-8 max-w-[140px] object-contain"
    />
  ) : (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold text-white"
      style={{ background: accent }}
    >
      {displayName.charAt(0).toUpperCase()}
    </div>
  )
  return (
    <header className="border-b">
      <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-3">
        {branding.logoLinkUrl ? (
          <a
            href={branding.logoLinkUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            {logoNode}
            <span className="truncate text-sm font-semibold">{displayName}</span>
          </a>
        ) : (
          <div className="flex items-center gap-2">
            {logoNode}
            <span className="truncate text-sm font-semibold">{displayName}</span>
          </div>
        )}
        <div className="flex-1" />
        {snapshot.page.subscribersEnabled ? (
          <SubscribeDialog
            pageSlug={snapshot.page.slug}
            accent={accent}
            components={snapshot.components.map((c) => ({ id: c.id, name: c.name }))}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
            strings={{
              triggerLabel: t.subscribeButton,
              title: t.subscribeTitle,
              description: t.subscribeHint,
              closeLabel: t.subscribeCloseLabel,
              submit: t.subscribeSubmit,
              submitting: t.subscribeSubmitting,
              successTitle: t.subscribeSuccessTitle,
              successEmail: t.subscribeSuccessBody,
              successTelegram: t.subscribeSuccessTelegram,
              successWebhook: t.subscribeSuccessWebhook,
              alreadyBody: t.subscribeAlreadyBody,
              errorPrefix: t.subscribeErrorPrefix,
              channelEmail: t.subscribeChannelEmail,
              channelTelegram: t.subscribeChannelTelegram,
              channelWebhook: t.subscribeChannelWebhook,
              emailLabel: t.subscribeEmailLabel,
              emailPlaceholder: t.subscribeEmailPlaceholder,
              telegramChatIdLabel: t.subscribeTelegramChatIdLabel,
              telegramChatIdHint: t.subscribeTelegramChatIdHint,
              telegramBotTokenLabel: t.subscribeTelegramBotTokenLabel,
              telegramBotTokenHint: t.subscribeTelegramBotTokenHint,
              telegramBotTokenPlaceholder: t.subscribeTelegramBotTokenPlaceholder,
              webhookUrlLabel: t.subscribeWebhookUrlLabel,
              webhookUrlPlaceholder: t.subscribeWebhookUrlPlaceholder,
              webhookSecretShown: t.subscribeWebhookSecretShown,
              topicSectionTitle: t.subscribeTopicSectionTitle,
              topicAll: t.subscribeTopicAll,
              topicIncidentsOnly: t.subscribeTopicIncidentsOnly,
              topicMaintenanceOnly: t.subscribeTopicMaintenanceOnly,
              componentSectionTitle: t.subscribeComponentsHeading,
              componentSectionHint: t.subscribeComponentSectionHint,
            }}
          />
        ) : null}
      </div>
    </header>
  )
}

// ─── Overall banner ───────────────────────────────────────────────────────

function OverallBanner({
  overall,
  accent: _accent,
  t,
}: {
  overall: PublicStatusSnapshot["overall"]
  accent: string
  t: PublicStrings
}) {
  const map = {
    operational: { bg: "#10b98114", bar: "#10b981", text: "#047857" },
    degraded: { bg: "#f59e0b14", bar: "#f59e0b", text: "#92400e" },
    down: { bg: "#ef444414", bar: "#ef4444", text: "#991b1b" },
    maintenance: { bg: "#3b82f614", bar: "#3b82f6", text: "#1e40af" },
    "no-data": { bg: "#64748b14", bar: "#64748b", text: "#334155" },
  } as const
  const cfg = { ...map[overall], label: t.overall[overall] }
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-6"
      style={{ background: cfg.bg, borderColor: `${cfg.bar}40` }}
    >
      <div
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: cfg.bar }}
      />
      <div className="flex items-center gap-3 ps-3">
        <span className="relative flex h-3 w-3">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: cfg.bar }}
          />
          <span
            className="relative inline-flex h-3 w-3 rounded-full"
            style={{ background: cfg.bar }}
          />
        </span>
        <h2 className="text-lg font-semibold" style={{ color: cfg.text }}>
          {cfg.label}
        </h2>
      </div>
    </div>
  )
}

// ─── Components grid ─────────────────────────────────────────────────────

function ComponentsGrid({
  components,
  accent,
  t,
}: {
  components: PublicStatusSnapshot["components"]
  accent: string
  t: PublicStrings
}) {
  if (components.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t.componentsEmpty}
      </p>
    )
  }

  // Group by groupKey
  const groups = new Map<string | null, typeof components>()
  for (const c of components) {
    const arr = groups.get(c.groupKey) ?? []
    arr.push(c)
    groups.set(c.groupKey, arr)
  }

  return (
    <section className="space-y-6">
      <h2 className="text-base font-semibold">{t.components}</h2>
      {Array.from(groups.entries()).map(([groupKey, items]) => (
        <div key={groupKey ?? "default"} className="space-y-2">
          {groupKey ? (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {groupKey}
            </h3>
          ) : null}
          <div className="overflow-hidden rounded-xl border bg-card">
            {items.map((component, idx) => (
              <ComponentRow
                key={component.id}
                component={component}
                accent={accent}
                hasBorder={idx > 0}
                t={t}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function ComponentRow({
  component,
  accent,
  hasBorder,
  t,
}: {
  component: PublicStatusSnapshot["components"][number]
  accent: string
  hasBorder: boolean
  t: PublicStrings
}) {
  const statusBadge = statusBadgeFor(component.status, accent, t)
  return (
    <div className={`flex flex-col gap-2 px-4 py-3 ${hasBorder ? "border-t" : ""}`}>
      {/* Üst satır: name + status badge inline */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className="truncate text-sm font-medium">{component.name}</span>
          {component.checks.length > 1 ? (
            <span className="text-[10px] text-muted-foreground">
              ({component.checks.length} {t.checksSuffix})
            </span>
          ) : null}
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
          style={{
            background: `${statusBadge.color}1a`,
            color: statusBadge.color,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: statusBadge.color }}
          />
          {statusBadge.label}
        </span>
      </div>
      {/* Optional description */}
      {component.description ? (
        <p className="truncate text-[11px] text-muted-foreground">
          {component.description}
        </p>
      ) : null}
      {/* Uptime bar (full width) */}
      <UptimeBar
        history={component.dailyHistory}
        labels={{
          operational: t.status.operational,
          degraded: t.status.degraded,
          down: t.status.down,
          noData: t.status["no-data"],
        }}
      />
      {/* Footer: 90 days ago / today + uptime % */}
      <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span>{t.uptimeBar90d}</span>
        <span className="flex items-center gap-3">
          {typeof component.uptime24h === "number" ? (
            <span>{t.uptime24h}: {component.uptime24h.toFixed(2)}%</span>
          ) : null}
          {typeof component.uptime30d === "number" ? (
            <span>{t.uptime30d}: {component.uptime30d.toFixed(2)}%</span>
          ) : null}
        </span>
      </div>
    </div>
  )
}

function statusBadgeFor(
  status: PublicStatusSnapshot["components"][number]["status"],
  _accent: string,
  t: PublicStrings,
): { label: string; color: string } {
  const colorMap = {
    operational: "#10b981",
    degraded: "#f59e0b",
    down: "#ef4444",
    maintenance: "#3b82f6",
    "no-data": "#64748b",
  } as const
  return { label: t.status[status], color: colorMap[status] }
}

// ─── Incidents ────────────────────────────────────────────────────────────

function IncidentList({
  title,
  affectsLabel,
  incidents,
  componentLookup,
}: {
  title: string
  affectsLabel: string
  incidents: PublicStatusSnapshot["activeIncidents"]
  componentLookup: (id: string) => string
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="space-y-3">
        {incidents.map((inc) => (
          <article
            key={inc.id}
            className="rounded-xl border bg-card overflow-hidden"
          >
            <div className="border-b bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: impactColor(inc.impact) }}
                />
                <h3 className="truncate text-sm font-semibold">{inc.title}</h3>
                <span className="ms-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                  {inc.status}
                </span>
              </div>
              {inc.affectedComponentIds.length > 0 ? (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {affectsLabel}: {inc.affectedComponentIds.map(componentLookup).join(", ")}
                </p>
              ) : null}
            </div>
            <div className="divide-y">
              {[...inc.updates]
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                .slice(0, 5)
                .map((u) => (
                  <div key={u.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium uppercase tracking-wider">
                        {u.status}
                      </span>
                      <time dateTime={u.createdAt.toISOString()}>
                        {new Date(u.createdAt).toUTCString()}
                      </time>
                    </div>
                    <p className="mt-1 text-foreground/90 leading-relaxed">
                      {u.body}
                    </p>
                  </div>
                ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function impactColor(impact: string): string {
  switch (impact) {
    case "critical":
      return "#ef4444"
    case "major":
      return "#f59e0b"
    default:
      return "#64748b"
  }
}

// ─── Maintenances ─────────────────────────────────────────────────────────

function MaintenanceList({
  title,
  affectsLabel,
  maintenances,
  componentLookup,
  active,
}: {
  title: string
  affectsLabel: string
  maintenances: PublicStatusSnapshot["upcomingMaintenances"]
  componentLookup: (id: string) => string
  active?: boolean
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="space-y-2">
        {maintenances.map((m) => (
          <article
            key={m.id}
            className={`rounded-xl border bg-card p-4 ${active ? "border-blue-500/40 bg-blue-500/5" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full bg-blue-500 ${active ? "animate-pulse" : ""}`}
              />
              <h3 className="truncate text-sm font-semibold">{m.title}</h3>
              {active ? (
                <span className="ms-auto rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  in progress
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {new Date(m.scheduledStart).toUTCString()} →{" "}
              {new Date(m.scheduledEnd).toUTCString()}
            </p>
            {m.affectedComponentIds.length > 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {affectsLabel}: {m.affectedComponentIds.map(componentLookup).join(", ")}
              </p>
            ) : null}
            {m.description ? (
              <p className="mt-2 text-sm leading-relaxed">{m.description}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Past incidents (history archive) ────────────────────────────────────

function PastIncidents({
  title,
  emptyLabel,
  incidents,
}: {
  title: string
  emptyLabel: string
  incidents: PublicStatusSnapshot["pastIncidents"]
}) {
  // Group by day (YYYY-MM-DD) using startedAt date
  const groups = new Map<string, typeof incidents>()
  for (const inc of incidents) {
    const d = new Date(inc.startedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const arr = groups.get(key) ?? []
    arr.push(inc)
    groups.set(key, arr)
  }
  const sortedDays = Array.from(groups.keys()).sort().reverse()

  if (sortedDays.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="space-y-4">
        {sortedDays.map((dayKey) => {
          const items = groups.get(dayKey)!
          const date = new Date(dayKey)
          const dayLabel = date.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })
          return (
            <div key={dayKey} className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {dayLabel}
              </h3>
              <div className="overflow-hidden rounded-xl border bg-card">
                {items.map((inc, idx) => (
                  <div
                    key={inc.id}
                    className={`flex items-start gap-3 px-4 py-3 ${idx > 0 ? "border-t" : ""}`}
                  >
                    <span
                      className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: impactColor(inc.impact) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{inc.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(inc.startedAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {inc.resolvedAt ? (
                          <>
                            {" → "}
                            {new Date(inc.resolvedAt).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </>
                        ) : null}
                        {" · "}
                        <span className="capitalize">{inc.impact}</span>
                      </p>
                      {inc.postmortem ? (
                        <details className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                          <summary className="cursor-pointer select-none font-medium text-foreground">
                            Postmortem
                          </summary>
                          <div className="mt-2 whitespace-pre-wrap text-muted-foreground">
                            {inc.postmortem}
                          </div>
                          {inc.postmortemPublishedAt ? (
                            <div className="mt-2 text-[10px] text-muted-foreground/80">
                              {new Date(inc.postmortemPublishedAt).toLocaleString()}
                            </div>
                          ) : null}
                        </details>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────

function Footer({
  snapshot,
  t,
}: {
  snapshot: PublicStatusSnapshot
  t: PublicStrings
}) {
  return (
    <footer className="border-t pt-6 text-center text-[11px] text-muted-foreground">
      <p>
        {t.footerGenerated}{" "}
        <time dateTime={snapshot.generatedAt.toISOString()}>
          {new Date(snapshot.generatedAt).toUTCString()}
        </time>
      </p>
      <p className="mt-3 flex items-center justify-center gap-1.5">
        <span>{t.footerPoweredBy}</span>
        <a
          href="https://sentroy.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
        >
          {/* Sentroy logo (inline SVG — paket bağımlılığı yok) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-3.5 w-3.5 text-foreground"
            aria-label="Sentroy"
          >
            <circle cx="12" cy="12" r="10" />
          </svg>
          <span className="font-semibold text-foreground">Sentroy</span>
          <span className="text-muted-foreground">| Status</span>
        </a>
      </p>
    </footer>
  )
}

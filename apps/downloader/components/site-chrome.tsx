import { getTranslations } from "next-intl/server"
import { cn } from "@workspace/ui/lib/utils"
import {
  serverRootDomain,
  rootOrigin,
  subAppOrigin,
} from "@workspace/auth/lib/domains"
import pkg from "../package.json"
import { PLATFORMS, PLATFORM_ORDER, type Platform, type SiteSection } from "@/lib/platform"
import { routing, type Locale } from "@/i18n/routing"
import { blogIndexPath } from "@/lib/blog/url"
import { LanguageSwitcher } from "./language-switcher"
import { UrlTrickButton } from "./url-trick-button"
import { HeaderShell } from "./header-shell"
import { Ambiance } from "./ambiance"

/** FAQ statik route yolu (as-needed: en prefix'siz). */
function faqPath(lang: string): string {
  return lang === routing.defaultLocale ? "/faq" : `/${lang}/faq`
}

export async function SiteHeader({
  platform,
  lang: _lang,
}: {
  platform: Platform
  lang: string
}) {
  const cfg = PLATFORMS[platform]
  return (
    <HeaderShell
      left={<LanguageSwitcher />}
      right={<UrlTrickButton platform={cfg.label} domain={cfg.host} />}
    />
  )
}

export async function SiteFooter({
  platform,
  lang,
  fullHeight = false,
  section = "download",
}: {
  platform: Platform
  lang: string
  /** Anasayfada tam-ekran (1 ekran) premium "sahne" + scroll-snap. */
  fullHeight?: boolean
  /** "tools" ise blog/faq linkleri gizlenir (o sayfalar download bölümüne ait). */
  section?: SiteSection
}) {
  const t = await getTranslations({ locale: lang, namespace: "d" })
  // Cross-app linkleri ROOT_DOMAIN'den türetilir (default sentroy.com → aynı).
  const root = serverRootDomain()
  const products = [
    { name: "Mail", desc: "Transactional email API", href: subAppOrigin(root, "mail") },
    { name: "Storage", desc: "Object storage + CDN", href: subAppOrigin(root, "storage") },
    { name: "Auth", desc: "Auth-as-a-service", href: subAppOrigin(root, "auth") },
    { name: "Vault", desc: "Env & secrets vault", href: subAppOrigin(root, "vault") },
    { name: "Status", desc: "Status pages", href: subAppOrigin(root, "status") },
    { name: "WhatsApp", desc: "WhatsApp inbox", href: subAppOrigin(root, "whatsapp") },
  ]
  return (
    // Koyu premium sahne — light logo (beyaz mürekkep) için koyu zemin.
    <footer
      id="site-footer"
      data-app-chrome
      className={cn(
        "relative flex flex-col overflow-hidden bg-zinc-950 text-zinc-100",
        fullHeight ? "min-h-[100svh] snap-start justify-center" : "mt-20",
      )}
    >
      {/* Animasyonlu ambiyans — yavaş sonsuz gradient hareketi */}
      <Ambiance />

      <div className="relative mx-auto w-full max-w-5xl px-6 py-16">
        <div className="flex flex-col gap-12">
          {/* Marka — büyük light logo (contain, ölçek bozulmaz) */}
          <div className="flex max-w-xl flex-col gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/business/sentroy-logo-dark.png"
              alt="Sentroy"
              className="h-11 w-auto max-w-[220px] object-contain"
            />
            <p className="text-base leading-relaxed text-zinc-400">
              {t("footerExploreDesc")}
            </p>
            <a
              href={rootOrigin(root)}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              {t("footerVisitSentroy")}
            </a>
          </div>

          {/* Diğer ürünler — keşif grid */}
          <div className="flex flex-col gap-5">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {t("footerExplore")}
            </span>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <a
                  key={p.name}
                  href={p.href}
                  className="group flex flex-col gap-0.5 rounded-2xl border border-white/5 bg-white/[0.03] px-5 py-4 transition-colors hover:border-primary/40 hover:bg-white/[0.06]"
                >
                  <span className="font-semibold text-zinc-100 transition-colors group-hover:text-primary">
                    {p.name}
                  </span>
                  <span className="text-sm text-zinc-500">{p.desc}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 text-xs text-zinc-500">
          {section === "download" ? (
            <p className="max-w-2xl leading-relaxed">{t("footerTos")}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span>© {COPYRIGHT_YEAR} Sentroy</span>
            {APP_VERSION ? <span className="text-zinc-600">v{APP_VERSION}</span> : null}
            {section === "tools" ? (
              <>
                <a href="/" className="transition-colors hover:text-zinc-200">
                  {t("toolsAllTools")}
                </a>
                <a href={blogIndexPath(lang as Locale)} className="transition-colors hover:text-zinc-200">
                  {t("toolsGuides")}
                </a>
              </>
            ) : (
              <>
                <a href={blogIndexPath(lang as Locale)} className="transition-colors hover:text-zinc-200">
                  {t("blogGuides")}
                </a>
                <a href={faqPath(lang)} className="transition-colors hover:text-zinc-200">
                  {t("faqTitle")}
                </a>
              </>
            )}
            {PLATFORM_ORDER.map((id) => {
              const p = PLATFORMS[id]
              if (id === platform || !p.enabled) return null
              return (
                <a
                  key={id}
                  href={`https://${p.host}`}
                  className="transition-colors hover:text-zinc-200"
                >
                  {p.label}
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </footer>
  )
}

const COPYRIGHT_YEAR = 2026
// Proje sürümü — package.json'dan build-time inline (dev + prod deterministik;
// next.config env inlining turbopack dev'de server component'e ulaşmıyordu).
const APP_VERSION = pkg.version || ""

"use client"

// Landing v2 — "Web'de Sentroy OS" kabuğu.
//
// Anlatı: boot → manifesto → Build → Operate → Create → Exposé finali → SDK →
// Pricing → Proof → "Bu masaüstü senin". Dock (DockNav) sayfa boyunca sabit
// anlatı omurgası: ikonlar sönük başlar, sahneler oynadıkça yanar.
//
// Eski landing (../landing-page.tsx) DOKUNULMADAN durur; app/[lang]/page.tsx
// LANDING_LEGACY=1 env'i ile ona geri döner.

import { useEffect } from "react"
import dynamic from "next/dynamic"
import Lenis from "lenis"
import "lenis/dist/lenis.css"
import { useTranslations } from "next-intl"
import { usePathname, useRouter } from "@workspace/auth/i18n/routing"
import { CookieConsent, LanguageCombobox } from "@workspace/console/components/shared"
import { MarketingFooter } from "@workspace/console/components/marketing"
import {
  GithubIcon,
  NewTwitterIcon,
  Linkedin01Icon,
  DiscordIcon,
  Facebook01Icon,
  InstagramIcon,
} from "@hugeicons/core-free-icons"

import { LandingV2Provider } from "./landing-context"
import { ParallaxWallpaper } from "./primitives/parallax-wallpaper"
import { DockNav } from "./primitives/dock-nav"
import { GlassNav, type GlassNavItem } from "./primitives/glass-nav"
import { setLenis } from "./primitives/lenis-store"
import { BootHero } from "./sections/boot-hero"
import { Manifesto } from "./sections/manifesto"

// Above-fold (BootHero + Manifesto) statik import. Below-fold sahneler
// next/dynamic ile code-split → ilk client chunk'tan çıkar. ssr:true (default)
// olduğu için SSR HTML + SEO korunur ve layout SSR'dan geldiğinden scroll/CLS
// jank'ı yok; yalnız hydration JS'i ayrı, lazy chunk'lara bölünür.
const SceneBuild = dynamic(() => import("./sections/scene-build").then((m) => m.SceneBuild))
const SceneOperate = dynamic(() => import("./sections/scene-operate").then((m) => m.SceneOperate))
const SceneCreate = dynamic(() => import("./sections/scene-create").then((m) => m.SceneCreate))
const ExposeFinale = dynamic(() => import("./sections/expose-finale").then((m) => m.ExposeFinale))
const SdkTerminal = dynamic(() => import("./sections/sdk-pricing").then((m) => m.SdkTerminal))
const PricingGlass = dynamic(() => import("./sections/sdk-pricing").then((m) => m.PricingGlass))
const ProofFaq = dynamic(() => import("./sections/proof-cta").then((m) => m.ProofFaq))
const YourDesktop = dynamic(() => import("./sections/proof-cta").then((m) => m.YourDesktop))

const CORE_LOCALES = ["en", "tr"] as const

/** Dock tooltip adları — ürün/marka adları çevrilmez (bkz. landing-v2.json products). */
function useProductNames(): Record<string, string> {
  const t = useTranslations("landingV2")
  return {
    mail: t("products.mail"),
    storage: t("products.storage"),
    auth: t("products.auth"),
    vault: t("products.vault"),
    status: t("products.status"),
    meet: t("products.meet"),
    whatsapp: t("products.whatsapp"),
    linear: t("products.linear"),
    studio: t("products.studio"),
    opencut: t("products.opencut"),
    tools: t("products.tools"),
    os: t("products.os"),
  }
}

export function LandingV2({ lang }: { lang: string }) {
  // Premium inertial smooth-scroll — eski landing ile aynı reçete, sayfa-scoped.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
    })
    setLenis(lenis) // GlassNav + DockNav programatik smooth scroll için
    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)
    return () => {
      cancelAnimationFrame(rafId)
      setLenis(null)
      lenis.destroy()
    }
  }, [])

  return (
    <LandingV2Provider>
      {/* v2 daima koyu sahne — tema toggle'ından bağımsız (OS gece masaüstü). */}
      <div className="lv2-root dark relative min-h-screen bg-[#04050a] text-white antialiased">
        {/* Özel metin seçimi — premium detay: marka indigo'su, sayfa-scoped. */}
        <style>{`
          .lv2-root ::selection {
            background: rgba(99, 102, 241, 0.85);
            color: #fff;
            -webkit-text-fill-color: #fff;
          }
        `}</style>
        <ParallaxWallpaper />
        <HeaderAdapter lang={lang} />
        <main>
          <BootHero />
          <Manifesto />
          <SceneBuild />
          <SceneOperate />
          <SceneCreate />
          <ExposeFinale />
          <SdkTerminal />
          <PricingGlass />
          <ProofFaq />
          <YourDesktop lang={lang} />
        </main>
        <FooterAdapter lang={lang} />
        <DockNavAdapter />
        <CookieConsent />
      </div>
    </LandingV2Provider>
  )
}

function DockNavAdapter() {
  const productNames = useProductNames()
  return <DockNav productNames={productNames} />
}

function HeaderAdapter({ lang }: { lang: string }) {
  const t = useTranslations("landingV2")
  const router = useRouter()
  const pathname = usePathname()

  const navItems: GlassNavItem[] = [
    { id: "lv2-build", label: t("nav.build") },
    { id: "lv2-operate", label: t("nav.operate") },
    { id: "lv2-create", label: t("nav.create") },
    { id: "sdk", label: t("nav.dev") },
    { id: "pricing", label: t("nav.pricing") },
    { id: "proof", label: t("nav.faq") },
  ]

  return (
    <GlassNav
      lang={lang}
      items={navItems}
      signInLabel={t("nav.signIn")}
      getStartedLabel={t("nav.getStarted")}
      dashboardLabel={t("nav.dashboard")}
      languageSwitcher={
        <LanguageCombobox
          current={lang}
          locales={CORE_LOCALES}
          onSelect={(l) =>
            router.replace(pathname, { locale: l as (typeof CORE_LOCALES)[number] })
          }
        />
      }
    />
  )
}

function FooterAdapter({ lang }: { lang: string }) {
  // Footer metinleri eski "landing" namespace'inden — çevirileri hazır,
  // v2'de kopyalamak drift üretir.
  const t = useTranslations("landing")
  return (
    <div id="lv2-footer" className="pb-10">
      {/* id: DockNav footer'ı görünce kendini gizler (linklerin üstüne binmez). */}
      <MarketingFooter
        lang={lang}
        tagline={t("footerTagline")}
        statusLabel={t("footerStatus")}
        copyright={`© ${new Date().getFullYear()} Sentroy. ${t("footerRights")}`}
        socials={[
          { href: "https://instagram.com/sentroycom", label: "Instagram", icon: InstagramIcon },
          { href: "https://www.facebook.com/sentroycom", label: "Facebook", icon: Facebook01Icon },
          { href: "https://github.com/Sentroy-Co", label: "GitHub", icon: GithubIcon },
          { href: "https://x.com/sentroy", label: "Twitter", icon: NewTwitterIcon },
          { href: "https://linkedin.com/company/sentroy", label: "LinkedIn", icon: Linkedin01Icon },
          { href: "https://discord.com/channels/1522731613841129634", label: "Discord", icon: DiscordIcon },
        ]}
        columns={[
          {
            heading: t("footerProduct"),
            items: [
              { label: "Mail", href: "https://mail.sentroy.com" },
              { label: "Storage", href: "https://storage.sentroy.com" },
              { label: "Auth", href: "https://auth.sentroy.com" },
              { label: "Status", href: "https://status.sentroy.com" },
              { label: "Meet", href: "https://meet.sentroy.com" },
              { label: "Tools", href: "https://tools.sentroy.com" },
            ],
          },
          {
            heading: t("footerDevelopers"),
            items: [
              { label: "Docs", href: "/docs" },
              { label: "SDK", href: "https://github.com/Sentroy-Co" },
              { label: "Fair Source", href: "https://github.com/Sentroy-Co/sentroy" },
              { label: "Status", href: "https://status.sentroy.com" },
            ],
          },
          {
            heading: t("footerCompany"),
            items: [
              { label: t("footerGetStarted"), href: `/${lang}/signup` },
              { label: t("signIn"), href: `/${lang}/login` },
              { label: t("footerVision"), href: `/${lang}/vision` },
              { label: t("footerInvestors"), href: `/${lang}/investors` },
              { label: t("footerBrand"), href: `/${lang}/brand` },
              { label: t("footerContact"), href: `/${lang}/contact` },
            ],
          },
          {
            heading: t("footerLegal"),
            items: [{ label: t("footerLegalFallback"), href: `/${lang}/p/privacy-policy` }],
          },
        ]}
      />
    </div>
  )
}

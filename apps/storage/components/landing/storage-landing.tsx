"use client"

import { useEffect, useRef } from "react"
import { motion, useInView, useScroll, useTransform } from "framer-motion"
import { useTranslations } from "next-intl"
import {
  MarketingHeader,
  MarketingFooter,
  CodeBlock,
} from "@workspace/console/components/marketing"
import { CookieConsent } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CloudUploadIcon,
  Image01Icon,
  Globe02Icon,
  ShieldKeyIcon,
  ArrowRight01Icon,
  CodeIcon,
  Layers01Icon,
  FlashIcon,
  GithubIcon,
  NewTwitterIcon,
  Linkedin01Icon,
  DiscordIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * storage.sentroy.com landing — anonim ziyaretçilerin gördüğü pazarlama
 * sayfası. Login user'lar bu sayfaya gelmeden `/d`'ye redirect olur (bkz.
 * `apps/storage/app/[lang]/page.tsx`).
 *
 * Core landing ile aynı `MarketingHeader` + `MarketingFooter` shell'i
 * kullanır; içerik storage-spesifik (bucket, image transform, signed URL,
 * multipart upload, CDN edge cache).
 */

const FEATURES = [
  { id: "buckets", icon: Layers01Icon },
  { id: "transforms", icon: Image01Icon },
  { id: "multipart", icon: CloudUploadIcon },
  { id: "cdn", icon: Globe02Icon },
  { id: "signed", icon: ShieldKeyIcon },
  { id: "sdk", icon: CodeIcon },
] as const

export function StorageLandingPage({ lang }: { lang: string }) {
  const t = useTranslations("landing")
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])

  return (
    <div className="flex min-h-svh flex-col overflow-x-hidden">
      <MarketingHeader
        lang={lang}
        logoHref="#top"
        navItems={[
          { id: "features", label: t("navFeatures") },
          { id: "how", label: t("navHow") },
          { id: "sdk", label: t("navSdk") },
          { id: "pricing", label: t("navPricing") },
        ]}
        signedInCta={{
          label: t("navDashboard"),
          href: `/${lang}/d`,
        }}
        signedOutCtas={[
          {
            label: t("navDocs"),
            href: "https://sentroy.com/docs",
            variant: "ghost",
            hideOnMobile: true,
            external: true,
          },
          {
            label: t("signIn"),
            href: `https://sentroy.com/${lang}/login`,
            variant: "ghost",
            hideOnMobile: true,
          },
          {
            label: t("getStarted"),
            href: `https://sentroy.com/${lang}/signup`,
          },
        ]}
      />

      {/* Hero */}
      <section
        id="top"
        ref={heroRef}
        className="relative overflow-hidden pt-32 pb-24 lg:pt-40"
      >
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-[0.06]" />
        <div className="absolute top-10 left-1/2 -z-10 size-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="mx-auto max-w-5xl px-6 text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            {t("heroBadge")}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
          >
            {t.rich("heroTitle", {
              accent: (chunks) => (
                <span className="bg-gradient-to-br from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                  {chunks}
                </span>
              ),
            })}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg"
          >
            {t("heroSubtitle")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button
              size="lg"
              render={<a href={`https://sentroy.com/${lang}/signup`} />}
            >
              {t("heroCta")}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-4"
              />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<a href="#features" />}
            >
              {t("heroCtaSecondary")}
            </Button>
          </motion.div>

          {/* Hero visual — endpoint URL example */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mx-auto mt-14 max-w-3xl"
          >
            <div className="rounded-2xl border bg-background/40 p-3 shadow-2xl backdrop-blur-sm">
              <div className="rounded-xl border bg-card p-4 sm:p-6">
                <div className="mb-3 flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-rose-400/60" />
                  <span className="size-2.5 rounded-full bg-amber-400/60" />
                  <span className="size-2.5 rounded-full bg-emerald-400/60" />
                  <span className="ml-3 truncate font-mono text-[11px] text-muted-foreground">
                    GET cdn.sentroy.com/f/&lt;media-id&gt;/large
                  </span>
                </div>
                <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  <code>{`HTTP/2 200 OK
Cache-Control: public, max-age=31536000, immutable
Content-Type: image/webp
X-Sentroy-Bucket: brand-assets
X-Sentroy-Transform: w=1200,fmt=webp,q=82
ETag: "9c2a6f1b4d8e3a"
Vary: Accept`}</code>
                </pre>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">
                {t("featuresEyebrow")}
              </p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                {t("featuresTitle")}
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                {t("featuresSubtitle")}
              </p>
            </div>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.id} delay={i * 0.05}>
                <FeatureCard
                  icon={f.icon}
                  title={t(`feature_${f.id}_title`)}
                  description={t(`feature_${f.id}_desc`)}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative border-t bg-muted/20 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="mx-auto mb-16 max-w-2xl text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">
                {t("howEyebrow")}
              </p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                {t("howTitle")}
              </h2>
            </div>
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-3">
            {[1, 2, 3].map((step, i) => (
              <Reveal key={step} delay={i * 0.08}>
                <div className="relative rounded-2xl border bg-background p-6">
                  <div className="absolute -top-3 left-6 rounded-full bg-foreground px-2.5 py-0.5 font-mono text-[10px] text-background">
                    0{step}
                  </div>
                  <h3 className="mt-2 text-base font-semibold">
                    {t(`how_step${step}_title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(`how_step${step}_desc`)}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SDK code */}
      <section id="sdk" className="relative py-24">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">
                {t("sdkEyebrow")}
              </p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                {t("sdkTitle")}
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                {t("sdkSubtitle")}
              </p>
            </div>
          </Reveal>
          <Reveal>
            <CodeBlock
              language="ts"
              filename="upload.ts"
              className="rounded-2xl border bg-[#0d1117] p-4 shadow-2xl"
              code={`import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "acme",
  accessToken: process.env.SENTROY_TOKEN!,
})

// Multipart upload (3-paralel pool, otomatik)
const media = await sentroy.media.upload({
  bucket: "brand-assets",
  file: imageBlob,
  filename: "hero.png",
})

// Anında CDN URL — hash-resistant cache
console.log(media.publicUrl)
// → https://cdn.sentroy.com/f/m_9c2a.../original`}
            />
          </Reveal>
        </div>
      </section>

      {/* Pricing teaser → core */}
      <section id="pricing" className="relative border-t bg-muted/20 py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Reveal>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">
              {t("pricingEyebrow")}
            </p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("pricingTitle")}
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              {t("pricingSubtitle")}
            </p>
            <ul className="mx-auto mt-8 grid max-w-md gap-3 text-start">
              {[1, 2, 3].map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    strokeWidth={2}
                    className="mt-0.5 size-4 shrink-0 text-emerald-500"
                  />
                  <span>{t(`pricing_bullet${b}`)}</span>
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              className="mt-8"
              render={<a href={`https://sentroy.com/${lang}/signup`} />}
            >
              {t("pricingCta")}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-4"
              />
            </Button>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <MarketingFooter
        lang={lang}
        tagline={t("footerTagline")}
        statusLabel={t("footerStatus")}
        copyright={`© ${new Date().getFullYear()} Sentroy. ${t("footerRights")}`}
        socials={[
          {
            href: "https://github.com/Sentroy-Co",
            label: "GitHub",
            icon: GithubIcon,
          },
          {
            href: "https://twitter.com/sentroy",
            label: "Twitter",
            icon: NewTwitterIcon,
          },
          {
            href: "https://linkedin.com/company/sentroy",
            label: "LinkedIn",
            icon: Linkedin01Icon,
          },
          {
            href: "https://discord.gg/sentroy",
            label: "Discord",
            icon: DiscordIcon,
          },
        ]}
        columns={[
          {
            heading: t("footerProduct"),
            items: [
              { href: "#features", label: t("navFeatures") },
              { href: "#how", label: t("navHow") },
              { href: "#sdk", label: t("navSdk") },
              { href: "#pricing", label: t("navPricing") },
            ],
          },
          {
            heading: t("footerDevelopers"),
            items: [
              {
                href: "https://sentroy.com/docs",
                label: t("footerDocs"),
                external: true,
              },
              {
                href: `${process.env.NEXT_PUBLIC_STATUS_URL || "https://status.sentroy.com"}/${lang}`,
                label: "Status",
                external: true,
              },
              {
                href: "https://github.com/Sentroy-Co",
                label: "GitHub",
                external: true,
              },
              {
                href: `https://sentroy.com/${lang}/login`,
                label: t("footerDashboard"),
              },
            ],
          },
          {
            heading: t("footerSentroy"),
            items: [
              { href: "https://sentroy.com", label: t("footerCore") },
              { href: "https://mail.sentroy.com", label: t("footerMail") },
              { href: "https://auth.sentroy.com", label: t("footerAuth") },
            ],
          },
          {
            heading: t("footerCompany"),
            items: [
              {
                href: `https://sentroy.com/${lang}/signup`,
                label: t("footerGetStarted"),
              },
              {
                href: `https://sentroy.com/${lang}/contact`,
                label: t("footerContact"),
                external: true,
              },
            ],
          },
        ]}
      />

      <CookieConsent />
    </div>
  )
}

function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1], delay }}
    >
      {children}
    </motion.div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: typeof CloudUploadIcon
  title: string
  description: string
}) {
  return (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-2xl border bg-background p-6",
        "transition-[border-color,box-shadow,transform] duration-300",
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5",
      )}
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/8 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
      </div>
      <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

// Suppress unused — FlashIcon imported for future feature card swap
void FlashIcon

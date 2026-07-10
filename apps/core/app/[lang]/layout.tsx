import type { Metadata, Viewport } from "next"
import { cache } from "react"
import { localizedAlternates } from "@/lib/seo-alternates"
import { Geist_Mono, Outfit } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { routing } from "@workspace/auth/i18n/routing"
import { UIProviders } from "@workspace/console/components/providers/ui-providers"
import { CookieConsent } from "@workspace/console/components/shared"
import { AnalyticsScripts } from "@workspace/console/components/marketing"
import { get as getSeoSettings } from "@workspace/db/models/seo-settings"
import { cn } from "@workspace/ui/lib/utils"
import "@workspace/ui/globals.css"

const SITE_URL = "https://sentroy.com"

const DEFAULT_TITLE =
  "Sentroy — Transactional email, object storage, auth & secrets in one SDK"

const DEFAULT_DESCRIPTION =
  "Open Firebase alternative for builders. Sentroy unifies transactional email (a Resend / Postmark / SendGrid alternative), S3-compatible object storage (a Cloudflare R2 / AWS S3 alternative), auth-as-a-service (a Clerk / Auth0 / Firebase Auth alternative), and an env-vault (a Doppler / Infisical alternative) behind a single SDK."

const DEFAULT_KEYWORDS = [
  "transactional email API",
  "Resend alternative",
  "Postmark alternative",
  "SendGrid alternative",
  "Mailgun alternative",
  "object storage",
  "S3 alternative",
  "Cloudflare R2 alternative",
  "auth as a service",
  "Clerk alternative",
  "Auth0 alternative",
  "Firebase alternative",
  "Supabase alternative",
  "env vault",
  "Doppler alternative",
  "Infisical alternative",
  "developer platform",
  "OAuth provider",
  "Next.js SDK",
  "Sentroy",
]

const DEFAULT_OG_TITLE =
  "Sentroy — Mail · Storage · Auth · Vault in one SDK"

const LOCALE_TAG: Record<string, string> = {
  en: "en_US",
  tr: "tr_TR",
}

const getSeo = cache(getSeoSettings)

/** lang -> en -> hardcoded default for the given per-locale dictionary. */
function pickWithFallback<T>(
  dict: Record<string, T> | undefined,
  lang: string,
  fallback: T,
): T {
  if (!dict) return fallback
  return dict[lang] ?? dict.en ?? fallback
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  // Static rendering opt-in: requestLocale'i cache'e set eder → next-intl
  // (getRequestConfig `await requestLocale`) headers()'a düşmez → sayfa
  // static prerender edilebilir kalır (aksi halde tüm [lang] ağacı dynamic).
  setRequestLocale(lang)

  const seo = await getSeo().catch(() => null)

  const description = pickWithFallback(
    seo?.defaultDescription,
    lang,
    DEFAULT_DESCRIPTION,
  )
  const ogTitle = pickWithFallback(
    seo?.defaultOgTitle,
    lang,
    DEFAULT_OG_TITLE,
  )
  const keywordsResolved = pickWithFallback(
    seo?.defaultKeywords,
    lang,
    DEFAULT_KEYWORDS,
  )

  const twitterHandle =
    seo?.twitterHandle && seo.twitterHandle.trim().length > 0
      ? `@${seo.twitterHandle.replace(/^@/, "")}`
      : "@sentroy"

  const verification: NonNullable<Metadata["verification"]> = {}
  if (seo?.googleSiteVerification)
    verification.google = seo.googleSiteVerification
  if (seo?.bingSiteVerification) {
    // Bing accepts msvalidate.01 meta — Next maps `other` to arbitrary tags.
    verification.other = {
      ...(verification.other ?? {}),
      "msvalidate.01": seo.bingSiteVerification,
    }
  }

  const localeTag = LOCALE_TAG[lang] ?? LOCALE_TAG.en!

  // Layout-seviyesi canonical = locale KÖKÜ (home için doğru). ⚠ headers()
  // KULLANMIYORUZ — Dynamic API tüm [lang] ağacını static-dışı yapıp landing
  // TTFB'sini bozuyordu. Alt sayfalar (investors/brand/vision/contact) kendi
  // generateMetadata'larında localizedAlternates(lang, "/<path>") ile self-canonical
  // override eder; auth-arkası (d/admin) sayfalar bu kökü miras alır (indexlenmez).
  const alt = localizedAlternates(lang)

  const ogImage = seo?.defaultOgImageUrl ?? "/opengraph-image"

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: DEFAULT_TITLE,
      template: "%s | Sentroy",
    },
    description,
    keywords: keywordsResolved,
    applicationName: "Sentroy",
    authors: [{ name: "Sentroy", url: SITE_URL }],
    creator: "Sentroy",
    publisher: "Sentroy",
    openGraph: {
      title: ogTitle,
      description,
      url: alt.canonical,
      siteName: "Sentroy",
      type: "website",
      locale: localeTag,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "Sentroy — Mail · Storage · Auth · Vault",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: twitterHandle,
      creator: twitterHandle,
      title: ogTitle,
      description,
      images: [ogImage],
    },
    alternates: alt,
    verification:
      Object.keys(verification).length > 0 ? verification : undefined,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
}

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ lang: locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  if (!routing.locales.includes(lang as "en" | "tr")) {
    notFound()
  }
  setRequestLocale(lang)

  const [messages, seo] = await Promise.all([
    // Explicit locale — core'da middleware/setRequestLocale yok; client
    // component'ler (Sentroy OS chrome) doğru bundle'ı alsın diye lang'i
    // doğrudan geçiyoruz (aksi halde requestLocale çözülmeyip en'e düşüyor).
    getMessages({ locale: lang }),
    getSeo().catch(() => null),
  ])

  const analyticsSeo = {
    gaId: seo?.gaId ?? null,
    gtmId: seo?.gtmId ?? null,
    metaPixelId: seo?.metaPixelId ?? null,
    plausibleDomain: seo?.plausibleDomain ?? null,
    hotjarId: seo?.hotjarId ?? null,
  }

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={cn("antialiased font-sans", outfit.variable, fontMono.variable)}
    >
      <body>
        <NextIntlClientProvider messages={messages} locale={lang}>
          <UIProviders>{children}</UIProviders>
          <CookieConsent />
        </NextIntlClientProvider>
        <AnalyticsScripts seo={analyticsSeo} />
        {/* PWA service worker kaydı — yalnız core (manifest + /sw.js burada). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </body>
    </html>
  )
}

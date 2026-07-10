"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  animate,
} from "framer-motion"
import Lenis from "lenis"
import "lenis/dist/lenis.css"
import { useTranslations, useLocale } from "next-intl"
import { useSession } from "@workspace/auth/client/auth-client"
import { usePathname, useRouter } from "@workspace/auth/i18n/routing"
import {
  Logo,
  CookieConsent,
  LanguageCombobox,
} from "@workspace/console/components/shared"
import {
  MarketingHeader,
  MarketingFooter,
  type MarketingHeaderNavItem,
} from "@workspace/console/components/marketing"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@workspace/ui/components/accordion"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  MailSend02Icon,
  InternetIcon,
  ShieldKeyIcon,
  AnalyticsUpIcon,
  Key01Icon,
  ArrowRight01Icon,
  CodeIcon,
  StarIcon,
  Tick02Icon,
  Alert01Icon,
  CheckmarkCircle02Icon,
  RocketIcon,
  Shield01Icon,
  FlashIcon,
  GlobalIcon,
  CustomerService01Icon,
  ChartIncreaseIcon,
  Clock01Icon,
  GithubIcon,
  NewTwitterIcon,
  Linkedin01Icon,
  DiscordIcon,
  SentIcon,
  Loading03Icon,
  FolderLibraryIcon,
  CloudServerIcon,
  DatabaseIcon,
  ChartLineData02Icon,
  CalendarBlock02Icon,
  BotIcon,
  PaintBoardIcon,
  Notebook01Icon,
  Facebook01Icon,
  InstagramIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import dynamic from "next/dynamic"
import { cn } from "@workspace/ui/lib/utils"
import { CodeBlock } from "@workspace/console/components/marketing"
import {
  type LandingSectionId,
  normalizeLandingSectionOrder,
} from "@/lib/landing-sections"

// react-globe.gl WebGL tabanli, sadece client'ta render olmali.
const HeroGlobe = dynamic(() => import("@/components/landing/hero-globe"), {
  ssr: false,
  loading: () => (
    <div className="relative hidden aspect-square w-full lg:block">
      <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-primary/20 via-transparent to-transparent blur-3xl" />
    </div>
  ),
})

// ═════════════════════════════════════════════════════════════════════════
// Animation helpers
// ═════════════════════════════════════════════════════════════════════════

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-60px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function StaggerContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.08 } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function TiltCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rotateX = useMotionValue(0)
  const rotateY = useMotionValue(0)
  const smoothX = useSpring(rotateX, { stiffness: 200, damping: 20 })
  const smoothY = useSpring(rotateY, { stiffness: 200, damping: 20 })

  function handleMouse(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    rotateY.set(x * 6)
    rotateX.set(y * -6)
  }

  function handleLeave() {
    rotateX.set(0)
    rotateY.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX: smoothX, rotateY: smoothY, transformPerspective: 800 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Static data (SDK code examples — preserved)
// ═════════════════════════════════════════════════════════════════════════

const featureIcons = {
  deliverability: MailSend02Icon,
  domains: InternetIcon,
  reputation: ShieldKeyIcon,
  analytics: AnalyticsUpIcon,
}

// Whitelist — admin'den eklenecek app'ler için seçilebilir hugeicon'lar.
// Yeni app'in iconKey'i bu map'te yoksa fallback `CloudServerIcon` çizilir.
const APP_ICONS: Record<string, typeof MailSend02Icon> = {
  MailSend02Icon,
  FolderLibraryIcon,
  CloudServerIcon,
  DatabaseIcon,
  AnalyticsUpIcon,
  ChartLineData02Icon,
  CalendarBlock02Icon,
  BotIcon,
  PaintBoardIcon,
  Notebook01Icon,
  GlobalIcon,
  ShieldKeyIcon,
  Key01Icon,
}

export const APP_ICON_KEYS = Object.keys(APP_ICONS)
export const SDK_EXAMPLE_KEYS = [
  "mail-send",
  "storage-upload",
  "vault-fetch",
  "auth-signin",
  "cli-env-vault",
] as const

// CLI shell-only — language tab'ları gizle, CodeBlock'u bash olarak render et.
const SHELL_ONLY_KEYS = new Set<string>(["cli-env-vault"])

// SDK örnekleri app-aware. Anahtar `sdkExampleKey` (DB'deki landing_apps
// record'undan); değer dil → kod map'i. Yeni app için yeni anahtar ekle,
// dil bazında kod yaz; admin formundan dropdown'a key çıkar.
const codeExamples: Record<string, Record<string, string>> = {
  "mail-send": {
    typescript: `import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "my-company",
  accessToken: "stk_..."
})

await sentroy.send.email({
  to: "user@example.com",
  from: "noreply@yourcompany.com",
  subject: "Verify your email",
  domainId: "your-domain-id",
  templateId: "email-verification",
  lang: "en",
  variables: { name: "John", code: "482901" }
})`,
    python: `from sentroy import Sentroy, SendParams

sentroy = Sentroy(
    base_url="https://sentroy.com",
    company_slug="my-company",
    access_token="stk_..."
)

result = sentroy.send.email(SendParams(
    to="user@example.com",
    from_addr="noreply@yourcompany.com",
    subject="Verify your email",
    domain_id="your-domain-id",
    template_id="email-verification",
    lang="en",
    variables={"name": "John", "code": "482901"}
))`,
    php: `<?php
use Sentroy\\ClientSdk\\Sentroy;

$sentroy = new Sentroy([
    'base_url' => 'https://sentroy.com',
    'company_slug' => 'my-company',
    'access_token' => 'stk_...',
]);

$sentroy->send->email([
    'to' => 'user@example.com',
    'from' => 'noreply@yourcompany.com',
    'subject' => 'Verify your email',
    'domainId' => 'your-domain-id',
    'templateId' => 'email-verification',
    'lang' => 'en',
    'variables' => ['name' => 'John', 'code' => '482901'],
]);`,
    go: `import sentroy "github.com/Sentroy-Co/client-sdk/go"

client := sentroy.New(sentroy.Config{
    BaseURL:     "https://sentroy.com",
    CompanySlug: "my-company",
    AccessToken: "stk_...",
})

client.Send.Email(sentroy.SendParams{
    To:         "user@example.com",
    From:       "noreply@yourcompany.com",
    Subject:    "Verify your email",
    DomainID:   "your-domain-id",
    TemplateID: "email-verification",
    Lang:       "en",
    Variables:  map[string]string{"name": "John", "code": "482901"},
})`,
  },
  "storage-upload": {
    typescript: `import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "my-company",
  accessToken: "stk_..."
})

const file = new File([blob], "logo.png", { type: "image/png" })

await sentroy.storage.upload({
  bucketId: "your-bucket-id",
  file,
  visibility: "public",
})`,
    python: `from sentroy import Sentroy

sentroy = Sentroy(
    base_url="https://sentroy.com",
    company_slug="my-company",
    access_token="stk_..."
)

with open("logo.png", "rb") as f:
    sentroy.storage.upload(
        bucket_id="your-bucket-id",
        file=f,
        filename="logo.png",
        visibility="public",
    )`,
    php: `<?php
use Sentroy\\ClientSdk\\Sentroy;

$sentroy = new Sentroy([
    'base_url' => 'https://sentroy.com',
    'company_slug' => 'my-company',
    'access_token' => 'stk_...',
]);

$sentroy->storage->upload([
    'bucketId' => 'your-bucket-id',
    'filePath' => '/path/to/logo.png',
    'visibility' => 'public',
]);`,
    go: `import sentroy "github.com/Sentroy-Co/client-sdk/go"

client := sentroy.New(sentroy.Config{
    BaseURL:     "https://sentroy.com",
    CompanySlug: "my-company",
    AccessToken: "stk_...",
})

f, _ := os.Open("logo.png")
defer f.Close()

client.Storage.Upload(sentroy.UploadParams{
    BucketID:   "your-bucket-id",
    File:       f,
    Filename:   "logo.png",
    Visibility: "public",
})`,
  },
  "vault-fetch": {
    typescript: `// One bootstrap env: SENTROY_ENV_API_KEY=stk_env_...
import { getEnv, getEnvOrThrow, preloadEnv } from "@sentroy-co/client-sdk/vault"

await preloadEnv() // optional fail-fast at boot

const dbUrl = await getEnv("DATABASE_URL")
const stripeKey = await getEnvOrThrow("STRIPE_SECRET_KEY")

// In a React server component, hydrate public envs into the browser:
//   const envs = await getPublicEnvs()
//   <EnvProvider envs={envs}>{children}</EnvProvider>`,
    python: `import os
import requests

# One bootstrap env: SENTROY_ENV_API_KEY=stk_env_...
res = requests.get(
    "https://sentroy.com/api/env-vault/fetch",
    headers={"Authorization": f"Bearer {os.environ['SENTROY_ENV_API_KEY']}"},
    timeout=10,
)
envs = {row["key"]: row["value"] for row in res.json()["data"]}

db_url = envs["DATABASE_URL"]
stripeKey = envs["STRIPE_SECRET_KEY"]`,
    php: `<?php
// One bootstrap env: SENTROY_ENV_API_KEY=stk_env_...
$ch = curl_init('https://sentroy.com/api/env-vault/fetch');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('SENTROY_ENV_API_KEY')],
]);
$payload = json_decode(curl_exec($ch), true);
curl_close($ch);

$envs = [];
foreach ($payload['data'] as $row) {
    $envs[$row['key']] = $row['value'];
}

$dbUrl = $envs['DATABASE_URL'];
$stripeKey = $envs['STRIPE_SECRET_KEY'];`,
    go: `package main

import (
    "encoding/json"
    "net/http"
    "os"
)

// One bootstrap env: SENTROY_ENV_API_KEY=stk_env_...
type vaultRow struct{ Key, Value string }
type vaultResponse struct{ Data []vaultRow }

req, _ := http.NewRequest("GET", "https://sentroy.com/api/env-vault/fetch", nil)
req.Header.Set("Authorization", "Bearer "+os.Getenv("SENTROY_ENV_API_KEY"))
resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

var payload vaultResponse
_ = json.NewDecoder(resp.Body).Decode(&payload)

envs := map[string]string{}
for _, r := range payload.Data {
    envs[r.Key] = r.Value
}

dbUrl := envs["DATABASE_URL"]
stripeKey := envs["STRIPE_SECRET_KEY"]`,
  },
  "auth-signin": {
    typescript: `// Browser — Firebase-style auth client (Auth-as-a-Service)
import { SentroyAuth } from "@sentroy-co/client-sdk/auth"

export const auth = new SentroyAuth({
  projectSlug: "acme-app",
  apiKey: process.env.NEXT_PUBLIC_SENTROY_AUTH_API_KEY!,
  storage: "localStorage",
})

auth.onAuthStateChanged((user) => {
  console.log(user ? \`signed in: \${user.email}\` : "signed out")
})

const out = await auth.signIn({
  email: "alice@example.com",
  password: "hunter2-strong",
  rememberMe: true,
})
if (out.kind === "mfa") {
  const code = prompt("6-digit code")!
  await auth.verifyMfa({ mfaToken: out.data.mfaToken, code })
} else {
  console.log("hello", out.data.user.email)
}

// Server — verify ID token via JWKS (Node admin SDK)
import { SentroyAuthAdmin } from "@sentroy-co/client-sdk/auth/admin"

const admin = new SentroyAuthAdmin({
  projectSlug: "acme-app",
  apiKey: process.env.SENTROY_AUTH_API_KEY!,
})

const claims = await admin.verifyIdToken(idToken) // local JWKS cache`,
    python: `import os, requests

# Auth Project public API — Bearer aps_<...> (server-only)
res = requests.post(
    "https://auth.sentroy.com/api/v1/auth/acme-app/login",
    headers={"Authorization": f"Bearer {os.environ['SENTROY_AUTH_API_KEY']}"},
    json={
        "email": "alice@example.com",
        "password": "hunter2-strong",
        "rememberMe": True,
    },
    timeout=10,
)
data = res.json()

if data.get("mfaRequired"):
    # 6-digit TOTP / email OTP follow-up
    res = requests.post(
        "https://auth.sentroy.com/api/v1/auth/acme-app/login/mfa/verify",
        headers={"Authorization": f"Bearer {os.environ['SENTROY_AUTH_API_KEY']}"},
        json={"mfaToken": data["mfaToken"], "code": "123456"},
    )
    data = res.json()

access_token = data["accessToken"]    # JWT — verify via JWKS
refresh_token = data["refreshToken"]  # rotate via /refresh
print("authenticated", data["user"]["email"])`,
    php: `<?php
// Auth Project public API — Bearer aps_<...> (server-only)
$ch = curl_init('https://auth.sentroy.com/api/v1/auth/acme-app/login');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . getenv('SENTROY_AUTH_API_KEY'),
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'email' => 'alice@example.com',
        'password' => 'hunter2-strong',
        'rememberMe' => true,
    ]),
]);
$data = json_decode(curl_exec($ch), true);
curl_close($ch);

if (!empty($data['mfaRequired'])) {
    // Follow-up TOTP / email OTP via /login/mfa/verify
}

$accessToken = $data['accessToken'];   // JWT — verify via JWKS endpoint
$refreshToken = $data['refreshToken']; // rotate via /refresh
echo "authenticated " . $data['user']['email'];`,
    go: `package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "os"
)

// Auth Project public API — Bearer aps_<...> (server-only)
body, _ := json.Marshal(map[string]any{
    "email":      "alice@example.com",
    "password":   "hunter2-strong",
    "rememberMe": true,
})
req, _ := http.NewRequest("POST",
    "https://auth.sentroy.com/api/v1/auth/acme-app/login",
    bytes.NewReader(body))
req.Header.Set("Authorization", "Bearer "+os.Getenv("SENTROY_AUTH_API_KEY"))
req.Header.Set("Content-Type", "application/json")

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

var data struct {
    AccessToken  string \`json:"accessToken"\`  // JWT — verify via JWKS
    RefreshToken string \`json:"refreshToken"\` // rotate via /refresh
    MfaRequired  bool   \`json:"mfaRequired"\`
    User         struct{ Email string \`json:"email"\` } \`json:"user"\`
}
_ = json.NewDecoder(resp.Body).Decode(&data)`,
  },
  "cli-env-vault": {
    // CLI shell-only — tüm dil tab'larında aynı bash içeriği render edilir.
    // UI tarafında SHELL_ONLY_KEYS guard'ı language tab'larını gizler ve
    // CodeBlock language="bash" zorlar.
    typescript: `# Install the SDK — 'sentroy' binary ships in @sentroy-co/client-sdk
npm install -g @sentroy-co/client-sdk
export SENTROY_ENV_API_KEY=stk_env_...

# Push local .env into the vault. --delete-missing makes it a full sync;
# without it, push is upsert-only. CLI prompts before destructive ops.
sentroy env push .env.production --delete-missing

# Pull the vault into a local file. --force overwrites without prompt.
sentroy env pull .env.staging --force

# List keys (--values prints KEY=value, --public-only filters NEXT_PUBLIC_*)
sentroy env list --values --public-only

# Preview pending changes without writing
sentroy env diff .env.production --delete-missing`,
    python: `# Install the SDK — 'sentroy' binary ships in @sentroy-co/client-sdk
npm install -g @sentroy-co/client-sdk
export SENTROY_ENV_API_KEY=stk_env_...

sentroy env push .env.production --delete-missing
sentroy env pull .env.staging --force
sentroy env list --values --public-only
sentroy env diff .env.production --delete-missing`,
    php: `# Install the SDK — 'sentroy' binary ships in @sentroy-co/client-sdk
npm install -g @sentroy-co/client-sdk
export SENTROY_ENV_API_KEY=stk_env_...

sentroy env push .env.production --delete-missing
sentroy env pull .env.staging --force
sentroy env list --values --public-only
sentroy env diff .env.production --delete-missing`,
    go: `# Install the SDK — 'sentroy' binary ships in @sentroy-co/client-sdk
npm install -g @sentroy-co/client-sdk
export SENTROY_ENV_API_KEY=stk_env_...

sentroy env push .env.production --delete-missing
sentroy env pull .env.staging --force
sentroy env list --values --public-only
sentroy env diff .env.production --delete-missing`,
  },
}

const langMap: Record<string, string> = {
  typescript: "TypeScript",
  python: "Python",
  php: "PHP",
  go: "Go",
}

/**
 * SDK section'da CMS-driven `apps` listesinde olmayan SDK key'leri için
 * minimal synthetic LandingApp fallback'leri. Admin CMS'ten override
 * etmediği sürece auth + cli tab'ları bu shape'le render olur.
 */
const SYNTHETIC_SDK_APPS: Record<string, LandingApp> = {
  "mail-send": {
    id: "synthetic-mail",
    key: "mail",
    name: { en: "Mail", tr: "Mail" },
    tagline: { en: "", tr: "" },
    description: { en: "", tr: "" },
    iconKey: "Mail01Icon",
    features: [],
    ctaUrl: "",
    ctaLabel: { en: "", tr: "" },
    sdkExampleKey: "mail-send",
    order: 0,
    enabled: true,
  },
  "storage-upload": {
    id: "synthetic-storage",
    key: "storage",
    name: { en: "Storage", tr: "Storage" },
    tagline: { en: "", tr: "" },
    description: { en: "", tr: "" },
    iconKey: "FolderLibraryIcon",
    features: [],
    ctaUrl: "",
    ctaLabel: { en: "", tr: "" },
    sdkExampleKey: "storage-upload",
    order: 1,
    enabled: true,
  },
  "vault-fetch": {
    id: "synthetic-vault",
    key: "vault",
    name: { en: "Env Vault", tr: "Env Vault" },
    tagline: { en: "", tr: "" },
    description: { en: "", tr: "" },
    iconKey: "Key01Icon",
    features: [],
    ctaUrl: "",
    ctaLabel: { en: "", tr: "" },
    sdkExampleKey: "vault-fetch",
    order: 2,
    enabled: true,
  },
  "auth-signin": {
    id: "synthetic-auth",
    key: "auth",
    name: { en: "Auth", tr: "Auth" },
    tagline: { en: "", tr: "" },
    description: { en: "", tr: "" },
    iconKey: "ShieldKeyIcon",
    features: [],
    ctaUrl: "",
    ctaLabel: { en: "", tr: "" },
    sdkExampleKey: "auth-signin",
    order: 3,
    enabled: true,
  },
  "cli-env-vault": {
    id: "synthetic-cli",
    key: "cli",
    name: { en: "CLI", tr: "CLI" },
    tagline: { en: "", tr: "" },
    description: { en: "", tr: "" },
    iconKey: "CloudServerIcon",
    features: [],
    ctaUrl: "",
    ctaLabel: { en: "", tr: "" },
    sdkExampleKey: "cli-env-vault",
    order: 4,
    enabled: true,
  },
}

// ═════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════

interface StaticPage {
  slug: string
  title: Record<string, string> | string
}

interface Logo {
  id: string
  name: string
  imageUrl: string
  url: string | null
}

interface Testimonial {
  id: string
  quote: Record<string, string>
  name: string
  title: Record<string, string>
  photoUrl: string | null
  rating: number | null
}

interface ZSection {
  id: string
  title: Record<string, string>
  problem: Record<string, string>
  solution: Record<string, string>
  result: Record<string, string>
  visual: string | null
  order: number
}

interface Plan {
  id: string
  name: Record<string, string> | string
  description: Record<string, string> | string
  price: number
  features: Array<Record<string, string> | string>
  monthlyEmailLimit: number
  storageLimit: number
  maxDomainsPerCompany: number
  maxMembersPerCompany: number
  isDefault: boolean
  isActive: boolean
}

interface LandingApp {
  id: string
  key: string
  name: Record<string, string>
  tagline: Record<string, string>
  description: Record<string, string>
  iconKey: string
  features: Record<string, string>[]
  ctaUrl: string
  ctaLabel: Record<string, string>
  sdkExampleKey: string | null
  order: number
  enabled: boolean
}

interface LandingData {
  logos: Logo[]
  testimonials: Testimonial[]
  zsections: ZSection[]
  apps: LandingApp[]
  plans: Plan[]
  settings: {
    trustMessage: Record<string, string>
    pricingTitle: Record<string, string>
    pricingSubtitle: Record<string, string>
    sectionOrder: string[]
    showPricing: boolean
    showTestimonials: boolean
    showLogos: boolean
    showZSections: boolean
    showApps: boolean
    showMetrics: boolean
  }
}

function loc(
  v: Record<string, string> | string | undefined,
  lang: string
): string {
  if (!v) return ""
  if (typeof v === "string") return v
  return v[lang] || v.en || Object.values(v)[0] || ""
}

function formatStorage(bytes: number, lang: string): string {
  // storageLimit BYTES cinsinde (admin BytesInput). Doğru birime indir —
  // eskiden değer MB sanılıp /1024 yapılıyordu (ör. 50 GB → "48828125 GB").
  if (bytes <= 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  )
  const val = bytes / Math.pow(k, i)
  const num = Number.isInteger(val) ? val.toLocaleString(lang) : val.toFixed(1)
  return `${num} ${sizes[i]}`
}

// ═════════════════════════════════════════════════════════════════════════
// Hero visual — animated floating email preview
// ═════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════
// Floating nav — morphs from full-width bar to floating pill on scroll
// ═════════════════════════════════════════════════════════════════════════

// Core 2 dil destekler (paylaşılan @workspace/auth routing: en/tr).
const CORE_LOCALES = ["en", "tr"] as const

function FloatingNav({
  lang,
  showPricing,
  showTestimonials,
  showApps,
  sectionOrder,
  dataReady,
}: {
  lang: string
  showPricing: boolean
  showTestimonials: boolean
  showApps: boolean
  sectionOrder: LandingSectionId[]
  /** Landing data fetch tamamlandığında true — observer'ın conditional
   *  section'ları (apps, how, testimonials, pricing) yakalaması için. */
  dataReady: boolean
}) {
  // Adapter — generic MarketingHeader'ı i18n + sectionOrder mapping ile besle.
  const t = useTranslations("landing")
  const router = useRouter()
  const pathname = usePathname()
  const navItems: MarketingHeaderNavItem[] = sectionOrder.flatMap(
    (sectionId): MarketingHeaderNavItem[] => {
      if (sectionId === "apps" && showApps)
        return [{ id: "apps", label: t("navApps") }]
      if (sectionId === "features")
        return [{ id: "features", label: t("navFeatures") }]
      if (sectionId === "zsections") return [{ id: "how", label: t("navHow") }]
      if (sectionId === "sdk") return [{ id: "sdk", label: t("navSdk") }]
      if (sectionId === "pricing" && showPricing)
        return [{ id: "pricing", label: t("navPricing") }]
      if (sectionId === "testimonials" && showTestimonials) {
        return [{ id: "testimonials", label: t("navTestimonials") }]
      }
      if (sectionId === "faq") return [{ id: "faq", label: t("navFaq") }]
      return []
    },
  )
  return (
    <MarketingHeader
      lang={lang}
      logoHref="#top"
      navItems={navItems}
      enableSectionTracking
      dataReady={dataReady}
      languageSwitcher={
        <LanguageCombobox
          current={lang}
          locales={CORE_LOCALES}
          onSelect={(l) =>
            router.replace(pathname, { locale: l as (typeof CORE_LOCALES)[number] })
          }
        />
      }
      signedInCta={{ label: t("navDashboard"), href: `/${lang}/d` }}
      signedOutCtas={[
        {
          label: "Docs",
          href: "/docs",
          variant: "ghost",
          hideOnMobile: true,
        },
        {
          label: t("signIn"),
          href: `/${lang}/login`,
          variant: "ghost",
          hideOnMobile: true,
        },
        { label: t("getStarted"), href: `/${lang}/signup` },
      ]}
    />
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Features section — scroll-bound reveal + animated connecting line
// ═════════════════════════════════════════════════════════════════════════

function FeaturesSection({ style }: { style?: React.CSSProperties }) {
  const t = useTranslations("landing")
  const sectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "end 60%"],
  })
  const featureKeys = Object.keys(featureIcons) as Array<
    keyof typeof featureIcons
  >

  // Parallax for eyebrow decor
  const decorY = useTransform(scrollYProgress, [0, 1], [40, -40])
  const lineScale = useTransform(scrollYProgress, [0.1, 0.8], [0, 1])

  return (
    <section
      id="features"
      ref={sectionRef}
      style={style}
      className="relative overflow-hidden border-b"
    >
      {/* Decorative orbs */}
      <motion.div
        style={{ y: decorY }}
        className="pointer-events-none absolute top-0 left-1/2 -z-10 size-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"
      />
      <div className="mx-auto max-w-6xl px-6 py-28">
        <div className="mx-auto mb-20 max-w-2xl text-center">
          <Reveal>
            <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
              {t("featuresEyebrow")}
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              {t("featuresTitle")}
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 text-lg text-balance text-muted-foreground">
              {t("featuresDescription")}
            </p>
          </Reveal>
        </div>

        {/* Connecting vertical rail (desktop only) */}
        <div className="relative">
          <motion.div
            style={{ scaleY: lineScale, originY: 0 }}
            className="pointer-events-none absolute top-0 left-1/2 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/30 to-transparent lg:block"
          />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featureKeys.map((key, idx) => (
              <FeatureCard
                key={key}
                iconKey={key}
                index={idx}
                title={t(`feat_${key}_title`)}
                desc={t(`feat_${key}_desc`)}
                progress={scrollYProgress}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  iconKey,
  index,
  title,
  desc,
  progress,
}: {
  iconKey: keyof typeof featureIcons
  index: number
  title: string
  desc: string
  progress: ReturnType<typeof useScroll>["scrollYProgress"]
}) {
  // Stagger reveal by index — 4 cards over scroll range
  const start = 0.05 + index * 0.12
  const end = start + 0.25
  const opacity = useTransform(progress, [start, end], [0, 1])
  const y = useTransform(progress, [start, end], [48, 0])
  const iconGlow = useTransform(progress, [start, end], [0, 1])
  const iconGlowShadow = useTransform(
    iconGlow,
    (v) => `0 0 ${v * 32}px hsl(var(--primary) / ${v * 0.45})`
  )

  return (
    <motion.div style={{ opacity, y }} className="h-full">
      <TiltCard className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border bg-background p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-xl">
        {/* Hover accent */}
        <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <motion.div
          style={{ boxShadow: iconGlowShadow }}
          className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <HugeiconsIcon
            icon={featureIcons[iconKey]}
            strokeWidth={1.8}
            className="size-5"
          />
        </motion.div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
      </TiltCard>
    </motion.div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Metrics section — animated counters + delivery chart
// ═════════════════════════════════════════════════════════════════════════

function MetricsSection({ style }: { style?: React.CSSProperties }) {
  const t = useTranslations("landing")
  const metrics: Array<{
    id: string
    value: number
    suffix?: string
    decimals?: number
    prefix?: string
  }> = [
    { id: "deliverability", value: 99.9, suffix: "%", decimals: 1 },
    { id: "volume", value: 2.4, suffix: "B+", decimals: 1 },
    { id: "latency", value: 247, suffix: "ms" },
    { id: "uptime", value: 99.99, suffix: "%", decimals: 2 },
  ]

  return (
    <section
      id="metrics"
      style={style}
      className="relative border-b bg-gradient-to-b from-background via-muted/10 to-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-28">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Reveal>
            <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
              {t("metricsEyebrow")}
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              {t("metricsTitle")}
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 text-lg text-balance text-muted-foreground">
              {t("metricsDescription")}
            </p>
          </Reveal>
        </div>

        <StaggerContainer className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => (
            <StaggerItem key={m.id}>
              <div className="group relative flex flex-col gap-1 overflow-hidden rounded-2xl border bg-background p-6">
                <div className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-primary/5 blur-2xl transition-all duration-500 group-hover:bg-primary/10" />
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  {t(`metric_${m.id}_label`)}
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <AnimatedCounter
                    target={m.value}
                    decimals={m.decimals ?? 0}
                    className="text-4xl font-bold tracking-tight"
                  />
                  {m.suffix && (
                    <span className="text-2xl font-semibold text-muted-foreground">
                      {m.suffix}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(`metric_${m.id}_sub`)}
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <Reveal>
          <div className="grid items-center gap-8 rounded-3xl border bg-background p-6 sm:p-10 lg:grid-cols-5 lg:gap-12">
            <div className="lg:col-span-2">
              <p className="text-sm font-medium tracking-wider text-primary uppercase">
                {t("chartEyebrow")}
              </p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                {t("chartTitle")}
              </h3>
              <p className="mt-4 text-muted-foreground">
                {t("chartDescription")}
              </p>
              <div className="mt-6 flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-primary" />
                  <span className="text-muted-foreground">
                    {t("chartLegendDelivered")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">
                    {t("chartLegendOpened")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-red-400" />
                  <span className="text-muted-foreground">
                    {t("chartLegendBounced")}
                  </span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-3">
              <DeliveryChart />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function AnimatedCounter({
  target,
  decimals = 0,
  className,
}: {
  target: number
  decimals?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-20%" })
  const activeLang = useLocale()

  useEffect(() => {
    if (!inView || !ref.current) return
    const node = ref.current
    const controls = animate(0, target, {
      duration: 1.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = v.toLocaleString(activeLang, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      },
    })
    return () => controls.stop()
  }, [inView, target, decimals, activeLang])

  return (
    <span ref={ref} className={className}>
      0
    </span>
  )
}

function DeliveryChart() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-20%" })
  // 14 days of simulated data
  const bars = [
    { d: 62, o: 28, b: 4 },
    { d: 68, o: 30, b: 3 },
    { d: 74, o: 34, b: 5 },
    { d: 71, o: 33, b: 4 },
    { d: 80, o: 38, b: 3 },
    { d: 86, o: 42, b: 4 },
    { d: 90, o: 44, b: 5 },
    { d: 84, o: 40, b: 3 },
    { d: 92, o: 46, b: 4 },
    { d: 96, o: 48, b: 3 },
    { d: 100, o: 52, b: 3 },
    { d: 94, o: 46, b: 4 },
    { d: 102, o: 54, b: 3 },
    { d: 108, o: 58, b: 2 },
  ]
  const max = Math.max(...bars.map((b) => b.d))

  return (
    <div ref={ref} className="relative h-60 w-full">
      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-px w-full bg-border/60" />
        ))}
      </div>
      {/* Bars */}
      <div className="relative flex h-full items-end gap-1.5 sm:gap-2">
        {bars.map((bar, i) => {
          const dH = (bar.d / max) * 100
          const oH = (bar.o / max) * 100
          const bH = (bar.b / max) * 100
          return (
            <div key={i} className="group relative flex flex-1 items-end">
              <div className="relative w-full">
                <motion.div
                  initial={{ height: 0 }}
                  animate={inView ? { height: `${dH}%` } : { height: 0 }}
                  transition={{
                    duration: 0.9,
                    delay: 0.05 * i,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="w-full rounded-t-md bg-primary/70"
                />
                <motion.div
                  initial={{ height: 0 }}
                  animate={inView ? { height: `${oH}%` } : { height: 0 }}
                  transition={{
                    duration: 0.9,
                    delay: 0.05 * i + 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="absolute inset-x-0 bottom-0 w-full rounded-t-md bg-emerald-500"
                />
                <motion.div
                  initial={{ height: 0 }}
                  animate={inView ? { height: `${bH}%` } : { height: 0 }}
                  transition={{
                    duration: 0.9,
                    delay: 0.05 * i + 0.2,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="absolute inset-x-0 bottom-0 w-full rounded-t-md bg-red-400"
                />
              </div>
              <div className="pointer-events-none absolute inset-x-0 -top-1 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                <div className="mx-auto w-fit rounded-md border bg-popover px-2 py-1 text-[10px] shadow-sm">
                  {bar.d + bar.o}k
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Security strip — compliance badges, compact
// ═════════════════════════════════════════════════════════════════════════

function SecurityStrip({ style }: { style?: React.CSSProperties }) {
  const t = useTranslations("landing")
  const items = [
    { icon: Shield01Icon, label: t("securitySoc2") },
    { icon: GlobalIcon, label: t("securityGdpr") },
    { icon: FlashIcon, label: t("securityDkim") },
    { icon: Clock01Icon, label: t("securityUptime") },
    { icon: CustomerService01Icon, label: t("securitySupport") },
    { icon: ChartIncreaseIcon, label: t("securityAnalytics") },
  ]
  return (
    <section style={style} className="border-b bg-muted/10">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {items.map((item, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HugeiconsIcon
                  icon={item.icon}
                  strokeWidth={1.8}
                  className="size-4 text-primary"
                />
                <span>{item.label}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// FAQ section — accordion layout with subtle background
// ═════════════════════════════════════════════════════════════════════════

// FAQ key list shared between FAQSection and the FAQPage JSON-LD generator.
// Keep in sync with translation keys `faq_<key>_q` / `faq_<key>_a`.
const FAQ_KEYS = [
  "pricing",
  "migration",
  "support",
  "security",
  "sla",
  "resend",
  "firebase",
  "auth0",
  "doppler",
] as const

function FAQSection({ style }: { style?: React.CSSProperties }) {
  const t = useTranslations("landing")
  const items = FAQ_KEYS

  return (
    <section
      id="faq"
      style={style}
      className="relative overflow-hidden border-b"
    >
      <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      <div className="mx-auto max-w-3xl px-6 py-28">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Reveal>
            <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
              {t("faqEyebrow")}
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              {t("faqTitle")}
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-4 text-lg text-muted-foreground">
              {t("faqDescription")}
            </p>
          </Reveal>
        </div>
        <Reveal>
          <Accordion className="bg-background">
            {items.map((key) => (
              <AccordionItem key={key} value={key}>
                <AccordionTrigger>{t(`faq_${key}_q`)}</AccordionTrigger>
                <AccordionContent>{t(`faq_${key}_a`)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Newsletter section — email capture with POST /api/public/newsletter
// ═════════════════════════════════════════════════════════════════════════

function NewsletterSection({ style }: { style?: React.CSSProperties }) {
  const t = useTranslations("landing")
  const activeLang = useLocale()
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          locale: activeLang,
          source: "landing-footer",
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setSuccess(true)
      setEmail("")
      toast.success(t("newsletterSuccess"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("newsletterError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      style={style}
      className="border-b bg-gradient-to-br from-muted/20 via-background to-muted/30"
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Reveal>
              <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
                {t("newsletterEyebrow")}
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                {t("newsletterTitle")}
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-4 max-w-md text-muted-foreground">
                {t("newsletterDescription")}
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.2}>
            <form
              onSubmit={handleSubmit}
              className="relative flex flex-col gap-3 rounded-2xl border bg-background p-6 shadow-sm sm:p-8"
            >
              <label htmlFor="newsletter-email" className="text-sm font-medium">
                {t("newsletterLabel")}
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id="newsletter-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail((e.target as HTMLInputElement).value)
                    if (success) setSuccess(false)
                  }}
                  placeholder={t("newsletterPlaceholder")}
                  disabled={submitting}
                  required
                  autoComplete="email"
                  className="flex-1"
                />
                <Button type="submit" disabled={submitting || !email.trim()}>
                  {submitting ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={SentIcon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  )}
                  {t("newsletterCta")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("newsletterFine")}
              </p>
              {success && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
                >
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  {t("newsletterSuccessInline")}
                </motion.p>
              )}
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Site footer — tall, multi-column, socials + legal pages
// ═════════════════════════════════════════════════════════════════════════

function SiteFooter({
  lang,
  pages,
  style,
}: {
  lang: string
  pages: StaticPage[]
  style?: React.CSSProperties
}) {
  // Adapter — generic MarketingFooter'ı core'a özel link grupları ve sosyal
  // hesaplarla besle. Style prop'u CSS order için <div> wrapper'ında.
  const t = useTranslations("landing")
  const productLinks = [
    { href: "#features", label: t("navFeatures") },
    { href: "#how", label: t("navHow") },
    { href: "#pricing", label: t("navPricing") },
    { href: "#metrics", label: t("footerMetrics") },
    { href: "#faq", label: t("navFaq") },
  ]
  const developerLinks = [
    { href: "#sdk", label: "SDK" },
    { href: "/docs", label: t("footerDocs") },
    { href: "/status", label: "Status" },
    {
      href: "https://github.com/Sentroy-Co",
      label: "GitHub",
      external: true,
    },
    { href: `/${lang}/login`, label: t("footerDashboard") },
  ]
  const companyLinks = [
    { href: `/${lang}/signup`, label: t("footerGetStarted") },
    { href: `/${lang}/login`, label: t("signIn") },
    { href: `/${lang}/vision`, label: t("footerVision") },
    { href: `/${lang}/investors`, label: t("footerInvestors") },
    { href: `/${lang}/brand`, label: t("footerBrand") },
    {
      href: `/${lang}/contact`,
      label: t("footerContact"),
    },
  ]
  const legalItems =
    pages.length > 0
      ? pages.map((p) => ({
          href: `/${lang}/p/${p.slug}`,
          label:
            typeof p.title === "string"
              ? p.title
              : p.title[lang] ||
                p.title.en ||
                Object.values(p.title)[0] ||
                p.slug,
        }))
      : [
          {
            href: `/${lang}/p/privacy-policy`,
            label: t("footerLegalFallback"),
          },
        ]
  return (
    <div style={style}>
      <MarketingFooter
        lang={lang}
        tagline={t("footerTagline")}
        statusLabel={t("footerStatus")}
        copyright={`© ${new Date().getFullYear()} Sentroy. ${t("footerRights")}`}
        socials={[
          {
            href: "https://instagram.com/sentroycom",
            label: "Instagram",
            icon: InstagramIcon,
          },
          {
            href: "https://www.facebook.com/sentroycom",
            label: "Facebook",
            icon: Facebook01Icon,
          },
          {
            href: "https://github.com/Sentroy-Co",
            label: "GitHub",
            icon: GithubIcon,
          },
          {
            href: "https://x.com/sentroy_co",
            label: "X",
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
          { heading: t("footerProduct"), items: productLinks },
          { heading: t("footerDevelopers"), items: developerLinks },
          { heading: t("footerCompany"), items: companyLinks },
          { heading: t("footerLegal"), items: legalItems },
        ]}
        bottomLinks={[
          {
            label: t("footerCookies"),
            onClick: () => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("open-cookie-preferences"),
                )
              }
            },
          },
        ]}
      />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Replaces strip — SEO-driven "drop-in alternative" section that lives between
// hero and the rest of the page. Renders 4 competitor-keyword cards.
// ═════════════════════════════════════════════════════════════════════════

function ReplacesStrip() {
  const t = useTranslations("landing")
  const cards = [
    {
      key: "mail",
      icon: MailSend02Icon,
      label: t("replacesMailLabel"),
      for: t("replacesMailFor"),
    },
    {
      key: "storage",
      icon: CloudServerIcon,
      label: t("replacesStorageLabel"),
      for: t("replacesStorageFor"),
    },
    {
      key: "auth",
      icon: ShieldKeyIcon,
      label: t("replacesAuthLabel"),
      for: t("replacesAuthFor"),
    },
    {
      key: "vault",
      icon: Key01Icon,
      label: t("replacesVaultLabel"),
      for: t("replacesVaultFor"),
    },
  ] as const

  return (
    <section
      id="replaces"
      className="relative overflow-hidden border-y bg-muted/20"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Reveal>
            <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
              {t("replacesEyebrow")}
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
              {t("replacesTitle")}
            </h2>
          </Reveal>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card, idx) => (
            <Reveal key={card.key} delay={0.1 + idx * 0.06}>
              <div className="group relative h-full rounded-2xl border bg-background/80 p-5 backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-background hover:shadow-lg">
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <HugeiconsIcon
                    icon={card.icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                </div>
                <p className="text-base font-semibold tracking-tight">
                  {card.label}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {card.for}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// JSON-LD schemas — Organization, WebSite, SoftwareApplication, FAQPage.
// Inlined as <script type="application/ld+json"> for SEO + rich-results.
// ═════════════════════════════════════════════════════════════════════════

const SITE_URL = "https://sentroy.com"

function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sentroy",
    url: SITE_URL,
    logo: `${SITE_URL}/business/sentroy-logo-light-h.png`,
    description:
      "Sentroy is a developer platform that replaces Resend, Postmark, Mailgun, AWS S3, Cloudflare R2, Auth0, Clerk, Firebase Auth, Doppler, and Infisical with one SDK, one dashboard, one bill.",
    sameAs: [
      "https://github.com/sentroy",
      "https://twitter.com/sentroyhq",
      "https://www.linkedin.com/company/sentroy",
    ],
  }
}

function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sentroy",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://docs.sentroy.com/?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  }
}

function buildSoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Sentroy",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    description:
      "Drop-in alternative to Resend, Postmark, Mailgun, SendGrid (transactional email), AWS S3, Cloudflare R2, Backblaze B2 (object storage + CDN), Auth0, Clerk, Firebase Auth, Supabase Auth (auth-as-a-service), and Doppler, Infisical, AWS Secrets Manager (env vault). One SDK, one dashboard, one bill.",
    url: SITE_URL,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "47",
    },
  }
}

function buildFAQPageSchema(
  items: ReadonlyArray<{ q: string; a: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  }
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Main page
// ═════════════════════════════════════════════════════════════════════════

export function LandingPage({ lang }: { lang: string }) {
  const t = useTranslations("landing")
  const activeLang = useLocale()
  const [pages, setPages] = useState<StaticPage[]>([])
  const [data, setData] = useState<LandingData | null>(null)
  type LangKey = "typescript" | "python" | "php" | "go"
  const [activeSdkLang, setActiveSdkLang] = useState<LangKey>("typescript")
  const [activeSdkApp, setActiveSdkApp] = useState<string | null>(null)
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })
  // Hero parallax'ı yaylı progress'e bağla → scroll sırasında hafif gecikmeli,
  // daha yumuşak/premium his (mesafe de 120→90 ile sakinleştirildi).
  const smoothHeroProgress = useSpring(scrollYProgress, {
    stiffness: 50,
    damping: 22,
    mass: 0.5,
  })
  const heroY = useTransform(smoothHeroProgress, [0, 1], [0, 90])
  const heroOpacity = useTransform(smoothHeroProgress, [0, 0.6], [1, 0])

  // Premium inertial smooth-scroll (Lenis) — yalnız landing'e scoped (bu
  // bileşen unmount olunca destroy). prefers-reduced-motion'da devre dışı,
  // böylece erişilebilirlik korunur. Native scroll'u Lenis sürdürür; framer
  // useScroll animasyonları scroll event'lerini okuyarak uyumlu çalışır.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
    })
    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)
    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
    }
  }, [])

  useEffect(() => {
    fetch("/api/pages")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setPages(json.data)
      })
      .catch(() => {})
    fetch("/api/public/landing")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setData(json.data)
      })
      .catch(() => {})
  }, [])

  const logos = data?.logos || []
  const testimonials = data?.testimonials || []
  const zsections = data?.zsections || []
  const apps = data?.apps || []
  const plans = data?.plans || []
  const settings = data?.settings
  const sectionOrder = useMemo(
    () => normalizeLandingSectionOrder(settings?.sectionOrder),
    [settings?.sectionOrder]
  )
  const sectionStyle = (id: LandingSectionId): React.CSSProperties => ({
    order: sectionOrder.indexOf(id) + 10,
  })

  // SDK section app picker'ı: ilk SDK örneği olan app default seçilir.
  // CMS-driven `apps` listesi her zaman tüm SDK key'lerini içermez (örn.
  // auth-signin / cli-env-vault yeni eklendi). Her codeExamples key'i için
  // CMS'te entry yoksa synthetic fallback inject ediyoruz — admin daha
  // sonra CMS'ten override edebilir.
  const cmsSdkApps = apps.filter(
    (a) => a.sdkExampleKey && codeExamples[a.sdkExampleKey]
  )
  const cmsKeys = new Set(cmsSdkApps.map((a) => a.sdkExampleKey))
  const synthetic: LandingApp[] = SDK_EXAMPLE_KEYS.filter(
    (k) => !cmsKeys.has(k),
  ).map((k) => SYNTHETIC_SDK_APPS[k])
  const sdkApps = [...cmsSdkApps, ...synthetic]
  const effectiveSdkApp = activeSdkApp ?? sdkApps[0]?.sdkExampleKey ?? null
  // CLI gibi shell-only key'lerde language tab'ları kapalı + bash render.
  const shellOnly =
    effectiveSdkApp !== null && SHELL_ONLY_KEYS.has(effectiveSdkApp)
  useEffect(() => {
    if (!activeSdkApp && sdkApps.length > 0 && sdkApps[0].sdkExampleKey) {
      setActiveSdkApp(sdkApps[0].sdkExampleKey)
    }
  }, [activeSdkApp, sdkApps])

  // ── JSON-LD payloads (computed once per render, deterministic) ──────────
  const faqJsonLdItems = FAQ_KEYS.map((key) => ({
    q: t(`faq_${key}_q`),
    a: t(`faq_${key}_a`),
  }))

  return (
    <div className="flex min-h-svh flex-col overflow-x-hidden">
      {/* ── JSON-LD: Organization + WebSite + SoftwareApplication + FAQ ── */}
      <JsonLd data={buildOrganizationSchema()} />
      <JsonLd data={buildWebSiteSchema()} />
      <JsonLd data={buildSoftwareApplicationSchema()} />
      <JsonLd data={buildFAQPageSchema(faqJsonLdItems)} />

      {/* ── Nav ─────────────────────────────────────────────────── */}
      <FloatingNav
        lang={lang}
        showPricing={!!(settings?.showPricing && plans.length > 0)}
        showTestimonials={
          !!(settings?.showTestimonials && testimonials.length > 0)
        }
        showApps={!!(settings?.showApps !== false && apps.length > 0)}
        sectionOrder={sectionOrder}
        dataReady={data !== null}
      />

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        id="top"
        ref={heroRef}
        className="relative overflow-hidden pt-32 lg:pt-40"
      >
        {/* Subtle grid */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-[0.06]" />
        {/* Radial glow */}
        <div className="absolute top-10 left-1/2 -z-10 size-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 lg:grid-cols-2 lg:gap-16 lg:pb-32"
        >
          <div>
            <Reveal>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                <HugeiconsIcon
                  icon={RocketIcon}
                  strokeWidth={2}
                  className="size-3.5 text-primary"
                />
                {t("heroBadge")}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <h1 className="text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-6xl">
                {t("heroTitle")}{" "}
                <span className="bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
                  {t("heroTitleHighlight")}
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                {t("heroDescription")}
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Button size="lg" render={<a href={`/${lang}/signup`} />}>
                  {t("heroCta")}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </Button>
                <Button variant="outline" size="lg" render={<a href="#sdk" />}>
                  <HugeiconsIcon
                    icon={CodeIcon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  {t("heroSecondaryCta")}
                </Button>
              </div>
            </Reveal>
            <Reveal delay={0.4}>
              <div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className="size-3.5 text-emerald-500"
                  />
                  {t("heroReassurance1")}
                </span>
                <span className="flex items-center gap-1.5">
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className="size-3.5 text-emerald-500"
                  />
                  {t("heroReassurance2")}
                </span>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.2}>
            <HeroGlobe />
          </Reveal>
        </motion.div>
      </section>

      {/* ── Replaces strip (SEO: competitor keywords) ───────────── */}
      <ReplacesStrip />

      {/* ── Social Proof ────────────────────────────────────────── */}
      {settings?.showLogos && logos.length > 0 && (
        <section style={sectionStyle("logos")} className="border-y bg-muted/20">
          <div className="mx-auto max-w-6xl px-6 pt-12 pb-10">
            <p className="mb-8 text-center text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {loc(settings.trustMessage, activeLang) || t("trustDefault")}
            </p>
          </div>
          <div className="group/marquee relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] pb-12">
            <div className="animate-marquee-left flex w-max items-center gap-16 group-hover/marquee:[animation-play-state:paused]">
              {[...logos, ...logos].map((logo, idx) => {
                const inner = (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo.imageUrl}
                    alt={logo.name}
                    className="h-12 w-auto object-contain opacity-60 grayscale transition-all duration-300 hover:scale-110 hover:opacity-100 hover:grayscale-0 sm:h-14"
                  />
                )
                return logo.url ? (
                  <a
                    key={`${logo.id}-${idx}`}
                    href={logo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={`${logo.id}-${idx}`} className="shrink-0">
                    {inner}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Security strip ──────────────────────────────────────── */}
      <SecurityStrip style={sectionStyle("security")} />

      {/* ── Apps (data-driven) ──────────────────────────────────── */}
      {settings?.showApps !== false && apps.length > 0 && (
        <section id="apps" style={sectionStyle("apps")} className="border-b">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <div className="mx-auto mb-16 max-w-2xl text-center">
                <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
                  {t("appsEyebrow")}
                </p>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {t("appsTitle")}
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  {t("appsDescription")}
                </p>
              </div>
            </Reveal>

            <StaggerContainer className="grid gap-6 md:grid-cols-2">
              {apps.map((app) => {
                const Icon = APP_ICONS[app.iconKey] || CloudServerIcon
                return (
                  <StaggerItem key={app.id}>
                    <TiltCard className="flex h-full flex-col gap-5 rounded-2xl border bg-card p-7">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <HugeiconsIcon
                            icon={Icon}
                            strokeWidth={1.8}
                            className="size-6"
                          />
                        </div>
                        <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                          {app.key}
                        </code>
                      </div>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-2xl font-semibold tracking-tight">
                          {loc(app.name, activeLang)}
                        </h3>
                        <p className="text-sm font-medium text-primary">
                          {loc(app.tagline, activeLang)}
                        </p>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {loc(app.description, activeLang)}
                        </p>
                      </div>
                      {app.features.length > 0 && (
                        <ul className="flex flex-col gap-2 text-sm">
                          {app.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <HugeiconsIcon
                                icon={Tick02Icon}
                                strokeWidth={2}
                                className="mt-0.5 size-4 shrink-0 text-emerald-500"
                              />
                              <span>{loc(feature, activeLang)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto flex items-center gap-3 pt-2">
                        <Button render={<a href={app.ctaUrl} />}>
                          {loc(app.ctaLabel, activeLang)}
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            strokeWidth={2}
                            className="size-4"
                          />
                        </Button>
                        {app.sdkExampleKey &&
                          codeExamples[app.sdkExampleKey] && (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setActiveSdkApp(app.sdkExampleKey)
                                const el = document.getElementById("sdk")
                                if (el)
                                  el.scrollIntoView({ behavior: "smooth" })
                              }}
                            >
                              <HugeiconsIcon
                                icon={CodeIcon}
                                strokeWidth={2}
                                className="size-4"
                              />
                              {t("appsViewSdk")}
                            </Button>
                          )}
                      </div>
                    </TiltCard>
                  </StaggerItem>
                )
              })}
            </StaggerContainer>
          </div>
        </section>
      )}

      {/* ── Features ────────────────────────────────────────────── */}
      <FeaturesSection style={sectionStyle("features")} />

      {/* ── Z-Layout: Problem → Solution → Result ───────────────── */}
      {settings?.showZSections !== false && zsections.length > 0 && (
        <section
          id="how"
          style={sectionStyle("zsections")}
          className="border-b bg-muted/20"
        >
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <div className="mx-auto mb-20 max-w-2xl text-center">
                <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
                  {t("howEyebrow")}
                </p>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {t("howTitle")}
                </h2>
              </div>
            </Reveal>

            <div className="flex flex-col gap-24">
              {zsections.map((section, idx) => (
                <Reveal key={section.id}>
                  <div
                    className={cn(
                      "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
                      idx % 2 === 1 && "lg:[&>*:first-child]:order-2"
                    )}
                  >
                    {/* Text */}
                    <div>
                      <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                        {idx + 1}
                      </div>
                      <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        {loc(section.title, activeLang)}
                      </h3>
                      <div className="mt-6 flex flex-col gap-4">
                        <ZBulletRow
                          icon={Alert01Icon}
                          tone="red"
                          label={t("labelProblem")}
                          text={loc(section.problem, activeLang)}
                        />
                        <ZBulletRow
                          icon={RocketIcon}
                          tone="blue"
                          label={t("labelSolution")}
                          text={loc(section.solution, activeLang)}
                        />
                        <ZBulletRow
                          icon={CheckmarkCircle02Icon}
                          tone="green"
                          label={t("labelResult")}
                          text={loc(section.result, activeLang)}
                        />
                      </div>
                    </div>
                    {/* Visual */}
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-gradient-to-br from-muted/60 via-background to-muted/30 shadow-sm">
                      {section.visual ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={section.visual}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <ZSectionVisual variant={idx % 3} />
                      )}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Metrics ─────────────────────────────────────────────── */}
      {settings?.showMetrics !== false && (
        <MetricsSection style={sectionStyle("metrics")} />
      )}

      {/* ── Testimonials ────────────────────────────────────────── */}
      {settings?.showTestimonials && testimonials.length > 0 && (
        <section
          id="testimonials"
          style={sectionStyle("testimonials")}
          className="border-b"
        >
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <div className="mx-auto mb-12 max-w-2xl text-center">
                <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
                  {t("testimonialsEyebrow")}
                </p>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {t("testimonialsTitle")}
                </h2>
              </div>
            </Reveal>
          </div>
          <TestimonialsMarquee items={testimonials} activeLang={activeLang} />
          <div className="py-12" />
        </section>
      )}

      {/* ── Pricing ─────────────────────────────────────────────── */}
      {settings?.showPricing && plans.length > 0 && (
        <section
          id="pricing"
          style={sectionStyle("pricing")}
          className="border-b"
        >
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <div className="mx-auto mb-16 max-w-2xl text-center">
                <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
                  {t("pricingEyebrow")}
                </p>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {loc(settings.pricingTitle, activeLang) ||
                    t("pricingTitleDefault")}
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  {loc(settings.pricingSubtitle, activeLang) ||
                    t("pricingSubtitleDefault")}
                </p>
              </div>
            </Reveal>
            <StaggerContainer
              className={cn(
                "grid gap-6",
                plans.length === 1 && "mx-auto max-w-md",
                plans.length === 2 && "md:grid-cols-2",
                plans.length >= 3 && "md:grid-cols-2 lg:grid-cols-3",
                plans.length >= 4 && "lg:grid-cols-4"
              )}
            >
              {plans.map((plan) => {
                const name = loc(plan.name, activeLang)
                const description = loc(plan.description, activeLang)
                const isFree = plan.price === 0
                return (
                  <StaggerItem key={plan.id}>
                    <div
                      className={cn(
                        "relative flex h-full flex-col gap-5 rounded-2xl border bg-background p-6",
                        plan.isDefault &&
                          "border-primary shadow-lg ring-1 ring-primary/20"
                      )}
                    >
                      {plan.isDefault && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                          {t("pricingPopular")}
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-semibold">{name}</h3>
                        {description && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold tracking-tight">
                          {isFree
                            ? t("pricingFree")
                            : `$${plan.price.toLocaleString(activeLang)}`}
                        </span>
                        {!isFree && (
                          <span className="text-sm text-muted-foreground">
                            {t("pricingPerMonth")}
                          </span>
                        )}
                      </div>
                      <ul className="flex flex-col gap-2.5 text-sm">
                        <PricingFeature
                          text={t("pricingFeatEmails", {
                            count:
                              plan.monthlyEmailLimit < 0
                                ? t("pricingUnlimited")
                                : plan.monthlyEmailLimit.toLocaleString(
                                    activeLang,
                                  ),
                          })}
                        />
                        <PricingFeature
                          text={t("pricingFeatStorage", {
                            value:
                              plan.storageLimit < 0
                                ? t("pricingUnlimited")
                                : formatStorage(plan.storageLimit, activeLang),
                          })}
                        />
                        <PricingFeature
                          text={t("pricingFeatDomains", {
                            count:
                              plan.maxDomainsPerCompany < 0
                                ? t("pricingUnlimited")
                                : plan.maxDomainsPerCompany.toLocaleString(
                                    activeLang,
                                  ),
                          })}
                        />
                        <PricingFeature
                          text={t("pricingFeatMembers", {
                            count:
                              plan.maxMembersPerCompany < 0
                                ? t("pricingUnlimited")
                                : plan.maxMembersPerCompany.toLocaleString(
                                    activeLang,
                                  ),
                          })}
                        />
                        {plan.features.map((feature, i) => (
                          <PricingFeature key={i} text={loc(feature, activeLang)} />
                        ))}
                      </ul>
                      <div className="mt-auto pt-2">
                        <Button
                          className="w-full"
                          variant={plan.isDefault ? "default" : "outline"}
                          render={<a href={`/${lang}/signup`} />}
                        >
                          {isFree ? t("pricingCtaFree") : t("pricingCta")}
                        </Button>
                      </div>
                    </div>
                  </StaggerItem>
                )
              })}
            </StaggerContainer>
          </div>
        </section>
      )}

      {/* ── SDK / Developer Section (KEEP) ──────────────────────── */}
      <section
        id="sdk"
        style={sectionStyle("sdk")}
        className="border-b bg-muted/30"
      >
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <Reveal>
              <div>
                <p className="mb-3 text-sm font-medium tracking-wider text-primary uppercase">
                  {t("sdkEyebrow")}
                </p>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {t("sdkTitle")}
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                  {t("sdkDescription")}
                </p>
                <div className="mt-6 flex items-center gap-2 rounded-xl border bg-background px-4 py-3 font-mono text-sm">
                  <span className="text-muted-foreground">$</span>
                  <span>npm install @sentroy-co/client-sdk</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("sdkAlso")}{" "}
                  <a href="/docs" className="text-primary hover:underline">
                    {t("sdkViewDocs")}
                  </a>
                </p>
                <div className="mt-6">
                  <Button render={<a href={`/${lang}/signup`} />}>
                    {t("sdkCta")}
                    <HugeiconsIcon
                      icon={Key01Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </Button>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="overflow-hidden rounded-2xl border bg-zinc-950">
                {/* App tab strip — apps olmadan fallback statik mail-send */}
                {sdkApps.length > 0 && (
                  <div className="flex flex-wrap gap-1 border-b border-zinc-800 bg-zinc-900/40 px-2 py-2">
                    {sdkApps.map((app) => {
                      const Icon = APP_ICONS[app.iconKey] || CloudServerIcon
                      const isActive = effectiveSdkApp === app.sdkExampleKey
                      return (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => setActiveSdkApp(app.sdkExampleKey)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            isActive
                              ? "bg-zinc-800 text-zinc-100"
                              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                          )}
                        >
                          <HugeiconsIcon
                            icon={Icon}
                            strokeWidth={2}
                            className="size-3.5"
                          />
                          {loc(app.name, activeLang)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {/* Language tab strip — CLI gibi shell-only key'lerde
                    gizlenir; yerine pasif "Shell" rozeti gösterilir. */}
                {shellOnly ? (
                  <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-3 py-2">
                    <span className="rounded-md bg-zinc-800/60 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-300">
                      Shell
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      bash · zsh · sh
                    </span>
                  </div>
                ) : (
                  <div className="flex border-b border-zinc-800">
                    {(Object.keys(langMap) as LangKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveSdkLang(key)}
                        className={cn(
                          "px-4 py-2.5 text-xs font-medium transition-colors",
                          activeSdkLang === key
                            ? "bg-zinc-800/60 text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {langMap[key]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="p-5">
                  <CodeBlock
                    code={
                      effectiveSdkApp &&
                      codeExamples[effectiveSdkApp]?.[activeSdkLang]
                        ? codeExamples[effectiveSdkApp][activeSdkLang]
                        : codeExamples["mail-send"][activeSdkLang]
                    }
                    language={
                      shellOnly
                        ? "bash"
                        : activeSdkLang === "typescript"
                          ? "ts"
                          : activeSdkLang
                    }
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <FAQSection style={sectionStyle("faq")} />

      {/* ── Final CTA ───────────────────────────────────────────── */}
      <section
        style={sectionStyle("finalCta")}
        className="relative overflow-hidden border-b"
      >
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              {t("finalCtaTitle")}
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              {t("finalCtaDescription")}
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" render={<a href={`/${lang}/signup`} />}>
                {t("finalCtaButton")}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("finalCtaFine")}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Newsletter ──────────────────────────────────────────── */}
      <NewsletterSection style={sectionStyle("newsletter")} />

      {/* ── Footer ──────────────────────────────────────────────── */}
      <SiteFooter
        lang={lang}
        pages={pages}
        style={{ order: sectionOrder.length + 20 }}
      />

      {/* ── Cookie consent ──────────────────────────────────────── */}
      <CookieConsent />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Z-section helpers
// ═════════════════════════════════════════════════════════════════════════

function ZBulletRow({
  icon,
  tone,
  label,
  text,
}: {
  icon: typeof Alert01Icon
  tone: "red" | "blue" | "green"
  label: string
  text: string
}) {
  const toneClasses = {
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  }
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          toneClasses[tone]
        )}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        <p className="text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

function TestimonialsMarquee({
  items,
  activeLang,
}: {
  items: Testimonial[]
  activeLang: string
}) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  })
  // Scroll'a 1:1 yerine yaylı (eased) bağ + daha kısa mesafe → marquee'ler
  // belirgin biçimde daha yavaş ve premium akar (jitter yok).
  const smooth = useSpring(scrollYProgress, {
    stiffness: 45,
    damping: 20,
    mass: 0.5,
  })
  const x1 = useTransform(smooth, [0, 1], ["0%", "-18%"])
  const x2 = useTransform(smooth, [0, 1], ["-18%", "0%"])

  // Split into two rows. For odd counts, first row gets one more.
  const mid = Math.ceil(items.length / 2)
  const row1 = items.slice(0, mid)
  const row2 = items.slice(mid)
  // Ensure both rows have enough cards to fill the viewport — duplicate if short.
  const row1Items =
    row1.length < 6 ? [...row1, ...row1, ...row1] : [...row1, ...row1]
  const row2Items =
    row2.length < 6 ? [...row2, ...row2, ...row2] : [...row2, ...row2]

  return (
    <div
      ref={sectionRef}
      className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
    >
      <motion.div style={{ x: x1 }} className="flex w-max gap-4 px-4">
        {row1Items.map((item, idx) => (
          <TestimonialCard
            key={`r1-${item.id}-${idx}`}
            item={item}
            activeLang={activeLang}
          />
        ))}
      </motion.div>
      <motion.div style={{ x: x2 }} className="mt-4 flex w-max gap-4 px-4">
        {row2Items.map((item, idx) => (
          <TestimonialCard
            key={`r2-${item.id}-${idx}`}
            item={item}
            activeLang={activeLang}
          />
        ))}
      </motion.div>
    </div>
  )
}

function TestimonialCard({
  item,
  activeLang,
}: {
  item: Testimonial
  activeLang: string
}) {
  return (
    <div className="flex w-[360px] shrink-0 flex-col gap-3 rounded-2xl border bg-background p-5 sm:w-[400px]">
      <div className="flex items-center gap-3">
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photoUrl}
            alt={item.name}
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {item.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {loc(item.title, activeLang)}
          </p>
        </div>
        {item.rating != null && (
          <div className="flex shrink-0 gap-0.5">
            {Array.from({ length: 5 }).map((_, j) => (
              <HugeiconsIcon
                key={j}
                icon={StarIcon}
                strokeWidth={2}
                className={cn(
                  "size-3",
                  j < (item.rating ?? 0)
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted"
                )}
              />
            ))}
          </div>
        )}
      </div>
      <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
        &ldquo;{loc(item.quote, activeLang)}&rdquo;
      </p>
    </div>
  )
}

function PricingFeature({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <HugeiconsIcon
        icon={Tick02Icon}
        strokeWidth={2.5}
        className="mt-0.5 size-4 shrink-0 text-primary"
      />
      <span className="text-muted-foreground">{text}</span>
    </li>
  )
}

function ZSectionVisual({ variant }: { variant: number }) {
  if (variant === 0) {
    return (
      <div className="absolute inset-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-3">
          <HugeiconsIcon
            icon={InternetIcon}
            strokeWidth={2}
            className="size-4 text-primary"
          />
          <span className="text-xs font-medium">acme.com</span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-500">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        </div>
        <div className="ml-6 flex flex-col gap-1 rounded-lg border bg-background p-3 font-mono text-[10px] text-muted-foreground">
          <div>SPF ✓</div>
          <div>DKIM ✓</div>
          <div>DMARC ✓</div>
          <div className="text-emerald-500">BIMI verified</div>
        </div>
      </div>
    )
  }
  if (variant === 1) {
    return (
      <div className="absolute inset-6 flex flex-col items-center justify-center gap-3">
        <div className="flex gap-2">
          {["T", "P", "G", "R"].map((l, i) => (
            <div
              key={l}
              className={cn(
                "flex size-10 items-center justify-center rounded-xl font-mono text-sm font-bold",
                i === 0 ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {l}
            </div>
          ))}
        </div>
        <div className="h-px w-full bg-border" />
        <div className="w-full rounded-lg border bg-background p-3 font-mono text-[10px]">
          <div className="text-muted-foreground">sentroy.send.email({})</div>
          <div className="text-emerald-500">→ 247ms</div>
        </div>
      </div>
    )
  }
  return (
    <div className="absolute inset-6 flex flex-col gap-2">
      <div className="rounded-lg border bg-background p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Delivery</span>
          <span className="text-sm font-bold text-emerald-500">99.2%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[99%] rounded-full bg-emerald-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-background p-3">
          <div className="text-[10px] text-muted-foreground">Opens</div>
          <div className="text-sm font-bold">42.8%</div>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <div className="text-[10px] text-muted-foreground">Clicks</div>
          <div className="text-sm font-bold">12.3%</div>
        </div>
      </div>
    </div>
  )
}

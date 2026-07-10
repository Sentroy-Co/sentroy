"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare01Icon,
  UserMultipleIcon,
  Building06Icon,
  Wallet01Icon,
  CreditCardIcon,
  Coupon03Icon,
  File01Icon,
  ImageAdd01Icon,
  TextCreationIcon,
  Search01Icon,
  MailSend02Icon,
  ServerStack02Icon,
  DatabaseIcon,
  KeyIcon,
  Settings05Icon,
  LinkSquare02Icon,
  Store01Icon,
  ShoppingBag01Icon,
  Mail01Icon,
} from "@hugeicons/core-free-icons"
import { clientRootDomain, subAppOrigin } from "@workspace/auth/lib/domains"

type IconType = typeof DashboardSquare01Icon

interface Section {
  id: string
  /** /[lang]/admin/<slug> — boşsa kök (overview). */
  slug: string
  labelKey: string
  icon: IconType
  color: string
  /** Dış uygulama (yeni sekmede açılır, iframe değil). */
  external?: string
}
interface SectionGroup {
  labelKey?: string
  items: Section[]
}

const GROUPS: SectionGroup[] = [
  {
    labelKey: "groupManagement",
    items: [
      { id: "users", slug: "users", labelKey: "users", icon: UserMultipleIcon, color: "#3b82f6" },
      { id: "companies", slug: "companies", labelKey: "companies", icon: Building06Icon, color: "#6366f1" },
      { id: "contact-messages", slug: "contact-messages", labelKey: "contactMessages", icon: Mail01Icon, color: "#f43f5e" },
    ],
  },
  {
    labelKey: "groupFinance",
    items: [
      { id: "billing", slug: "billing", labelKey: "billing", icon: Wallet01Icon, color: "#22c55e" },
      { id: "plans", slug: "plans", labelKey: "plans", icon: CreditCardIcon, color: "#10b981" },
      { id: "system-products", slug: "system-products", labelKey: "systemProducts", icon: ShoppingBag01Icon, color: "#14b8a6" },
      { id: "coupons", slug: "coupons", labelKey: "coupons", icon: Coupon03Icon, color: "#ec4899" },
    ],
  },
  {
    labelKey: "groupContent",
    items: [
      { id: "pages", slug: "pages", labelKey: "pages", icon: File01Icon, color: "#f97316" },
      { id: "landing", slug: "landing", labelKey: "landing", icon: ImageAdd01Icon, color: "#0ea5e9" },
      { id: "template-library", slug: "template-library", labelKey: "templateLibrary", icon: TextCreationIcon, color: "#a855f7" },
      { id: "seo", slug: "seo", labelKey: "seo", icon: Search01Icon, color: "#f59e0b" },
      { id: "app-store", slug: "app-store", labelKey: "appStore", icon: Store01Icon, color: "#8b5cf6" },
    ],
  },
  {
    labelKey: "groupSystem",
    items: [
      { id: "system-mail", slug: "system-mail", labelKey: "systemMail", icon: MailSend02Icon, color: "#06b6d4" },
      {
        id: "system-status",
        slug: "",
        labelKey: "systemStatus",
        icon: ServerStack02Icon,
        color: "#14b8a6",
        external: `${process.env.NEXT_PUBLIC_STATUS_URL || subAppOrigin(clientRootDomain(), "status")}`,
      },
      { id: "backups", slug: "backups", labelKey: "backups", icon: DatabaseIcon, color: "#0d9488" },
      { id: "env-vault", slug: "env-vault", labelKey: "envVault", icon: KeyIcon, color: "#ef4444" },
      { id: "settings", slug: "settings", labelKey: "settings", icon: Settings05Icon, color: "#6b7280" },
    ],
  },
]

const PAGES_FALLBACK: Record<string, string> = { pages: "Pages", "app-store": "App Store" }

/**
 * Admin paneli — OS pencere içeriği (WindowFrame children). SettingsWindow ile
 * aynı macOS System Settings deseni: gruplu kenar çubuğu (renkli ikon kareleri,
 * mavi aktif) + içerikte ilgili admin sayfasının embed iframe'i. Ziyaret edilen
 * bölümler mount kalır (anında geçiş). Admin sayfaları ağır olduğu için native
 * değil iframe — embed modda kendi sidebar/header'ını gizler.
 */
export function AdminPanel({ lang }: { lang: string }) {
  const t = useTranslations("admin")
  const [active, setActive] = useState("users")
  const [visited, setVisited] = useState<Set<string>>(() => new Set(["users"]))

  const label = (s: Section) => {
    try {
      return t(s.labelKey)
    } catch {
      return PAGES_FALLBACK[s.id] ?? s.id
    }
  }

  function select(s: Section) {
    if (s.external) {
      window.open(`${s.external}/${lang}`, "_blank", "noopener,noreferrer")
      return
    }
    setActive(s.id)
    setVisited((v) => (v.has(s.id) ? v : new Set(v).add(s.id)))
  }

  const allSections = GROUPS.flatMap((g) => g.items).filter((s) => !s.external)
  const sectionUrl = (s: Section) => `/${lang}/admin${s.slug ? `/${s.slug}` : ""}?embed=1`

  return (
    <div className="flex h-full select-none bg-background">
      <aside className="os-scrollbar flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border/60 bg-muted/30 p-3">
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
            <HugeiconsIcon icon={KeyIcon} className="size-4" strokeWidth={2} />
          </span>
          <span className="text-sm font-semibold text-foreground">{t("title")}</span>
        </div>

        {GROUPS.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.labelKey ? (
              <p className="mb-0.5 px-2 text-[11px] font-medium text-muted-foreground">{t(group.labelKey)}</p>
            ) : null}
            {group.items.map((s) => {
              const isActive = !s.external && s.id === active
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(s)}
                  className={
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors " +
                    (isActive ? "bg-[#0a84ff] text-white" : "text-foreground hover:bg-foreground/5")
                  }
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm" style={{ background: s.color }}>
                    <HugeiconsIcon icon={s.icon} className="size-4" strokeWidth={2} />
                  </span>
                  <span className="flex-1 truncate">{label(s)}</span>
                  {s.external ? (
                    <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5 opacity-50" strokeWidth={2} />
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </aside>

      <div className="relative min-w-0 flex-1 bg-background">
        {allSections
          .filter((s) => visited.has(s.id))
          .map((s) => (
            <AdminFrame key={s.id} title={label(s)} src={sectionUrl(s)} active={s.id === active} color={s.color} />
          ))}
      </div>
    </div>
  )
}

function AdminFrame({ title, src, active, color }: { title: string; src: string; active: boolean; color: string }) {
  const [loaded, setLoaded] = useState(false)
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

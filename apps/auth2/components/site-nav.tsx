import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ShieldKeyIcon,
  Mail01Icon,
  FolderLibraryIcon,
  KeyIcon,
  Notebook01Icon,
} from "@hugeicons/core-free-icons"
import { Logo } from "@workspace/console/components/shared"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Auth landing top nav — sentroy.com chrome'unun küçük varyantı.
 * Diğer Sentroy ürünlerine cross-link, "Auth" current item highlighted.
 *
 * Consent / OAuth flow ekranlarında render edilmez — onlar focused UX
 * (kullanıcı şu an bir auth flow ortasında, ürün gezinmesi distraction).
 */

interface NavItem {
  label: string
  href: string
  icon: typeof Mail01Icon
  current?: boolean
  external?: boolean
}

interface SiteNavProps {
  lang: string
  /** Her label için çevrilmiş metin (locale-aware caller'dan gelir). */
  labels: {
    mail: string
    storage: string
    auth: string
    vault: string
    docs: string
  }
  className?: string
}

export function SiteNav({ lang, labels, className }: SiteNavProps) {
  const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
  const mailUrl = process.env.NEXT_PUBLIC_MAIL_APP_URL || "https://mail.sentroy.com"
  const storageUrl = process.env.NEXT_PUBLIC_STORAGE_APP_URL || "https://storage.sentroy.com"
  const vaultUrl = process.env.NEXT_PUBLIC_VAULT_APP_URL || "https://vault.sentroy.com"
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.sentroy.com"

  const items: NavItem[] = [
    { label: labels.mail, href: `${mailUrl}/${lang}`, icon: Mail01Icon, external: true },
    {
      label: labels.storage,
      href: `${storageUrl}/${lang}`,
      icon: FolderLibraryIcon,
      external: true,
    },
    { label: labels.auth, href: `/${lang}`, icon: ShieldKeyIcon, current: true },
    { label: labels.vault, href: `${vaultUrl}/${lang}`, icon: KeyIcon, external: true },
    { label: labels.docs, href: `${docsUrl}/auth`, icon: Notebook01Icon, external: true },
  ]

  return (
    <header
      className={cn(
        "sticky top-0 z-30 w-full border-b border-border/50 bg-background/80 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href={coreUrl}
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Logo size="sm" />
          <span>Sentroy</span>
        </Link>
        <nav className="flex items-center gap-1">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              {...(item.external
                ? { target: "_blank", rel: "noreferrer noopener" }
                : {})}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                item.current
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <HugeiconsIcon
                icon={item.icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

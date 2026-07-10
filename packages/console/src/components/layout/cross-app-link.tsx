"use client"

import { useParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  FolderLibraryIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"

/**
 * Header'daki uygulamalar arası kısayol — kullanıcı mail'deyken storage'a,
 * storage'dayken mail'e tek tıkla geçsin diye. NotificationsSheet ve
 * MailInboxButton ile aynı satıra yerleştirilir.
 *
 * `app` propu HEDEF uygulamayı söyler (mevcut uygulama değil); icon ve
 * URL ona göre seçilir. Tek dosya ile her iki yön de kapsanır.
 */
export function CrossAppLink({ app }: { app: "mail" | "storage" }) {
  const params = useParams<{ lang: string; "company-slug": string }>()
  const lang = params?.lang || "en"
  const slug = params?.["company-slug"]
  if (!slug) return null

  const config =
    app === "mail"
      ? {
          icon: Mail01Icon,
          label: "Mail",
          baseUrl: process.env.NEXT_PUBLIC_MAIL_APP_URL || "",
        }
      : {
          icon: FolderLibraryIcon,
          label: "Storage",
          baseUrl: process.env.NEXT_PUBLIC_STORAGE_APP_URL || "",
        }

  // Cross-subdomain: absolute URL şart, yoksa rewrite tarafından
  // mevcut origin'in kendi /[lang]/d/... rotasına gider (yanlış).
  // Env yoksa render etme — broken link yaratmaktansa hiç gösterme.
  if (!config.baseUrl) return null

  const href = `${config.baseUrl}/${lang}/d/${slug}`
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Open ${config.label}`}
      title={`Open ${config.label}`}
      render={<a href={href} />}
    >
      <HugeiconsIcon icon={config.icon} strokeWidth={2} />
    </Button>
  )
}

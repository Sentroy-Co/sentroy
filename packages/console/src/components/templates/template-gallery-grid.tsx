"use client"

import { type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Mail01Icon } from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Mail template kartı için ortak görsel grid. Mail uygulamasındaki
 * `templates-content` sayfası ve admin sistem-mail event editor'ünün
 * "Choose template" diyaloğu aynı görsel ritimde olsun diye paylaşılır.
 *
 * Sadece display + interaction callback'leri; data fetching, edit/save
 * akışı caller tarafında. Item shape'i minimum kontrat:
 *   - id (key)
 *   - name (string ya da localized — caller resolve eder)
 *   - subject (display only — string)
 *   - thumbnailUrl (opt — yoksa Mail icon placeholder)
 *   - badges (opt — domain, lang chip'leri)
 *   - meta (opt — sağ-alt ikincil metin, örn updatedAt)
 */
export interface TemplateGalleryItem {
  id: string
  name: string
  subject?: string
  thumbnailUrl?: string
  /** Sağ üst köşedeki chip'ler — domain adı, dil kodları, kategori vb. */
  badges?: ReactNode[]
  /** Footer'da sağ-alt metin — `formatDate(updatedAt)` gibi. */
  meta?: ReactNode
  /** Footer'da sağ üst aksiyon ikonları — preview, kopya, sil. Caller
   *  yönetir; tıklamada propagation durdurulur ki kart click'i tetiklenmesin. */
  actions?: ReactNode
}

export interface TemplateGalleryGridProps {
  items: TemplateGalleryItem[]
  /** Karta tıklama (genelde edit / select). */
  onSelect: (id: string) => void
  /** Boş state placeholder. */
  emptyLabel?: string
  /** Başlık altı alanı kart kullanmadan boş gösterimde özelleştirmek için. */
  emptyContent?: ReactNode
  /** İsteğe bağlı container className override (örn dialog içinde compact). */
  className?: string
  /** Compact mod — dialog'da kullanılmak üzere daha küçük kart. Default: false. */
  compact?: boolean
}

export function TemplateGalleryGrid({
  items,
  onSelect,
  emptyLabel = "No templates yet.",
  emptyContent,
  className,
  compact = false,
}: TemplateGalleryGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        {emptyContent ?? emptyLabel}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "grid gap-4",
        compact
          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
          : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((it) => (
        <Card
          key={it.id}
          className="cursor-pointer overflow-hidden p-0 transition-colors hover:bg-muted/50"
          onClick={() => onSelect(it.id)}
        >
          <div
            className={cn(
              "overflow-hidden bg-muted/40",
              compact ? "aspect-[4/3]" : "aspect-[3/4]",
            )}
          >
            {it.thumbnailUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={it.thumbnailUrl}
                alt={it.name}
                className="size-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <HugeiconsIcon
                  icon={Mail01Icon}
                  strokeWidth={1.5}
                  className={cn(
                    "text-muted-foreground/40",
                    compact ? "size-6" : "size-8",
                  )}
                />
              </div>
            )}
          </div>
          <CardHeader
            className={cn(
              "pb-2",
              compact ? "px-3 pt-2" : "px-4 pt-3",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <CardTitle className={cn(compact ? "text-sm" : "text-base")}>
                {it.name}
              </CardTitle>
              {it.actions && (
                <div
                  className="flex items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {it.actions}
                </div>
              )}
            </div>
            {it.subject && (
              <CardDescription className="truncate">
                {it.subject}
              </CardDescription>
            )}
          </CardHeader>
          {(it.badges?.length || it.meta) && (
            <CardContent
              className={cn(
                compact ? "px-3 pb-3" : "px-4 pb-4",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {it.badges?.map((badge, i) => (
                  <span key={i} className="contents">
                    {badge}
                  </span>
                ))}
                {it.meta && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {it.meta}
                  </span>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}

/** Convenience helper — sıkça gerek duyulan `<Badge variant="outline">` chip'i. */
export function TemplateGalleryBadge({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", className)}>
      {children}
    </Badge>
  )
}

/** Convenience helper — kart action ikonları için ghost-icon button. */
export function TemplateGalleryActionButton(
  props: React.ComponentProps<typeof Button> & { title?: string },
) {
  return <Button variant="ghost" size="icon-sm" {...props} />
}

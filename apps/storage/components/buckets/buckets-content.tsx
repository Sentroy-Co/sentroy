"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { format, formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  File01Icon,
  Folder01Icon,
  FolderLibraryIcon,
  InternetIcon,
  InformationCircleIcon,
  LockKeyIcon,
  TimeScheduleIcon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons"
import {
  PageTransition,
  EmptyState,
} from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"
import type { Bucket } from "@workspace/db/types"
import { useSession } from "@workspace/auth/client/auth-client"
import { hasClientPermission } from "@workspace/auth/server/route-permissions"
import { useCompanyStore } from "@workspace/console/stores/company"
import { CreateBucketDialog } from "./create-bucket-dialog"
import { useStorageTour } from "@/components/tour/storage-tour"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function BucketsContent() {
  const t = useTranslations("buckets")
  const tTour = useTranslations("tour")
  const { startBucketTour } = useStorageTour()
  const params = useParams()
  const companySlug = params["company-slug"] as string
  const lang = params.lang as string

  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [infoBucket, setInfoBucket] = useState<Bucket | null>(null)
  const membership = useCompanyStore((s) => s.membership)
  const { data: session } = useSession()
  const systemRole = (session?.user as { role?: string } | undefined)?.role
  const canCreateBucket = hasClientPermission(
    membership,
    "buckets.create",
    systemRole,
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companySlug}/buckets`)
      const json = await res.json()
      if (json.data) setBuckets(json.data)
    } finally {
      setLoading(false)
    }
  }, [companySlug])

  useEffect(() => {
    load()
  }, [load])

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={startBucketTour}
              title={tTour("restart")}
              aria-label={tTour("restart")}
            >
              <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} />
            </Button>
            {canCreateBucket && (
              <Button data-tour="create-bucket" onClick={() => setCreateOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                {t("empty.cta")}
              </Button>
            )}
          </div>
        </div>

        {!loading && buckets.length === 0 ? (
          <EmptyState
            icon={
              <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.5} />
            }
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              canCreateBucket ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                  {t("empty.cta")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {buckets.map((bucket) => (
              <BucketFolderCard
                key={bucket.id}
                bucket={bucket}
                href={`/${lang}/d/${companySlug}/buckets/${bucket.slug}`}
                onInfo={() => setInfoBucket(bucket)}
                t={t}
              />
            ))}
          </div>
        )}

        <CreateBucketDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={load}
          companySlug={companySlug}
        />
        <BucketInfoSheet
          bucket={infoBucket}
          onClose={() => setInfoBucket(null)}
          t={t}
        />
      </div>
    </PageTransition>
  )
}

function BucketFolderCard({
  bucket,
  href,
  onInfo,
  t,
}: {
  bucket: Bucket
  href: string
  onInfo: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const tint = bucket.isPublic
    ? {
        tab: "border-emerald-500/35 bg-emerald-500/20",
        body: "border-emerald-500/35 bg-emerald-500/10 hover:border-emerald-500/60 hover:bg-emerald-500/15",
        icon: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        badge:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      }
    : {
        tab: "border-amber-500/35 bg-amber-500/20",
        body: "border-amber-500/35 bg-amber-500/10 hover:border-amber-500/60 hover:bg-amber-500/15",
        icon: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        badge:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block">
        <Link
          href={href}
          className="group block pt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div
            className={cn(
              "ms-4 h-4 w-24 rounded-t-md border border-b-0 transition-colors",
              tint.tab,
            )}
          />
          <div
            className={cn(
              "flex min-h-40 flex-col rounded-lg border p-4 transition-colors",
              tint.body,
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-md",
                    tint.icon,
                  )}
                >
                  <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">
                    {bucket.name}
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {bucket.slug}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn("shrink-0 gap-1", tint.badge)}
              >
                <HugeiconsIcon
                  icon={bucket.isPublic ? InternetIcon : LockKeyIcon}
                  strokeWidth={2}
                  className="size-3"
                />
                {bucket.isPublic
                  ? t("visibility.public")
                  : t("visibility.private")}
              </Badge>
            </div>

            <p className="mt-4 line-clamp-2 min-h-10 text-sm text-muted-foreground">
              {bucket.description || t("folderCard.noDescription")}
            </p>

            <div className="mt-auto grid grid-cols-3 gap-2 pt-4 text-xs">
              <BucketStat
                icon={File01Icon}
                label={t("columns.files")}
                value={String(bucket.fileCount)}
              />
              <BucketStat
                icon={FolderLibraryIcon}
                label={t("columns.size")}
                value={formatBytes(bucket.storageUsed)}
              />
              <BucketStat
                icon={TimeScheduleIcon}
                label={t("columns.created")}
                value={formatDistanceToNow(new Date(bucket.createdAt), {
                  addSuffix: true,
                })}
              />
            </div>
          </div>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem onClick={onInfo}>
          <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
          {t("folderCard.info")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function BucketStat({
  icon,
  label,
  value,
}: {
  icon: typeof File01Icon
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/60 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="truncate font-medium tabular-nums">{value}</div>
    </div>
  )
}

function BucketInfoSheet({
  bucket,
  onClose,
  t,
}: {
  bucket: Bucket | null
  onClose: () => void
  t: ReturnType<typeof useTranslations>
}) {
  if (!bucket) {
    return null
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-6">
          <SheetTitle className="truncate pe-10">{bucket.name}</SheetTitle>
          <SheetDescription>{t("info.subtitle")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex items-center gap-4">
            <div
              className={cn(
                "flex size-14 items-center justify-center rounded-md",
                bucket.isPublic
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} />
            </div>
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                bucket.isPublic
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              <HugeiconsIcon
                icon={bucket.isPublic ? InternetIcon : LockKeyIcon}
                strokeWidth={2}
                className="size-3"
              />
              {bucket.isPublic
                ? t("visibility.public")
                : t("visibility.private")}
            </Badge>
          </div>
          <div className="divide-y rounded-lg border">
            <InfoRow label={t("info.slug")} value={bucket.slug} />
            <InfoRow
              label={t("info.visibility")}
              value={
                bucket.isPublic
                  ? t("visibility.public")
                  : t("visibility.private")
              }
            />
            <InfoRow label={t("columns.files")} value={String(bucket.fileCount)} />
            <InfoRow
              label={t("columns.size")}
              value={formatBytes(bucket.storageUsed)}
            />
            <InfoRow
              label={t("columns.created")}
              value={format(new Date(bucket.createdAt), "PPpp")}
            />
            <InfoRow
              label={t("info.updated")}
              value={format(new Date(bucket.updatedAt), "PPpp")}
            />
            <InfoRow
              label={t("info.description")}
              value={bucket.description || t("folderCard.noDescription")}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words font-medium">{value}</div>
    </div>
  )
}

"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "@workspace/auth/client/auth-client"
import {
  PageLoading,
  PageTransition,
} from "@workspace/console/components/shared"
import { CompanyDashboardOverview } from "@workspace/console/components/company/company-dashboard-overview"
import { CompanyFeed } from "@workspace/console/components/social/company-feed"
import { useCompanyDashboard } from "@/components/company/core-company-dashboard-shell"

/**
 * Company dashboard home — overview profile card up top, then the
 * team feed inline below. The cross-app shortcuts (mail / storage /
 * admin) used to live here as a card grid; they moved into the
 * sidebar's `Apps` group so the dashboard surface is dominated by
 * content the user actually scans (feed activity) rather than
 * navigation.
 */
export function AppPickerContent() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const params = useParams<{ "company-slug": string; lang: string }>()
  const lang = params.lang

  const dashboard = useCompanyDashboard()

  useEffect(() => {
    if (!isPending && !session) {
      router.replace(`/${lang}/login`)
    }
  }, [isPending, session, lang, router])

  if (isPending || !session) return <PageLoading />

  return (
    <PageTransition>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 py-2">
        <CompanyDashboardOverview
          lang={lang}
          profile={{
            slug: dashboard.company.slug,
            name: dashboard.company.name,
            avatarUrl: dashboard.company.avatarUrl ?? null,
            coverImageUrl: dashboard.company.coverImageUrl ?? null,
            description: dashboard.company.description ?? null,
            memberCount: dashboard.memberCount,
            canManage:
              dashboard.membership.role === "owner" ||
              dashboard.membership.role === "admin",
          }}
        />

        <div className="mx-auto w-full max-w-2xl">
          <CompanyFeed
            lang={lang}
            viewer={{
              id: session.user.id,
              name: session.user.name ?? null,
              image:
                (session.user as { image?: string | null }).image ?? null,
            }}
          />
        </div>
      </div>
    </PageTransition>
  )
}

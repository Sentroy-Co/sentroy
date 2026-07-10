import { NextRequest } from "next/server"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { companyMemberModel } from "@workspace/db/models"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const days = Number(request.nextUrl.searchParams.get("days") || "30")

  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  const sentroy = result.sentroy!
  const company = result.company as Record<string, unknown>
  const companyId = (company._id ?? company.id)?.toString() ?? ""

  const now = new Date()
  const from = new Date(now.getTime() - days * 86_400_000).toISOString()
  const prevFrom = new Date(now.getTime() - days * 2 * 86_400_000).toISOString()
  const prevTo = from

  const [statsRes, prevStatsRes, dailyRes, domainsRes, logsRes, membersCount] =
    await Promise.all([
      sentroy.statistics
        .overview({ from, to: now.toISOString() })
        .catch(() => ({ data: null })),
      sentroy.statistics
        .overview({ from: prevFrom, to: prevTo })
        .catch(() => ({ data: null })),
      sentroy.statistics.daily({ days }).catch(() => ({ data: [] })),
      sentroy.statistics.domains().catch(() => ({ data: [] })),
      sentroy.logs.list({ limit: 5, page: 1 }).catch(() => ({ data: [] })),
      companyMemberModel
        .findByCompany(companyId)
        .then((m) => m.length)
        .catch(() => 0),
    ])

  const domainsUsed = (domainsRes.data as unknown[])?.length ?? 0
  let mailboxesUsed = 0
  try {
    const mb = await sentroy.mailboxes.list()
    mailboxesUsed = mb.data?.length ?? 0
  } catch {}

  const allDomains =
    (domainsRes.data as { status: string; domain: string; id: string }[]) ?? []
  const pendingDomains = allDomains.filter((d) => d.status !== "active")

  return jsonSuccess({
    stats: statsRes.data,
    prevStats: prevStatsRes.data,
    daily: dailyRes.data ?? [],
    domains: domainsRes.data ?? [],
    recentLogs: logsRes.data ?? [],
    usage: {
      emailsSent: (company.monthlyEmailsSent as number) ?? 0,
      emailsLimit: (company.monthlyEmailLimit as number) ?? 0,
      storageUsed: (company.mailStorageUsed as number) ?? 0,
      storageLimit: (company.mailStorageLimit as number) ?? 0,
      domainsUsed,
      domainsLimit: (company.maxDomains as number) ?? 0,
      mailboxesUsed,
      mailboxesLimit: (company.maxMailboxes as number) ?? 0,
      membersUsed: membersCount,
      membersLimit: (company.maxMembers as number) ?? 0,
    },
    pendingDomains,
    company: {
      name: company.name,
      plan: null,
    },
  })
}

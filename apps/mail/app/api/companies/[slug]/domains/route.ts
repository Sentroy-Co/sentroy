export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import {
  filterAccessibleDomains,
  hasAnyDomainAccess,
  hasPermission,
} from "@workspace/auth/server/permissions"
import { domainAssignmentModel, catchAllRuleModel } from "@workspace/db/models"
import type { CompanyMember } from "@workspace/db/types"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const t0 = Date.now()

  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  console.log(`[domains:list] auth ${Date.now() - t0}ms`)

  // Access token ile erisimde permission kontrolu atlanir — token tam yetkili
  const isTokenAccess = !result.session

  const member = result.member as Pick<
    CompanyMember,
    "role" | "status" | "permissions"
  > | null
  const systemRole = (result.session?.user as { role?: string } | undefined)
    ?.role

  if (!isTokenAccess) {
    const isTeamManager = await hasPermission(
      result.session!,
      slug,
      "members.manage",
    )

    if (!hasAnyDomainAccess(member, systemRole) && !isTeamManager) {
      return jsonError("Insufficient permissions", 403)
    }
  }

  try {
    const t1 = Date.now()
    const domains = await result.sentroy!.domains.list()
    console.log(`[domains:list] sentroy.list ${Date.now() - t1}ms`)
    const filtered = isTokenAccess
      ? domains.data ?? []
      : filterAccessibleDomains(domains.data ?? [], member, systemRole)

    // Assigned + catch-all metadata join. Backend transfer sonrası company
    // kendi key'iyle assigned domain'i zaten görür → list zaten merge'li.
    // Burada UI rozet'leri için ekstra flag'leri attach ediyoruz.
    const myAssignments = await domainAssignmentModel.findByCompanyId(
      result.companyId!,
    )
    const assignedSet = new Set(
      myAssignments.map((a) => a.sentroyDomainId),
    )
    const myCatchAlls = await catchAllRuleModel.findByCompanyId(
      result.companyId!,
    )
    const catchAllByDomain = new Map(
      myCatchAlls.map((r) => [r.sentroyDomainId, r] as const),
    )

    const enriched = filtered.map((d) => {
      const ca = catchAllByDomain.get(d.id)
      return {
        ...d,
        isAssigned: assignedSet.has(d.id),
        catchAll: ca
          ? {
              targetMailboxEmail: ca.targetMailboxEmail,
              enabled: ca.enabled,
            }
          : null,
      }
    })

    return jsonSuccess(enriched)
  } catch (err: unknown) {
    const e = err as {
      statusCode?: number
      body?: { message?: string }
      message?: string
      cause?: unknown
    }
    console.error("[domains:list]", {
      slug,
      statusCode: e.statusCode,
      message: e.message,
      body: e.body,
      cause: e.cause,
    })
    const message =
      e.body?.message || e.message || "Failed to list domains"
    return jsonError(message, e.statusCode || 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: { domain?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.domain || typeof body.domain !== "string" || !body.domain.trim()) {
    return jsonError("Domain name is required")
  }

  const result = await getSentroyForCompany(request, slug, "domains.create")
  if ("error" in result && result.error) return result.error

  // Plan limiti kontrolu
  const maxDomains = (result.company as { maxDomains?: number }).maxDomains ?? 0
  if (maxDomains > 0) {
    try {
      const existing = await result.sentroy!.domains.list()
      const count = existing.data?.length ?? 0
      if (count >= maxDomains) {
        return jsonError(
          `Domain limit reached (${count}/${maxDomains})`,
          403,
        )
      }
    } catch {}
  }

  try {
    const created = await result.sentroy!.domains.create({
      domain: body.domain.trim(),
    })
    return jsonSuccess(created.data, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create domain"
    return jsonError(message, 500)
  }
}

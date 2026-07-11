export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import {
  companyModel,
  domainAssignmentModel,
  catchAllRuleModel,
} from "@workspace/db/models"
import { getSystemSentroyClient } from "@/lib/system-mail"

/**
 * Admin domain list — her domain için `assignment` (varsa hangi company'e
 * atanmış) + `catchAll` (varsa hangi mailbox'a yönlendiriliyor) join'i
 * dahil. UI'da rozet + reassign / unassign butonları için lazım.
 *
 * NOT: Reassign sonrası system company'nin API key'i artık atanmış
 * domain'i list'te göremez (backend transfer DKIM dahil owner değişimi
 * yapıyor). Bu yüzden assignment row'larını ayrı olarak `domainAssignmentModel.listAll`
 * üzerinden çekiyoruz ve target company'nin API key'iyle her assigned
 * domain'i tek tek `get` ediyoruz, sonra system listesiyle merge ediyoruz.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const systemSentroy = await getSystemSentroyClient(session.user.id)
  const [systemDomainsRes, assignments] = await Promise.all([
    systemSentroy.domains.list(),
    domainAssignmentModel.listAll(),
  ])

  const systemDomains = systemDomainsRes.data ?? []
  const systemDomainIds = new Set(systemDomains.map((d) => d.id))

  // Atanmış olup system listesinde görünmeyen domain'leri target company
  // key'i ile fetch et (paralel). Backend transfer sonrası system bu
  // domain'i artık göremiyor — UI'da kaybolmasın.
  type Sentroy = typeof systemSentroy
  const orphanFetches = await Promise.all(
    assignments
      .filter((a) => !systemDomainIds.has(a.sentroyDomainId))
      .map(async (a) => {
        try {
          const owner = await companyModel.findById(a.ownerCompanyId)
          if (!owner?.sentroyApiKey) return null
          const { SentroyClient } = await import("@sentroy-co/sdk")
          const base = (
            process.env.NEXT_PUBLIC_SENTROY_API_URL ||
            "http://localhost:3000/api/v1"
          ).replace(/\/api\/v\d+\/?$/, "")
          const targetClient = new SentroyClient({
            baseUrl: base,
            apiKey: owner.sentroyApiKey,
          }) as unknown as Sentroy
          const dRes = await targetClient.domains.get(a.sentroyDomainId)
          return dRes.data ?? null
        } catch {
          return null
        }
      }),
  )

  const allDomains = [
    ...systemDomains,
    ...orphanFetches.filter((d): d is NonNullable<typeof d> => d !== null),
  ]

  // Assignment + catchAll join. Catch-all rule lookup tek tek;
  // domain sayısı küçük (admin paneli, <50 domain pratik) o yüzden
  // promise.all yeterli.
  const enriched = await Promise.all(
    allDomains.map(async (d) => {
      const assignment = assignments.find((a) => a.sentroyDomainId === d.id)
      let assignmentInfo: {
        ownerCompanyId: string
        ownerCompanyName: string
        ownerCompanySlug: string
        assignedAt: Date
      } | null = null
      if (assignment) {
        const owner = await companyModel.findById(assignment.ownerCompanyId)
        if (owner) {
          assignmentInfo = {
            ownerCompanyId: owner.id,
            ownerCompanyName: owner.name,
            ownerCompanySlug: owner.slug,
            assignedAt: assignment.assignedAt,
          }
        }
      }

      const catchAll = await catchAllRuleModel.findByDomainId(d.id)
      return {
        ...d,
        assignment: assignmentInfo,
        catchAll: catchAll
          ? {
              targetMailboxEmail: catchAll.targetMailboxEmail,
              enabled: catchAll.enabled,
            }
          : null,
      }
    }),
  )

  return jsonSuccess(enriched)
}

export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  let body: { domain?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (!body.domain || typeof body.domain !== "string") {
    return jsonError("domain is required")
  }

  try {
    const sentroy = await getSystemSentroyClient(session.user.id)
    const res = await sentroy.domains.create({ domain: body.domain.trim() })
    return jsonSuccess(res.data, 201)
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to create domain",
      502,
    )
  }
}

import { NextRequest } from "next/server"
import { SentroyClient, SentroyHttpError } from "@sentroy-co/sdk"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import {
  companyModel,
  domainAssignmentModel,
  catchAllRuleModel,
  mailTemplateSourceModel,
  mailTemplateThumbnailModel,
  auditLogModel,
} from "@workspace/db/models"
import { SYSTEM_COMPANY_SLUG } from "@workspace/db/constants"
import { getSystemSentroyClient } from "@/lib/system-mail"

/**
 * Admin endpoint: system domain'i bir user-tarafı company'e atar veya
 * mevcut atamayı başka company'e devreder.
 *
 * Backend tarafı (Sentroy mail server v1.0.14):
 *   - `domains.transfer(id, { companyId })` SDK method'u domain'in
 *     ownership'ini hedefe geçirir. DKIM key korunur, DNS değişmez.
 *
 * DB tarafı:
 *   - `domainAssignmentModel.upsertAssignment` ile mapping yazılır.
 *   - Reassign'da: önceki sahibin catch-all rule'u (varsa) silinir;
 *     mailTemplateSource / mailTemplateThumbnail kayıtlarındaki companyId
 *     yeni sahibe taşınır (DB'de filter `companyId === X` ile çalıştığı
 *     için yeni sahibin template'leri görmesi şart).
 *   - Audit log yazılır.
 *
 * Sentroy backend transfer'i fail ederse DB'ye dokunulmaz; "DB'de assigned
 * ama backend hâlâ system'in" tutarsızlığı çıkmasın.
 */

const SENTROY_BASE = (
  process.env.NEXT_PUBLIC_SENTROY_API_URL || "http://localhost:3000/api/v1"
).replace(/\/api\/v\d+\/?$/, "")

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id: sentroyDomainId } = await params

  let body: { ownerCompanyId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.ownerCompanyId || typeof body.ownerCompanyId !== "string") {
    return jsonError("ownerCompanyId is required")
  }

  const target = await companyModel.findById(body.ownerCompanyId)
  if (!target) return jsonError("Target company not found", 404)
  if (target.slug === SYSTEM_COMPANY_SLUG) {
    return jsonError("Cannot assign domain to the system company itself")
  }
  if (!target.sentroyApiKey) {
    return jsonError(
      "Target company has no Sentroy API key — provision required first",
      409,
    )
  }

  // Domain validate (system'de var mı + cache name)
  let domainName: string
  try {
    const sentroy = await getSystemSentroyClient(session.user.id)
    const dRes = await sentroy.domains.get(sentroyDomainId)
    if (!dRes.data?.domain) return jsonError("Domain not found", 404)
    domainName = dRes.data.domain
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Failed to read domain",
      502,
    )
  }

  const existingAssignment = await domainAssignmentModel.findByDomainId(
    sentroyDomainId,
  )

  // Backend transfer — system company'nin API key'iyle çağrılır.
  const systemCompany = await companyModel.findBySlug(SYSTEM_COMPANY_SLUG)
  if (!systemCompany?.sentroyApiKey) {
    return jsonError("System company not provisioned", 500)
  }

  // Reassign senaryosunda mevcut sahip system değil; kendisinin key'iyle
  // transfer çağırırız (kim domain'i görüyorsa o transfer edebilir).
  const transferKey = existingAssignment
    ? (await companyModel.findById(existingAssignment.ownerCompanyId))
        ?.sentroyApiKey
    : systemCompany.sentroyApiKey

  if (!transferKey) {
    return jsonError(
      "Cannot resolve transfer API key — current owner missing key",
      500,
    )
  }

  try {
    const transferClient = new SentroyClient({
      baseUrl: SENTROY_BASE,
      apiKey: transferKey,
    })
    await transferClient.domains.transfer(sentroyDomainId, {
      companyId: body.ownerCompanyId,
    })
  } catch (err) {
    if (err instanceof SentroyHttpError) {
      return jsonError(
        `Backend transfer failed (${err.statusCode}): ${err.message}`,
        502,
      )
    }
    return jsonError(
      err instanceof Error ? err.message : "Backend transfer failed",
      502,
    )
  }

  // DB tarafı — assignment yaz
  const assignment = await domainAssignmentModel.upsertAssignment({
    sentroyDomainId,
    domainName,
    ownerCompanyId: body.ownerCompanyId,
    assignedBy: session.user.id,
  })

  // Reassign cleanup
  if (existingAssignment) {
    const prevOwnerId = existingAssignment.ownerCompanyId
    if (prevOwnerId !== body.ownerCompanyId) {
      // Önceki sahibin domain'e ait catch-all rule'u temizle
      await catchAllRuleModel.removeByDomainId(sentroyDomainId).catch(() => {})

      // Domain'in template'lerini list edip companyId'yi yeni sahibe taşı.
      // Yeni sahibin key'iyle list — transfer sonrası bu key'in görme
      // hakkı oluşur.
      await migrateDomainTemplates(
        target.sentroyApiKey!,
        sentroyDomainId,
        prevOwnerId,
        body.ownerCompanyId,
      ).catch((e) => {
        console.warn("[assign] template migration failed:", e)
      })
    }
  }

  await auditLogModel
    .insert({
      userId: session.user.id,
      companyId: body.ownerCompanyId,
      action: "domain.assigned",
      resource: "domain",
      resourceId: sentroyDomainId,
      details: {
        domainName,
        previousOwnerCompanyId: existingAssignment?.ownerCompanyId ?? null,
      },
    })
    .catch(() => {})

  return jsonSuccess(assignment)
}

/**
 * Atamayı kaldırır — domain backend'de yeniden system company'e devredilir.
 * DB'deki assignment row + catch-all rule silinir; template kayıtları olduğu
 * yerde kalır (yeni sahip yok ki taşınsın). Admin domain'i tekrar assign
 * ederse, o sırada o template'ler eski sahibin DB'sinde duruyor olur — yeni
 * sahip kendi template'lerini sıfırdan yaratır veya admin manual müdahale.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)

  const { id: sentroyDomainId } = await params

  const existing = await domainAssignmentModel.findByDomainId(sentroyDomainId)
  if (!existing) return jsonError("Domain is not assigned", 404)

  const systemCompany = await companyModel.findBySlug(SYSTEM_COMPANY_SLUG)
  if (!systemCompany?.id) {
    return jsonError("System company not found", 500)
  }

  const currentOwner = await companyModel.findById(existing.ownerCompanyId)
  if (!currentOwner?.sentroyApiKey) {
    return jsonError(
      "Current owner company missing API key — cannot transfer back",
      500,
    )
  }

  try {
    const ownerClient = new SentroyClient({
      baseUrl: SENTROY_BASE,
      apiKey: currentOwner.sentroyApiKey,
    })
    await ownerClient.domains.transfer(sentroyDomainId, {
      companyId: systemCompany.id,
    })
  } catch (err) {
    if (err instanceof SentroyHttpError) {
      return jsonError(
        `Backend transfer failed (${err.statusCode}): ${err.message}`,
        502,
      )
    }
    return jsonError(
      err instanceof Error ? err.message : "Backend transfer failed",
      502,
    )
  }

  await domainAssignmentModel.removeByDomainId(sentroyDomainId)
  await catchAllRuleModel.removeByDomainId(sentroyDomainId).catch(() => {})

  await auditLogModel
    .insert({
      userId: session.user.id,
      companyId: existing.ownerCompanyId,
      action: "domain.unassigned",
      resource: "domain",
      resourceId: sentroyDomainId,
      details: { domainName: existing.domainName },
    })
    .catch(() => {})

  return jsonSuccess({ message: "Unassigned" })
}

async function migrateDomainTemplates(
  targetApiKey: string,
  sentroyDomainId: string,
  fromCompanyId: string,
  toCompanyId: string,
): Promise<void> {
  const sentroy = new SentroyClient({
    baseUrl: SENTROY_BASE,
    apiKey: targetApiKey,
  })
  const tplRes = await sentroy.templates.list({ domainId: sentroyDomainId })
  const templates = tplRes.data ?? []
  const ids = templates.map((t) => t.id)
  if (ids.length === 0) return

  await mailTemplateSourceModel.reassignTemplates(
    ids,
    fromCompanyId,
    toCompanyId,
  )
  await mailTemplateThumbnailModel.reassignTemplates(
    ids,
    fromCompanyId,
    toCompanyId,
  )
}

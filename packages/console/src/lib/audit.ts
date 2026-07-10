import { getDb } from "@workspace/db/client"
import type { AuditLog } from "@workspace/db/types"

interface AuditParams {
  userId: string
  companyId?: string
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  /** Header'dan IP çıkarmak için convenience — request varsa
   *  cf-connecting-ip / x-forwarded-for / x-real-ip sırayla denenir. */
  request?: { headers: Headers } | null
}

function extractIp(request: { headers: Headers } | null | undefined): string | undefined {
  if (!request) return undefined
  const h = request.headers
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    undefined
  )
}

/** Audit insert — fail-bypass; error sadece log'lanır, ana akışı kırmaz. */
export async function audit(params: AuditParams): Promise<void> {
  try {
    const db = await getDb()
    await db.collection("audit_logs").insertOne({
      userId: params.userId,
      companyId: params.companyId,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      details: params.details ?? {},
      ipAddress: params.ipAddress ?? extractIp(params.request),
      createdAt: new Date(),
    })
  } catch (err) {
    console.warn("[audit] insert failed:", err)
  }
}

/**
 * Company timeline'i — settings sayfasındaki audit log card'ı için.
 * Member listesini lookup edip user.email/name dahil eden enrichment burada
 * yapılır ki UI tarafı tek fetch ile renderable olsun.
 */
export async function listCompanyAudit(
  companyId: string,
  opts: { limit?: number; skip?: number } = {},
): Promise<
  Array<
    AuditLog & {
      user: { name: string | null; email: string | null } | null
    }
  >
> {
  const db = await getDb()
  const docs = await db
    .collection("audit_logs")
    .find({ companyId })
    .sort({ createdAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 100)
    .toArray()

  if (docs.length === 0) return []

  // user lookup — distinct userIds toplu çek
  const userIds = Array.from(
    new Set(docs.map((d) => d.userId).filter(Boolean)),
  )
  const { ObjectId } = await import("mongodb")
  const users = await db
    .collection("user")
    .find({
      _id: {
        $in: userIds
          .filter((id) => ObjectId.isValid(id as string))
          .map((id) => new ObjectId(id as string)),
      },
    })
    .project({ name: 1, email: 1 })
    .toArray()
  const userMap = new Map(
    users.map((u) => [
      u._id.toString(),
      { name: (u.name as string) ?? null, email: (u.email as string) ?? null },
    ]),
  )

  return docs.map((d) => ({
    id: d._id.toString(),
    userId: d.userId as string,
    companyId: d.companyId as string | undefined,
    action: d.action as string,
    resource: d.resource as string,
    resourceId: d.resourceId as string | undefined,
    details: (d.details ?? {}) as Record<string, unknown>,
    ipAddress: (d.ipAddress as string | undefined) ?? undefined,
    createdAt: d.createdAt as Date,
    user: userMap.get(d.userId as string) ?? null,
  }))
}

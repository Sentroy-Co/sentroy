import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { linearPushSubscriptionModel } from "@workspace/db/models"
import { getLinearContext } from "@/lib/linear/context"
import { findLinearUserByEmail } from "@/lib/linear/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Web Push aboneliği (per-user, per-tarayıcı). POST → kaydet/güncelle, DELETE →
 * kaldır. linear.view yeter (okuyabilen herkes bildirim alabilir). Abonelik
 * anında kullanıcının Linear user id'si (varsa) çözülür → dispatch hedeflemesi.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  } | null
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return jsonError("Invalid subscription", 400)
  }

  const email = access.session?.user.email ?? access.callerEmail ?? null
  let linearUserId: string | null = null
  if (email) {
    const ctx = await getLinearContext(access.companyId).catch(() => null)
    if (ctx) {
      const user = await findLinearUserByEmail(ctx, email).catch(() => null)
      linearUserId = user?.id ?? null
    }
  }

  await linearPushSubscriptionModel.upsertByEndpoint({
    companyId: access.companyId,
    userId: access.callerUserId,
    linearUserId,
    endpoint,
    p256dh,
    auth,
  })

  return jsonSuccess({ subscribed: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string
  } | null
  if (body?.endpoint) {
    await linearPushSubscriptionModel.deleteByEndpoint(body.endpoint)
  }
  return jsonSuccess({ subscribed: false })
}

import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { mailPushEventModel } from "@workspace/db/models"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Kullanıcının son yeni-mail sinyalleri — Sentroy OS'un masaüstü (Electron)
 * uygulaması bunu poll'layıp native bildirim gösterir (VAPID Electron'da
 * çalışmadığından). `since` = ms epoch; verilmezse son 60 sn. Kayıtlar TTL ile
 * 10 dk sonra silinir (bkz. mail-push-event model).
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session?.user?.id) return jsonError("Unauthorized", 401)

  const raw = request.nextUrl.searchParams.get("since")
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  const since = Number.isFinite(parsed) ? parsed : Date.now() - 60_000

  const events = await mailPushEventModel.findRecentForUser(session.user.id, since)
  return jsonSuccess({ events })
}

export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getLinearSettings } from "@/lib/settings"
import {
  listSeenUsers,
  purgeSeenUsers,
  resolveOperators,
} from "@/lib/telegram/store"

/**
 * Operatör keşfi (dinleme modu) — görülen kullanıcı listesi (linear.manage).
 * Settings UI keşif penceresi aktifken 5 sn'de bir poll'lar; listeden seçilen
 * kullanıcı PUT /linear-settings `telegram.operators` ile eklenir.
 *
 * KVKK: kayıtlarda mesaj içeriği YOKTUR (yalnız kimlik) ve saklama kısadır —
 * her çağrıda 15 dk'yı geçen kayıtlar global temizlenir; discovery kapanınca
 * PUT şirketin tüm kayıtlarını siler.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.manage")
  if ("error" in access) return access.error

  // Süresi geçen kayıtları buda (lazy — poll zaten periyodik geliyor).
  await purgeSeenUsers().catch(() => {})

  const settings = await getLinearSettings(access.companyId)
  const telegram = settings?.telegram ?? null
  const until = telegram?.discovery?.activeUntil
    ? new Date(telegram.discovery.activeUntil)
    : null
  const active = Boolean(until && until.getTime() > Date.now())

  const seen = active
    ? await listSeenUsers(access.companyId, resolveOperators(telegram))
    : []

  return jsonSuccess({
    discoveryActive: active,
    discoveryActiveUntil: active && until ? until.toISOString() : null,
    seen: seen.map((s) => ({
      tgUserId: s.tgUserId,
      tgUsername: s.tgUsername,
      tgDisplayName: s.tgDisplayName,
      lastSeenAt: s.lastSeenAt.toISOString(),
    })),
  })
}

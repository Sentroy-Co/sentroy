import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { ObjectId } from "mongodb"
import { auth } from "@workspace/auth/server/auth"
import { hasPermission } from "@workspace/auth/server/permissions"
import { getDb } from "@workspace/db/client"
import { isVaultConfigured } from "@workspace/console/lib/env-vault-crypto"
import { getLinearSettings, resolveUiFlags } from "@/lib/settings"
import { getLinearContext } from "@/lib/linear/context"
import { getTeams } from "@/lib/linear/metadata"
import { linearWebhookEndpoint } from "@/lib/linear/webhooks"
import { resolveOperators } from "@/lib/telegram/store"
import { normalizeBotLang } from "@/lib/telegram/messages"
import {
  LinearSettingsContent,
  type LinearSettingsData,
  type MemberOption,
  type TeamOption,
} from "@/components/settings/linear-settings-content"

/**
 * Linear Ayarları — bağlantı (API key), webhook, depolama sağlayıcısı ve
 * görünüm flag'leri. Yalnız linear.manage yetkisi olanlara (RouteGuard
 * client-side UX katmanı; buradaki kontrol server-side gerçek kapı,
 * API route'ları da ayrıca kendi kontrolünü yapar).
 *
 * Secret'lar client'a ASLA inmez — yalnız prefix'ler (ilk 12 char).
 */
export default async function LinearSettingsPage({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug } = await params
  const headersList = await headers()

  const session = await auth.api.getSession({ headers: headersList })
  if (!session) notFound()

  const allowed = await hasPermission(session, slug, "linear.manage")
  if (!allowed) notFound()

  const db = await getDb()
  const company = await db.collection("companies").findOne({ slug })
  if (!company) notFound()
  const companyId = company._id.toString()

  const settings = await getLinearSettings(companyId).catch(() => null)

  // Bağlıysa takım listesi (defaultTeamId Select'i için). Linear API'ye
  // ulaşılamazsa sayfayı düşürme — boş listeyle devam.
  const ctx = await getLinearContext(companyId).catch(() => null)
  const teams: TeamOption[] = ctx
    ? await getTeams(ctx)
        .then((list) => list.map((t) => ({ id: t.id, key: t.key, name: t.name })))
        .catch(() => [])
    : []

  const data: LinearSettingsData = {
    connected: Boolean(settings?.apiKeyCipher),
    apiKeyPrefix: settings?.apiKeyPrefix ?? null,
    panelLabelName: settings?.panelLabelName || "Linear Lite",
    defaultTeamId: settings?.defaultTeamId ?? null,
    defaultLabelName: settings?.defaultLabelName ?? null,
    defaultStateName: settings?.defaultStateName ?? null,
    actorApp: settings?.actorApp ?? false,
    storageProvider: settings?.storageProvider ?? "linear",
    sentroyApiKeyPrefix: settings?.sentroyApiKeyPrefix ?? null,
    sentroyBucketId: settings?.sentroyBucketId ?? null,
    sentroyCompanySlug: settings?.sentroyCompanySlug ?? null,
    sentroyBaseUrl: settings?.sentroyBaseUrl ?? null,
    uiFlags: resolveUiFlags(settings?.uiFlags),
    webhookId: settings?.webhookId ?? null,
    lastWebhookAt: settings?.lastWebhookAt
      ? new Date(settings.lastWebhookAt).toISOString()
      : null,
    webhookEndpoint: linearWebhookEndpoint(companyId),
    vaultConfigured: isVaultConfigured(),
    // Telegram bot — token asla plaintext inmez, yalnız son 4 karakter.
    telegram: {
      enabled: settings?.telegram?.enabled ?? false,
      botTokenLast4: settings?.telegram?.botTokenLast4 ?? null,
      operators: resolveOperators(settings?.telegram),
      defaultTeamId: settings?.telegram?.defaultTeamId ?? null,
      language: normalizeBotLang(settings?.telegram?.language),
      lastPolledAt: settings?.telegram?.lastPolledAt
        ? new Date(settings.telegram.lastPolledAt).toISOString()
        : null,
      discoveryActiveUntil:
        settings?.telegram?.discovery?.activeUntil &&
        new Date(settings.telegram.discovery.activeUntil).getTime() > Date.now()
          ? new Date(settings.telegram.discovery.activeUntil).toISOString()
          : null,
    },
  }

  // Şirket üyeleri (operatör ↔ kullanıcı eşleme Select'i için) — aktif üyeler
  // + better-auth user dokümanlarından ad/e-posta. Hata sayfayı düşürmez.
  let members: MemberOption[] = []
  try {
    const memberDocs = await db
      .collection("company_members")
      .find({ companyId, status: "active" }, { projection: { userId: 1 } })
      .toArray()
    const userIds = memberDocs
      .map((m) => {
        try {
          return new ObjectId(m.userId as string)
        } catch {
          return null
        }
      })
      .filter((id): id is ObjectId => id !== null)
    if (userIds.length > 0) {
      const users = await db
        .collection("user")
        .find({ _id: { $in: userIds } }, { projection: { name: 1, email: 1 } })
        .toArray()
      members = users.map((u) => ({
        userId: u._id.toString(),
        name: (u.name as string | undefined) ?? "",
        email: (u.email as string | undefined) ?? "",
      }))
    }
  } catch {
    members = []
  }

  return <LinearSettingsContent settings={data} teams={teams} members={members} />
}

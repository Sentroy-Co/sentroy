/**
 * LinearContext — servis katmanının tamamına ilk parametre olarak geçen,
 * şirket bazlı Linear bağlantı bağlamı (PLAN §4).
 *
 * Triage tek workspace'ti (env LINEAR_API_KEY); Linear Lite'ta her şirket
 * kendi workspace'ini bağlar. `lib/linear/*` ve `lib/*` servis fonksiyonları
 * bu ctx üzerinden API key + panel konfigürasyonuna erişir; cache key'leri
 * `ctx.companyId` ile prefix'lenir (tenant izolasyonu).
 */

import { getLinearSettings, safeDecrypt } from "../settings"

export interface LinearContext {
  companyId: string
  apiKey: string
  panelLabelName: string
  defaultTeamId: string | null
  defaultLabelName: string | null
  defaultStateName: string | null
  actorApp: boolean
}

/**
 * Şirketin Linear bağlamını çözer. API key kayıtlı değilse ya da decrypt
 * edilemiyorsa `null` döner — route'lar bu durumda 412 "not_connected"
 * cevabı verir, UI `<NotConnected />` CTA'sını gösterir.
 */
export async function getLinearContext(
  companyId: string,
): Promise<LinearContext | null> {
  const settings = await getLinearSettings(companyId)
  if (!settings) return null

  const apiKey = safeDecrypt(settings.apiKeyCipher)
  if (!apiKey) return null

  return {
    companyId,
    apiKey,
    panelLabelName: settings.panelLabelName || "Linear Lite",
    defaultTeamId: settings.defaultTeamId ?? null,
    defaultLabelName: settings.defaultLabelName ?? null,
    defaultStateName: settings.defaultStateName ?? null,
    actorApp: settings.actorApp ?? false,
  }
}

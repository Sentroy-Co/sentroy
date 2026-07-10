import {
  statusIncidentModel,
  statusComponentModel,
  statusProbeEventModel,
} from "@workspace/db/models"
import type { StatusCheck } from "@workspace/db/models/status-check"

/**
 * Auto-incident — sustained failure / sustained recovery'de incident
 * yönetimi.
 *
 * Open: bir check 3+ ardışık down olduğunda ve aynı check için açık
 *   (resolved değil) auto incident yoksa, yeni incident yarat.
 *
 * Update: aynı check zaten açık incident'a sahipse, mevcudu güncelle —
 *   şimdilik yeni timeline update yazmıyoruz (UI/user controlled), sadece
 *   var olduğunu kabul edip duplicate açma.
 *
 * Auto-resolve: 30dk operational (her probe interval'de açık incident
 *   için son 30dk içindeki tüm probe'lar operational mı kontrol et;
 *   evetse "resolved" status'a geçir + timeline update ekle).
 */

const SUSTAINED_FAILURE_THRESHOLD = 3
const AUTO_RESOLVE_OPERATIONAL_WINDOW_MS = 30 * 60 * 1000

function probeTarget(check: StatusCheck): string {
  if (check.type === "tcp" && check.tcp) {
    return `${check.tcp.host}:${check.tcp.port}`
  }
  return check.http.url
}

export async function maybeOpenAutoIncident(
  check: StatusCheck,
  consecutiveFailures: number,
): Promise<{ opened: boolean; incidentId?: string }> {
  if (consecutiveFailures < SUSTAINED_FAILURE_THRESHOLD) {
    return { opened: false }
  }

  // Bu check için zaten açık auto incident varsa skip
  const existing = await statusIncidentModel.findOpenAutoForCheck(check.id)
  if (existing) return { opened: false, incidentId: existing.id }

  const component = await statusComponentModel.findById(check.componentId)
  if (!component) return { opened: false }

  const incident = await statusIncidentModel.create({
    pageId: check.pageId,
    title: {
      tr: `${component.name} — ${check.name} çevrimdışı`,
      en: `${component.name} — ${check.name} is down`,
    },
    initialStatus: "investigating",
    impact: "major",
    affectedComponentIds: [check.componentId],
    source: "auto",
    detectedByCheckId: check.id,
    initialUpdate: {
      body: {
        tr: `Otomatik tespit: \`${probeTarget(check)}\` için ${consecutiveFailures} ardışık başarısız probe. İnceleme sürüyor.`,
        en: `Automated detection: ${consecutiveFailures} consecutive failed probes on \`${probeTarget(check)}\`. Investigation pending.`,
      },
      authorId: null,
      authorName: "Sentroy Status Worker",
    },
    createdBy: "system",
  })

  return { opened: true, incidentId: incident.id }
}

/**
 * Bir check için açık auto incident varsa + son 30dk içindeki tüm
 * probe'ları operational ise resolve et.
 */
export async function maybeAutoResolveIncident(
  check: StatusCheck,
): Promise<{ resolved: boolean }> {
  const existing = await statusIncidentModel.findOpenAutoForCheck(check.id)
  if (!existing) return { resolved: false }

  const now = new Date()
  const windowStart = new Date(now.getTime() - AUTO_RESOLVE_OPERATIONAL_WINDOW_MS)
  const events = await statusProbeEventModel.findRange(
    check.id,
    windowStart,
    now,
  )
  // 30dk içinde hiç event yoksa erken (henüz pencere dolmadı)
  if (events.length === 0) return { resolved: false }
  if (events.some((e) => e.status !== "operational")) return { resolved: false }

  const windowMinutes = Math.floor(AUTO_RESOLVE_OPERATIONAL_WINDOW_MS / 60000)
  await statusIncidentModel.appendUpdate(existing.id, {
    status: "resolved",
    body: {
      tr: `Servis ${windowMinutes} dakikadır operasyonel. Olay otomatik kapatıldı.`,
      en: `Service has been operational for ${windowMinutes} minutes. Incident auto-resolved.`,
    },
    authorId: null,
    authorName: "Sentroy Status Worker",
  })

  return { resolved: true }
}

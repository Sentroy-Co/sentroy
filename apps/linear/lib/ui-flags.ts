/**
 * UI feature flag tipleri + varsayılanlar — hem server (lib/settings.ts)
 * hem client (lib/ui-flags-context.tsx) tarafından import edilir; bu yüzden
 * "use client" direktifi YOK (düz modül).
 *
 * Triage'daki env-tabanlı flag sistemi Linear Lite'ta DB-only'ye indirgendi:
 * varsayılan hepsi `true`, şirket bazlı kısmi override `linear_settings.uiFlags`
 * dokümanından gelir.
 */

export type UiFlags = {
  showStatus: boolean
  showAssignee: boolean
  showLabels: boolean
  showLinkedIssues: boolean
  showTeamPicker: boolean
  showArchive: boolean
  kanbanDnd: boolean
  kanbanQuickAdd: boolean
  listDnd: boolean
  // Panel görünüm modları (default false — açıkça aç)
  /** Panel'de talepleri takım-takım ayrı görme (Overview'de takım sekmeleri). */
  groupByTeam: boolean
  /** Yalnız panelden açılan değil, workspace'teki TÜM Linear issue'larını göster. */
  showAllIssues: boolean
  // Masaüstü bildirim kapsamı
  notifyCompleted: boolean
  notifyAssigned: boolean
  notifyCreated: boolean
  notifyComment: boolean
}

export const DEFAULT_UI_FLAGS: UiFlags = {
  showStatus: true,
  showAssignee: true,
  showLabels: true,
  showLinkedIssues: true,
  showTeamPicker: true,
  showArchive: true,
  kanbanDnd: true,
  kanbanQuickAdd: true,
  listDnd: true,
  groupByTeam: false,
  showAllIssues: false,
  notifyCompleted: true,
  notifyAssigned: true,
  notifyCreated: true,
  notifyComment: true,
}

export const UI_FLAG_KEYS = Object.keys(DEFAULT_UI_FLAGS) as (keyof UiFlags)[]

import {
  InboxIcon,
  SentIcon,
  TextCreationIcon,
  UserGroupIcon,
  MailValidation01Icon,
  InternetIcon,
  Mailbox01Icon,
  File01Icon,
  AnalyticsUpIcon,
  WebhookIcon,
  ShieldBanIcon,
  Analytics01Icon,
  FolderLibraryIcon,
  DashboardSquare01Icon,
  Key01Icon,
  ShieldUserIcon,
  BubbleChatIcon,
  TaskAdd01Icon,
  ChartLineData01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import type { SectionConfig } from "./app-section-panel"

/**
 * Mail/Storage OS panellerinin bölüm tanımları. `perm` = ROUTE_PERMISSIONS
 * segment'i (canAccessRoute ile gate) — app sidebar'larıyla aynı yetki sistemi.
 * Label'lar os.appSections.<labelKey>.
 */

export const MAIL_SECTIONS: SectionConfig[] = [
  { id: "inbox", slug: "inbox", perm: "inbox", labelKey: "inbox", icon: InboxIcon, color: "#3b82f6", requiresDomain: true },
  { id: "send", slug: "send", perm: "send", labelKey: "send", icon: SentIcon, color: "#06b6d4", requiresDomain: true },
  { id: "templates", slug: "templates", perm: "templates", labelKey: "templates", icon: TextCreationIcon, color: "#a855f7", requiresDomain: true },
  { id: "audience", slug: "audience", perm: "audience", labelKey: "audience", icon: UserGroupIcon, color: "#ec4899", requiresDomain: true },
  { id: "validate", slug: "validate", perm: "validate", labelKey: "validate", icon: MailValidation01Icon, color: "#22c55e", requiresDomain: true },
  { id: "analytics", slug: "analytics", perm: "analytics", labelKey: "analytics", icon: AnalyticsUpIcon, color: "#10b981", requiresDomain: true },
  { id: "domains", slug: "domains", perm: "domains", labelKey: "domains", icon: InternetIcon, color: "#0ea5e9", groupKey: "groupAdmin" },
  { id: "mailboxes", slug: "mailboxes", perm: "mailboxes", labelKey: "mailboxes", icon: Mailbox01Icon, color: "#f59e0b", groupKey: "groupAdmin", requiresDomain: true },
  { id: "logs", slug: "logs", perm: "logs", labelKey: "logs", icon: File01Icon, color: "#64748b", groupKey: "groupAdmin", requiresDomain: true },
  { id: "webhooks", slug: "webhooks", perm: "webhooks", labelKey: "webhooks", icon: WebhookIcon, color: "#8b5cf6", groupKey: "groupAdmin", requiresDomain: true },
  { id: "suppressions", slug: "suppressions", perm: "suppressions", labelKey: "suppressions", icon: ShieldBanIcon, color: "#ef4444", groupKey: "groupAdmin", requiresDomain: true },
  // SMTP kaldırıldı — sayfa domains'e redirect (deprecated; creds domain detay sheet'inde).
  // Ayarlar / Ekip / Erişim Tokenları company-level → OS System Settings penceresine taşındı (app sidebar'ında değil).
]

export const AUTH_SECTIONS: SectionConfig[] = [
  { id: "overview", slug: "", perm: "", labelKey: "overview", icon: DashboardSquare01Icon, color: "#64748b" },
  { id: "oauth-clients", slug: "oauth-clients", perm: "oauth-clients", labelKey: "oauthClients", icon: Key01Icon, color: "#f59e0b" },
  { id: "auth-projects", slug: "auth-projects", perm: "auth-projects", labelKey: "authProjects", icon: ShieldUserIcon, color: "#10b981" },
]

export const STORAGE_SECTIONS: SectionConfig[] = [
  { id: "usage", slug: "usage", perm: "usage", labelKey: "usage", icon: Analytics01Icon, color: "#06b6d4" },
  { id: "buckets", slug: "buckets", perm: "buckets", labelKey: "buckets", icon: FolderLibraryIcon, color: "#a855f7" },
  // Ayarlar / Ekip / Erişim Tokenları → OS System Settings penceresine taşındı.
]

// WhatsApp Santral — perm "" (herkese açık; gerçek yetki API tarafında
// whatsapp.view/send/manage ile enforce edilir). Overview app kökü (slug "").
export const WHATSAPP_SECTIONS: SectionConfig[] = [
  { id: "overview", slug: "", perm: "", labelKey: "overview", icon: DashboardSquare01Icon, color: "#25d366" },
  { id: "chats", slug: "chats", perm: "", labelKey: "chats", icon: BubbleChatIcon, color: "#25d366" },
  { id: "templates", slug: "templates", perm: "", labelKey: "templates", icon: TextCreationIcon, color: "#a855f7" },
  { id: "audiences", slug: "audiences", perm: "", labelKey: "audience", icon: UserGroupIcon, color: "#ec4899" },
  { id: "logs", slug: "logs", perm: "", labelKey: "logs", icon: File01Icon, color: "#64748b" },
]

// Linear Lite — perm "" (herkese açık; gerçek yetki API tarafında
// linear.view/edit/manage ile enforce edilir). Panel app kökü (slug "").
export const LINEAR_SECTIONS: SectionConfig[] = [
  { id: "overview", slug: "", perm: "", labelKey: "overview", icon: DashboardSquare01Icon, color: "#5E6AD2" },
  { id: "requests", slug: "requests", perm: "", labelKey: "requests", icon: InboxIcon, color: "#0ea5e9" },
  { id: "new", slug: "tasks/new", perm: "", labelKey: "newTask", icon: TaskAdd01Icon, color: "#10b981" },
  // Yönetim — admin/linear.manage dışındakiler görmez (ROUTE_PERMISSIONS gate).
  { id: "metrics", slug: "metrics", perm: "metrics", labelKey: "metrics", icon: ChartLineData01Icon, color: "#f59e0b", groupKey: "groupAdmin" },
  { id: "settings", slug: "linear-settings", perm: "linear-settings", labelKey: "linearSettings", icon: Settings01Icon, color: "#64748b", groupKey: "groupAdmin" },
]

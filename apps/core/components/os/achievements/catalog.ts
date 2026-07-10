import {
  ShieldKeyIcon,
  Mail01Icon,
  FolderLibraryIcon,
  Message01Icon,
  KanbanIcon,
  ShieldUserIcon,
  HeadphonesIcon,
  UserAdd01Icon,
  Key01Icon,
  ImageAdd01Icon,
  PencilEdit01Icon,
  StickyNote01Icon,
  InternetIcon,
  CheckmarkBadge01Icon,
  Mailbox01Icon,
  SentIcon,
  TextCreationIcon,
  CloudUploadIcon,
  QrCode01Icon,
  BubbleChatIcon,
  Link01Icon,
  InboxIcon,
  MusicNote01Icon,
  Wrench01Icon,
  PinIcon,
} from "@hugeicons/core-free-icons"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"

/**
 * Sentroy OS — Başarımlar (Achievements) statik kataloğu. Gamified onboarding:
 * kullanıcı ürünleri keşfederken hangi adımları tamamladığını görür.
 *
 * API (`/api/companies/[slug]/achievements`) yalnız `{ id → done }` map'i
 * döner; metin (label/description), ikon ve renk BURADAN gelir — i18n
 * anahtarları `os.achievements.items.<id>.{label,description}`.
 *
 * `productId` ve grup `color/icon`'ları app-launcher/launchpad ile senkron
 * tutulur (packages/console/src/components/layout/app-launcher.tsx).
 */

type IconRef = AppDescriptor["icon"]

export type AchievementProductId =
  | "core"
  | "mail"
  | "storage"
  | "whatsapp"
  | "linear"
  | "auth"
  | "studio"

/** OS-seviyesi CTA aksiyonu — openApp/openSettings dışında (sentroy-os state'i
 *  gerektiren) hedefler. achievements-app bunları CustomEvent ile tetikler. */
export type AchievementCtaAction = "open-activity"

/** Client-tarafı (sunucusuz) tespit edilen başarımlar — use-achievements
 *  bunları localStorage/store'dan hesaplayıp API done-map'ine merge eder. */
export type LocalAchievementId = "explore-tools" | "pin-tool-to-dock"

export interface AchievementDef {
  /** API done-map anahtarı + i18n item anahtarı. */
  id: string
  icon: IconRef
  /** os.<labelKey> — item başlığı. */
  labelKey: string
  /** os.<descriptionKey> — kısa açıklama (tamamlanmamış satırlarda). */
  descriptionKey: string
  /** Tamamlanmamışsa CTA: OS app penceresi aç (os-store.openApp). */
  ctaAppId?: string
  /** Tamamlanmamışsa CTA: System Settings penceresi kategorisi (openSettings). */
  ctaSettingsCategory?: string
  /** Tamamlanmamışsa CTA: OS-seviyesi aksiyon (post composer vb.). */
  ctaAction?: AchievementCtaAction
  /** os.achievements.ctas.<ctaKey> — CTA buton etiketi. */
  ctaKey?: string
  /** Bu id sunucu değil client-tarafı tespit edilir (use-achievements merge). */
  local?: boolean
  /** Varsa satırda "ipucu" (ampul) ikonu gösterilir; tıklama mini tur açar
   *  (os.achievements.tips.<id> gövde metni). */
  hasTip?: boolean
  /** İpucu turunun spotlight'layacağı hedef: CSS seçici VEYA "dock" bölge
   *  anahtarı (dock DOM'a dokunulamadığından hesaplanan rect). Yoksa ortalı. */
  tipTarget?: string
}

export interface AchievementGroup {
  productId: AchievementProductId
  /** os.achievements.groups.<productId> — grup adı. */
  labelKey: string
  /** App marka ikonu/rengi — app-launcher ile senkron. */
  icon: IconRef
  color: string
  items: AchievementDef[]
}

function item(
  id: string,
  icon: IconRef,
  extra?: Pick<
    AchievementDef,
    "ctaAppId" | "ctaSettingsCategory" | "ctaAction" | "ctaKey" | "local" | "hasTip" | "tipTarget"
  >,
): AchievementDef {
  return {
    id,
    icon,
    labelKey: `achievements.items.${id}.label`,
    descriptionKey: `achievements.items.${id}.description`,
    ...extra,
  }
}

export const ACHIEVEMENT_GROUPS: AchievementGroup[] = [
  {
    productId: "core",
    labelKey: "achievements.groups.core",
    icon: ShieldKeyIcon,
    color: "#111111",
    items: [
      item("invite-teammate", UserAdd01Icon, { ctaSettingsCategory: "team", ctaKey: "team", hasTip: true }),
      item("create-access-token", Key01Icon, { ctaSettingsCategory: "access-tokens", ctaKey: "accessTokens", hasTip: true }),
      item("set-company-logo", ImageAdd01Icon, { ctaSettingsCategory: "company", ctaKey: "company", hasTip: true }),
      item("first-post", PencilEdit01Icon, { ctaAction: "open-activity", ctaKey: "post", hasTip: true }),
      item("first-note", StickyNote01Icon, { ctaAppId: "notes", ctaKey: "notes", hasTip: true }),
      // Keşif başarımları — client-tarafı tespit (sunucusuz). "Kullanması şart
      // değil, keşfetsin" mantığı.
      item("explore-tools", Wrench01Icon, { ctaAppId: "tools", ctaKey: "tools", local: true, hasTip: true, tipTarget: "dock" }),
      item("pin-tool-to-dock", PinIcon, { ctaAppId: "tools", ctaKey: "tools", local: true, hasTip: true, tipTarget: "dock" }),
    ],
  },
  {
    productId: "mail",
    labelKey: "achievements.groups.mail",
    icon: Mail01Icon,
    color: "#3b82f6",
    items: [
      item("register-domain", InternetIcon, { ctaAppId: "mail", ctaKey: "mail" }),
      item("verify-domain", CheckmarkBadge01Icon, { ctaAppId: "mail", ctaKey: "mail" }),
      item("create-mailbox", Mailbox01Icon, { ctaAppId: "mail", ctaKey: "mail" }),
      item("send-first-email", SentIcon, { ctaAppId: "mail", ctaKey: "mail" }),
      item("create-template", TextCreationIcon, { ctaAppId: "mail", ctaKey: "mail" }),
    ],
  },
  {
    productId: "storage",
    labelKey: "achievements.groups.storage",
    icon: FolderLibraryIcon,
    color: "#a855f7",
    items: [
      item("create-bucket", FolderLibraryIcon, { ctaAppId: "storage", ctaKey: "storage" }),
      item("upload-first-file", CloudUploadIcon, { ctaAppId: "storage", ctaKey: "storage" }),
    ],
  },
  {
    productId: "whatsapp",
    labelKey: "achievements.groups.whatsapp",
    icon: Message01Icon,
    color: "#25d366",
    items: [
      item("connect-number", QrCode01Icon, { ctaAppId: "whatsapp", ctaKey: "whatsapp" }),
      item("send-first-message", BubbleChatIcon, { ctaAppId: "whatsapp", ctaKey: "whatsapp" }),
    ],
  },
  {
    productId: "linear",
    labelKey: "achievements.groups.linear",
    icon: KanbanIcon,
    color: "#5E6AD2",
    items: [
      item("connect-workspace", Link01Icon, { ctaAppId: "linear", ctaKey: "linear" }),
      item("first-request", InboxIcon, { ctaAppId: "linear", ctaKey: "linear" }),
    ],
  },
  {
    productId: "auth",
    labelKey: "achievements.groups.auth",
    icon: ShieldUserIcon,
    color: "#10b981",
    items: [
      item("create-oauth-client", Key01Icon, { ctaAppId: "auth", ctaKey: "auth" }),
      item("create-auth-project", ShieldUserIcon, { ctaAppId: "auth", ctaKey: "auth" }),
    ],
  },
  {
    productId: "studio",
    labelKey: "achievements.groups.studio",
    icon: HeadphonesIcon,
    color: "#ec4899",
    items: [item("first-project", MusicNote01Icon, { ctaAppId: "studio", ctaKey: "studio" })],
  },
]

/** Katalogdaki toplam başarım sayısı. */
export const ACHIEVEMENT_TOTAL = ACHIEVEMENT_GROUPS.reduce(
  (n, g) => n + g.items.length,
  0,
)

/** Client-tarafı tespit edilen başarım id'leri (API done-map'inde YOK). */
export const LOCAL_ACHIEVEMENT_IDS: LocalAchievementId[] = [
  "explore-tools",
  "pin-tool-to-dock",
]

/** localStorage bayrağı — Tools/Launchpad ilk açılışında set edilir. */
export const EXPLORED_TOOLS_LS_KEY = "os-explored-tools"
/** Bayrak değişince use-achievements'in yeniden okuması için event. */
export const EXPLORED_TOOLS_EVENT = "sentroy:explored-tools"

/** API'nin döndürdüğü `{ id → done }` map'i. Bilinmeyen id → false. */
export type AchievementDoneMap = Record<string, boolean>

export function countDone(map: AchievementDoneMap): number {
  let n = 0
  for (const g of ACHIEVEMENT_GROUPS) for (const i of g.items) if (map[i.id]) n++
  return n
}

export function countGroupDone(group: AchievementGroup, map: AchievementDoneMap): number {
  let n = 0
  for (const i of group.items) if (map[i.id]) n++
  return n
}

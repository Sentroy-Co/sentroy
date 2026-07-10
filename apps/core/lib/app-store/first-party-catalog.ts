/**
 * First-party (Sentroy'un kendi) App Store kataloğu — KOD-SABİT.
 *
 * status / whatsapp / studio / opencut app'leri artık "her hesapta varsayılan
 * yüklü sistem app'i" DEĞİL; App Store'dan opt-in kurulur. 3rd-party boru hattı
 * (sentroy_apps + manifest) bu app'leri temsil ETMEZ — id'leri RESERVED_IDS ile
 * manifest yolundan engellenir. Bunun yerine bu statik katalog kullanılır.
 *
 * Kurulum kaydı `app_installs` koleksiyonunda REUSE edilir; çakışmayı önlemek
 * için sentinel appId prefix'i `fp:` kullanılır (ör. `fp:status`). Unique index
 * {userId, appId, companyId} korunur — first-party ve 3rd-party (DB ObjectId
 * string) appId'leri hiç çakışmaz.
 *
 * appId'ler `useSentroyApps` (app-launcher) katalog id'leriyle HİZALI:
 * status / whatsapp / studio / opencut. OS gating bu ham id'leri okur.
 */

/** app_installs sentinel prefix — first-party kurulum kaydı `fp:<appId>`. */
export const FIRST_PARTY_INSTALL_PREFIX = "fp:"

/** Ham first-party id → app_installs kayıt id'si (`fp:status` gibi). */
export function firstPartyInstallId(appId: string): string {
  return `${FIRST_PARTY_INSTALL_PREFIX}${appId}`
}

/** `fp:status` → `status` (ham id). Prefix yoksa null. */
export function firstPartyIdFromInstall(installAppId: string): string | null {
  return installAppId.startsWith(FIRST_PARTY_INSTALL_PREFIX)
    ? installAppId.slice(FIRST_PARTY_INSTALL_PREFIX.length)
    : null
}

export interface Localized {
  en: string
  tr: string
}

export interface FirstPartyApp {
  /** Ham id — useSentroyApps + gating flag'leri ile hizalı. */
  appId: string
  name: Localized
  /** Kısa tek-satır (store kart alt satırı). */
  tagline: Localized
  /** Uzun açıklama (store detay). */
  description: Localized
  /** Store kategori slug'ı (store-panel CATEGORIES ile hizalı). */
  category: string
  /** Marka rengi — useSentroyApps ile aynı. */
  color: string
  /** Mevcut PNG ikon (apps/core/public/os-app-icons/<id>.webp). */
  logoUrl: string
  publisher: string
  /** "New" sıralaması için ISO tarih (app'in platforma eklendiği tarih). */
  addedAt: string
}

export const FIRST_PARTY_APPS: FirstPartyApp[] = [
  {
    appId: "status",
    name: { en: "Status", tr: "Status" },
    tagline: {
      en: "Real-time status pages",
      tr: "Gerçek-zamanlı status sayfaları",
    },
    description: {
      en: "Host your own Atlassian Statuspage-style real-time status page on Sentroy. Track components, publish incidents and maintenance, and let subscribers follow uptime.",
      tr: "Atlassian Statuspage benzeri kendi gerçek-zamanlı status sayfanızı Sentroy üzerinde host edin. Bileşenleri izleyin, incident ve bakım yayınlayın, aboneler uptime'ı takip etsin.",
    },
    category: "analytics",
    color: "#06b6d4",
    logoUrl: "/os-app-icons/status.webp",
    publisher: "Sentroy",
    addedAt: "2026-05-17",
  },
  {
    appId: "whatsapp",
    name: { en: "WhatsApp Santral", tr: "WhatsApp Santral" },
    tagline: {
      en: "WhatsApp inbox & campaigns",
      tr: "WhatsApp gelen kutusu ve kampanyalar",
    },
    description: {
      en: "Link a WhatsApp number and manage chats, contacts and history from the panel. Build templates and audiences, then send single or bulk messages.",
      tr: "Bir WhatsApp numarası bağlayın; sohbetleri, kişileri ve geçmişi panelden yönetin. Şablonlar ve hedef kitleler oluşturun, tekli veya toplu mesaj gönderin.",
    },
    category: "communication",
    color: "#25d366",
    logoUrl: "/os-app-icons/whatsapp.webp",
    publisher: "Sentroy",
    addedAt: "2026-06-25",
  },
  {
    appId: "studio",
    name: { en: "Studio", tr: "Studio" },
    tagline: {
      en: "Browser DJ & music studio",
      tr: "Tarayıcıda DJ ve müzik stüdyosu",
    },
    description: {
      en: "Browser-based DJ and music studio — load tracks, mix, add effects and record live sets, all in the browser.",
      tr: "Tarayıcı tabanlı DJ ve müzik stüdyosu — parçaları yükleyin, mikleyin, efekt ekleyin ve canlı setleri doğrudan tarayıcıda kaydedin.",
    },
    category: "design",
    color: "#ec4899",
    logoUrl: "/os-app-icons/studio.webp",
    publisher: "Sentroy",
    addedAt: "2026-05-18",
  },
  {
    appId: "opencut",
    name: { en: "Video Editor", tr: "Video Editör" },
    tagline: {
      en: "Browser video editor",
      tr: "Tarayıcıda video editör",
    },
    description: {
      en: "Browser-based video editor — trim, cut and produce video content right in your browser, no install required.",
      tr: "Tarayıcı tabanlı video editör — kesin, kırpın ve video içeriklerini doğrudan tarayıcınızda üretin, kurulum gerekmez.",
    },
    category: "design",
    color: "#f97316",
    logoUrl: "/os-app-icons/opencut.webp",
    publisher: "Sentroy",
    addedAt: "2026-06-30",
  },
  {
    appId: "backup",
    name: { en: "MongoDB Backup", tr: "MongoDB Yedek" },
    tagline: {
      en: "Back up & restore MongoDB",
      tr: "MongoDB yedekle ve geri yükle",
    },
    description: {
      en: "Register your MongoDB connections and take gzip backups on demand. Restore a dump into another server (server-to-server) or download it to your desktop. Connection strings are encrypted at rest.",
      tr: "MongoDB bağlantılarınızı kaydedin ve istediğinizde gzip yedekleri alın. Bir yedeği başka bir sunucuya geri yükleyin (sunucular arası) veya masaüstünüze indirin. Bağlantı bilgileri şifreli saklanır.",
    },
    category: "developer",
    color: "#13aa52",
    logoUrl: "/os-app-icons/backup.webp",
    publisher: "Sentroy",
    addedAt: "2026-07-08",
  },
]

const BY_ID = new Map(FIRST_PARTY_APPS.map((a) => [a.appId, a]))

export function firstPartyApp(appId: string): FirstPartyApp | null {
  return BY_ID.get(appId) ?? null
}

export function isFirstPartyAppId(appId: string): boolean {
  return BY_ID.has(appId)
}

/** Tüm first-party ham id'leri. */
export const FIRST_PARTY_APP_IDS: string[] = FIRST_PARTY_APPS.map((a) => a.appId)

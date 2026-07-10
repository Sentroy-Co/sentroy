import { headers } from "next/headers"

const SUPPORTED = ["tr", "en"] as const
type Locale = (typeof SUPPORTED)[number]
const DEFAULT_LOCALE: Locale = "en"

/**
 * Public RP status page (`/p/[slug]`) — string dictionary. Locale, server
 * component'te resolvePublicLang() ile resolve edilir (query > Accept-Language >
 * default "en").
 *
 * Dashboard'daki next-intl namespace'inden ayrı çünkü public page user
 * tarayıcısının dilini direkt yansıtır — Sentroy operator'un dashboard
 * dilinden bağımsız.
 */

const DICT = {
  en: {
    overall: {
      operational: "All systems operational",
      degraded: "Some systems degraded",
      down: "Major outage detected",
      maintenance: "Scheduled maintenance in progress",
      "no-data": "Waiting for first probe data…",
    },
    status: {
      operational: "Operational",
      degraded: "Degraded",
      down: "Down",
      maintenance: "Maintenance",
      "no-data": "No data",
    },
    components: "Components",
    componentsEmpty: "No components configured yet.",
    checksSuffix: "checks",
    uptime24h: "24h",
    uptime30d: "30d",
    activeIncidents: "Active incidents",
    activeMaintenance: "Maintenance in progress",
    scheduledMaintenance: "Scheduled maintenance",
    affects: "Affects",
    subscribeTitle: "Get incident updates",
    subscribeHint:
      "Subscribe to email notifications for status changes and scheduled maintenance.",
    subscribeButton: "Subscribe",
    subscribeEmailPlaceholder: "you@example.com",
    subscribeSubmitting: "Subscribing…",
    subscribeSuccessTitle: "Check your inbox",
    subscribeSuccessBody:
      "We've sent a confirmation link. Click it to activate your subscription.",
    subscribeAlreadyBody: "This email is already subscribed.",
    subscribeErrorBody: "Could not subscribe. Please try again.",
    subscribeCustomize: "Customize notifications",
    subscribeCustomizeAll: "No filter — you'll get every event.",
    subscribeCustomizeSelected: "{count} component(s) — only those will trigger emails.",
    subscribeComponentsHeading: "Only notify me about:",
    subscribeComponentSectionHint: "Pick the components you want to track. Leave empty to subscribe to everything.",
    subscribeSubmit: "Subscribe",
    subscribeCloseLabel: "Close",
    subscribeSuccessTelegram: "Subscribed. Test message sent to your Telegram chat.",
    subscribeSuccessWebhook: "Subscribed. Your webhook secret is shown below — store it now, it won't be shown again.",
    subscribeErrorPrefix: "Could not subscribe",
    subscribeChannelEmail: "Email",
    subscribeChannelTelegram: "Telegram",
    subscribeChannelWebhook: "Webhook",
    subscribeEmailLabel: "Email address",
    subscribeTelegramChatIdLabel: "Telegram chat ID",
    subscribeTelegramChatIdHint: "Send /start to your bot in the target chat, then use @userinfobot or @getmyid_bot to get the chat ID.",
    subscribeTelegramBotTokenLabel: "Bot token",
    subscribeTelegramBotTokenHint: "Get a token from @BotFather. Stored AES-256-GCM encrypted.",
    subscribeTelegramBotTokenPlaceholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    subscribeWebhookUrlLabel: "Webhook URL",
    subscribeWebhookUrlPlaceholder: "https://your-app.example.com/sentroy-status-webhook",
    subscribeWebhookSecretShown: "Save this secret — used for HMAC-SHA256 verification:",
    subscribeTopicSectionTitle: "What to be notified about:",
    subscribeTopicAll: "Everything",
    subscribeTopicIncidentsOnly: "Incidents only",
    subscribeTopicMaintenanceOnly: "Maintenance only",
    pastIncidentsHeading: "Past incidents (30 days)",
    pastIncidentsEmpty: "No incidents reported in the past 30 days.",
    uptimeBar90d: "90 days ago — today",
    footerPoweredBy: "Powered by",
    footerGenerated: "Snapshot generated",
    // Preferences page (/p/[slug]/preferences)
    prefMissingTokenTitle: "Missing token",
    prefIntro: "Open this page from the \"Manage preferences\" link in any of your notification emails.",
    prefTitle: "Subscription preferences",
    prefLoadFailed: "Failed to load (token may be invalid)",
    prefEmailLabel: "Email",
    prefComponentsHint: "Which components do you want to be notified about? Leave empty to receive everything.",
    prefSaveButton: "Save preferences",
    prefSavingButton: "Saving…",
    prefSavedToast: "Saved",
    prefSaveFailedToast: "Save failed",
    prefUnsubscribeButton: "Unsubscribe",
    prefBackLink: "← Back to status page",
    // Unsubscribed page (/p/[slug]/unsubscribed)
    unsubAlreadyTitle: "Already unsubscribed",
    unsubTitle: "You've been unsubscribed",
    unsubDescription: "We won't send any more notifications to this address. If this was a mistake, resubscribe from the status page anytime.",
    unsubBack: "Back to status page",
    // Subscribe error page (/p/subscribe-error)
    subErrTitle: "Invalid link",
    subErrDescription: "This subscription link is invalid or expired. Please subscribe again.",
    subErrBack: "Back to Sentroy",
    // Subscribed page (/p/[slug]/subscribed)
    subscribedAlreadyTitle: "Already subscribed",
    subscribedTitle: "Subscription confirmed",
    subscribedBody: "You'll now receive incident and maintenance updates from {name} at this email. Use the unsubscribe link in any notification to opt out anytime.",
    subscribedBack: "Back to status page",
    metaTitleSuffix: "Status",
    metaDescription: "Real-time service status",
  },
  tr: {
    overall: {
      operational: "Tüm sistemler operasyonel",
      degraded: "Bazı sistemler düşük performansta",
      down: "Büyük bir kesinti tespit edildi",
      maintenance: "Planlı bakım sürüyor",
      "no-data": "İlk probe verisi bekleniyor…",
    },
    status: {
      operational: "Çalışıyor",
      degraded: "Yavaş",
      down: "Kapalı",
      maintenance: "Bakımda",
      "no-data": "Veri yok",
    },
    components: "Bileşenler",
    componentsEmpty: "Henüz tanımlı bileşen yok.",
    checksSuffix: "kontrol",
    uptime24h: "24s",
    uptime30d: "30g",
    activeIncidents: "Aktif olaylar",
    activeMaintenance: "Devam eden bakım",
    scheduledMaintenance: "Planlı bakım",
    affects: "Etkilenen",
    subscribeTitle: "Olay bildirimlerini al",
    subscribeHint:
      "Durum değişiklikleri ve planlı bakım için email bildirimlerine abone ol.",
    subscribeButton: "Abone ol",
    subscribeEmailPlaceholder: "siz@example.com",
    subscribeSubmitting: "Abone olunuyor…",
    subscribeSuccessTitle: "E-postanızı kontrol edin",
    subscribeSuccessBody:
      "Onay linki gönderdik. Aboneliğinizi aktifleştirmek için tıklayın.",
    subscribeAlreadyBody: "Bu e-posta zaten abone.",
    subscribeErrorBody: "Abone olunamadı. Lütfen tekrar deneyin.",
    subscribeCustomize: "Bildirimleri özelleştir",
    subscribeCustomizeAll: "Filtre yok — her olay sana gelir.",
    subscribeCustomizeSelected: "{count} bileşen — yalnızca bunlardan mail alacaksın.",
    subscribeComponentsHeading: "Sadece şunları bildir:",
    subscribeComponentSectionHint: "Takip etmek istediğin bileşenleri seç. Boş bırakırsan hepsine abone olursun.",
    subscribeSubmit: "Abone ol",
    subscribeCloseLabel: "Kapat",
    subscribeSuccessTelegram: "Abone olundu. Telegram sohbetine test mesajı gönderildi.",
    subscribeSuccessWebhook: "Abone olundu. Webhook secret'ın aşağıda — şimdi sakla, bir daha gösterilmeyecek.",
    subscribeErrorPrefix: "Abone olunamadı",
    subscribeChannelEmail: "Email",
    subscribeChannelTelegram: "Telegram",
    subscribeChannelWebhook: "Webhook",
    subscribeEmailLabel: "E-posta adresi",
    subscribeTelegramChatIdLabel: "Telegram chat ID",
    subscribeTelegramChatIdHint: "Önce bot'una hedef sohbette /start yaz, sonra @userinfobot veya @getmyid_bot ile chat ID'yi al.",
    subscribeTelegramBotTokenLabel: "Bot token",
    subscribeTelegramBotTokenHint: "@BotFather'dan token al. AES-256-GCM şifreli saklanır.",
    subscribeTelegramBotTokenPlaceholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    subscribeWebhookUrlLabel: "Webhook URL",
    subscribeWebhookUrlPlaceholder: "https://uygulamam.example.com/sentroy-status-webhook",
    subscribeWebhookSecretShown: "Bu secret'ı sakla — HMAC-SHA256 doğrulama için kullanılır:",
    subscribeTopicSectionTitle: "Neler bildirilecek:",
    subscribeTopicAll: "Hepsi",
    subscribeTopicIncidentsOnly: "Sadece olaylar",
    subscribeTopicMaintenanceOnly: "Sadece bakım",
    pastIncidentsHeading: "Geçmiş olaylar (30 gün)",
    pastIncidentsEmpty: "Son 30 günde olay raporlanmadı.",
    uptimeBar90d: "90 gün önce — bugün",
    footerPoweredBy: "Powered by",
    footerGenerated: "Snapshot zamanı",
    // Preferences page (/p/[slug]/preferences)
    prefMissingTokenTitle: "Token eksik",
    prefIntro: "Bu sayfaya bildirim e-postanızda gelen \"Manage preferences\" bağlantısı üzerinden ulaşmanız gerekir.",
    prefTitle: "Abonelik tercihleri",
    prefLoadFailed: "Yüklenemedi (token geçersiz olabilir)",
    prefEmailLabel: "E-posta",
    prefComponentsHint: "Hangi bileşenlerden bildirim almak istersin? Boş bırakırsan tümünden alırsın.",
    prefSaveButton: "Kaydet",
    prefSavingButton: "Kaydediliyor…",
    prefSavedToast: "Kaydedildi",
    prefSaveFailedToast: "Kaydedilemedi",
    prefUnsubscribeButton: "Aboneliği iptal et",
    prefBackLink: "← Status sayfasına dön",
    // Unsubscribed page (/p/[slug]/unsubscribed)
    unsubAlreadyTitle: "Zaten abonelikten çıkılmış",
    unsubTitle: "Aboneliğiniz iptal edildi",
    unsubDescription: "Bu adrese artık bildirim göndermeyeceğiz. Yanlışlıkla yaptıysanız status sayfasında tekrar abone olabilirsiniz.",
    unsubBack: "Status sayfasına dön",
    // Subscribe error page (/p/subscribe-error)
    subErrTitle: "Bağlantı geçersiz",
    subErrDescription: "Bu abonelik linki geçersiz veya süresi dolmuş. Lütfen tekrar abone olun.",
    subErrBack: "Sentroy ana sayfasına dön",
    // Subscribed page (/p/[slug]/subscribed)
    subscribedAlreadyTitle: "Zaten abonesiniz",
    subscribedTitle: "Abonelik onaylandı",
    subscribedBody: "Bundan sonra {name} olay ve bakım bildirimlerini bu e-posta adresine alacaksınız. Abonelikten çıkmak için her bildirimde verilen linki kullanabilirsiniz.",
    subscribedBack: "Status sayfasına dön",
    metaTitleSuffix: "Status",
    metaDescription: "Gerçek-zamanlı servis durumu",
  },
} as const

export type PublicStrings = (typeof DICT)[Locale]

export function getPublicStrings(lang: string): PublicStrings {
  if (lang in DICT) return DICT[lang as Locale]
  return DICT[DEFAULT_LOCALE]
}

/**
 * Locale resolve order: ?lang= query param → Accept-Language header → "en".
 */
export async function resolvePublicLang(searchLang?: string): Promise<Locale> {
  if (searchLang && SUPPORTED.includes(searchLang as Locale)) {
    return searchLang as Locale
  }
  try {
    const acceptLang = (await headers()).get("accept-language") ?? ""
    for (const part of acceptLang.split(",")) {
      const tag = part.split(";")[0]?.trim().toLowerCase().slice(0, 2)
      if (tag && SUPPORTED.includes(tag as Locale)) {
        return tag as Locale
      }
    }
  } catch {
    // headers() server-side only — silently fall through to default
  }
  return DEFAULT_LOCALE
}

export const SUPPORTED_PUBLIC_LOCALES = SUPPORTED

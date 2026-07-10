/**
 * Bot metin sözlüğü — kullanıcıya giden TÜM Telegram metinleri buradan geçer
 * (server-side saf fonksiyon; next-intl DEĞİL — meet kabuğundaki minimal
 * lib/i18n.ts tarzı). Dil şirket ayarından gelir (telegram.language,
 * default "en"). Callback data'ları dil-bağımsızdır; yalnız görünen
 * label'lar sözlükten okunur.
 *
 * Üslup: kurumsal ve sade — selamlaşma/süs emojisi YOK. Liste okunurluğu
 * için durum noktaları (STATE_EMOJI, flow.ts) korunur.
 */

export type BotLang = "en" | "tr"

export const DEFAULT_BOT_LANG: BotLang = "en"

/** Ayar değerini güvenli dile indirger (bilinmeyen/boş → default en). */
export function normalizeBotLang(value: unknown): BotLang {
  return value === "tr" ? "tr" : "en"
}

/** Komut aksiyonları — dispatcher eşlemesi dil-bağımsız, gösterim dile göre. */
export type BotCommand = "create" | "mine" | "all" | "cancel"

const COMMAND_DISPLAY: Record<BotLang, Record<BotCommand, string>> = {
  en: {
    create: "/request",
    mine: "/myrequests",
    all: "/requests",
    cancel: "/cancel",
  },
  tr: {
    create: "/talep",
    mine: "/taleplerim",
    all: "/talepler",
    cancel: "/iptal",
  },
}

/** Seçili dile göre komutun görünen adı (mesaj içi yönlendirmelerde). */
export function cmdDisplay(lang: BotLang, cmd: BotCommand): string {
  return COMMAND_DISPLAY[lang][cmd]
}

/**
 * Komut alias eşlemesi — HER İKİ dilin komutları her zaman kabul edilir
 * (kanonik İngilizce + TR alias'ları). Bilinmeyen komut → null (menü gösterilir).
 */
const COMMAND_ALIASES: Record<string, BotCommand> = {
  "/request": "create",
  "/talep": "create",
  "/myrequests": "mine",
  "/taleplerim": "mine",
  "/durum": "mine",
  "/requests": "all",
  "/talepler": "all",
  "/durumlar": "all",
  "/cancel": "cancel",
  "/iptal": "cancel",
}

export function resolveCommand(raw: string): BotCommand | null {
  return COMMAND_ALIASES[raw] ?? null
}

type Dict = Record<string, string>

const EN = {
  // --- Dispatcher ---------------------------------------------------------
  unauthorized: "This bot is available to authorized operators only.",
  discoveryAck:
    "Your identity has been recorded. The bot will become available once a panel administrator authorizes your account.",
  privateOnly: "The bot works in private chats only.",
  rateLimited:
    "Request limit exceeded. Please try again in about {seconds} seconds.",
  genericError: "An error occurred. Please try again.",
  genericErrorShort: "An error occurred.",

  // --- Menü / karşılama ----------------------------------------------------
  // Komut listesi bilinçli olarak YOK — kısa tanıtım + buton menüsü yeterli.
  welcome:
    "Linear Lite request bot.\nOpen requests on your company panel and track their status.\n\nSelect an action:",
  menuNew: "New request",
  menuMine: "My requests",
  menuAll: "All requests",
  noPermission: "You are not authorized for this action.",
  noTeamAccess:
    "You do not have a team access assignment yet. Please contact your panel administrator.",

  // --- Akış adımları --------------------------------------------------------
  linearNotConfigured:
    "The Linear connection is not configured. Please contact your panel administrator.",
  noTeams:
    "No accessible Linear team was found. Please contact your panel administrator.",
  teamPrompt: "Which team should this request go to?",
  priorityPrompt: "Select the priority of the request.",
  priority1: "Urgent",
  priority2: "Resolve today",
  priority4: "Add to work plan",
  priorityNone: "—",
  titleHeader: "Give your request a title.",
  titleGuide:
    'Write a short and clear title (e.g. "Transfer screen freezes"). It becomes the request title in Linear. Details follow in the next step.',
  titleAskText:
    "Please send a short title as text first. Images can be added in the next step.",
  titleTooShort: "The title must be at least 2 characters long.",
  titleLine: "Title: {title}",
  detailsHeader: "Write a description and/or send images.",
  detailsGuide:
    "Describe the request as clearly as possible — this text becomes the request description in Linear. You may also attach images.\nDo not share sensitive data such as card numbers, IBAN or passwords in this channel. To correct a mistake, edit the message or press Clear — deleting a message does not remove it from the draft.",
  detailsStatusYes: "description ✓",
  detailsStatusNo: "description —",
  detailsStatusLine: "Status: {desc} · {photos} image(s)",
  detailsDone: "Press “{continue}” when finished.",
  needContent: "Please add at least one text message or image first.",
  useButtons: "Please use the buttons above.",
  noActiveSession: "No active request. Use {cmd} to start.",
  sessionExpired: "The session has expired. Use {cmd} to start.",
  confirmHeader: "Summary — review before submitting:",
  confirmTitle: "Title",
  confirmTeam: "Team",
  confirmPriority: "Priority",
  confirmImages: "Images",
  submitting: "Creating your request…",
  submittingShort: "Submitting…",
  submitFailed: "Could not submit: {error}\nPress “{submit}” to try again.",
  canceledCard: "The request was canceled.",
  canceledMessage: "Canceled. Use {cmd} to start a new request.",
  successHeader: "Your request has been created — {identifier}",
  fallbackTitle: "{team} request — {date}",

  // --- Butonlar -------------------------------------------------------------
  btnContinue: "Continue ›",
  btnClear: "Clear",
  btnBack: "‹ Back",
  btnCancel: "Cancel",
  btnSubmit: "Submit",

  // --- Listeler ---------------------------------------------------------------
  myEmpty: "You have not opened any requests yet. Use {cmd} to start.",
  myHeader: "Your requests (last {count})",
  allHeader: "{panel} — requests ({count})",
  allEmpty: "No requests match this filter.",
  allFailed: "Could not fetch the requests. Please try again later.",
  statusUnknown: "status unavailable",
  untitled: "(no title)",
  sourceTelegram: "Telegram",
  sourcePanel: "Panel",
  filterPrompt: "Select a status filter:",
  filterAll: "All",
  filterBacklog: "Backlog",
  filterUnstarted: "Not started",
  filterStarted: "In progress",
  filterCompleted: "Completed",

  // --- Görece zaman ------------------------------------------------------------
  relJustNow: "just now",
  relHours: "{h} h ago",
  relDays: "{d} d ago",
  relWeeks: "{w} wk ago",

  // --- Talep gövdesi (Linear'a yazılır) -----------------------------------------
  bodyTeamLine: "**Team:** {team}",
  bodyEmpty: "(no content provided)",

  // --- Webhook bildirimi ----------------------------------------------------
  statusUpdated: "Request status updated",
} satisfies Dict

const TR = {
  unauthorized: "Bu bot yalnızca yetkili operatörlerin kullanımına açıktır.",
  discoveryAck:
    "Kaydınız alındı. Panel yöneticisi hesabınızı yetkilendirdiğinde bot kullanımınıza açılacaktır.",
  privateOnly: "Bot yalnızca özel sohbette çalışır.",
  rateLimited:
    "İstek sınırı aşıldı. Lütfen yaklaşık {seconds} saniye sonra tekrar deneyin.",
  genericError: "Bir hata oluştu. Lütfen tekrar deneyin.",
  genericErrorShort: "Bir hata oluştu.",

  welcome:
    "Linear Lite talep botu.\nŞirket panelinize talep açabilir ve taleplerinizin durumunu izleyebilirsiniz.\n\nBir işlem seçin:",
  menuNew: "Yeni talep",
  menuMine: "Taleplerim",
  menuAll: "Talepler",
  noPermission: "Bu işlem için yetkiniz bulunmuyor.",
  noTeamAccess:
    "Henüz bir takım erişiminiz tanımlı değil. Lütfen panel yöneticinizle görüşün.",

  linearNotConfigured:
    "Linear bağlantısı yapılandırılmamış. Lütfen panel yöneticinizle görüşün.",
  noTeams:
    "Erişilebilir bir Linear takımı bulunamadı. Lütfen panel yöneticinizle görüşün.",
  teamPrompt: "Talebiniz hangi takım ile ilgili?",
  priorityPrompt: "Talebin önem seviyesini seçin.",
  priority1: "Acil",
  priority2: "Gün içinde çözülmeli",
  priority4: "İş planına al",
  priorityNone: "—",
  titleHeader: "Talebinize bir başlık verin.",
  titleGuide:
    'Kısa ve anlaşılır bir başlık yazın (örn. "Havale ekranı donuyor"). Bu, Linear\'da talebin başlığı olur. Detayları sonraki adımda yazacaksınız.',
  titleAskText:
    "Lütfen önce kısa bir başlık yazın (metin). Görselleri sonraki adımda ekleyebilirsiniz.",
  titleTooShort: "Başlık en az 2 karakter olmalıdır.",
  titleLine: "Başlık: {title}",
  detailsHeader: "Açıklama yazın ve/veya görsel gönderin.",
  detailsGuide:
    "Talebi olabildiğince açıklayıcı yazın — bu metin Linear'da talebin açıklaması olarak görünür. İsterseniz görsel de ekleyebilirsiniz.\nBu kanala kart numarası, IBAN, parola gibi hassas veriler yazmayın. Yanlışlık olursa mesajı düzenleyin ya da Temizle'ye basın — Telegram, silinen mesajları bota bildirmediği için silmek taslaktan kaldırmaz.",
  detailsStatusYes: "açıklama ✓",
  detailsStatusNo: "açıklama —",
  detailsStatusLine: "Durum: {desc} · {photos} görsel",
  detailsDone: "Bittiğinde “{continue}” düğmesine basın.",
  needContent: "Lütfen önce en az bir metin ya da görsel ekleyin.",
  useButtons: "Lütfen yukarıdaki düğmeleri kullanın.",
  noActiveSession: "Aktif talep yok. Başlamak için {cmd} yazın.",
  sessionExpired: "Oturum sona erdi. Başlamak için {cmd} yazın.",
  confirmHeader: "Özet — göndermeden önce kontrol edin:",
  confirmTitle: "Başlık",
  confirmTeam: "Takım",
  confirmPriority: "Önem",
  confirmImages: "Görsel",
  submitting: "Talebiniz oluşturuluyor…",
  submittingShort: "Gönderiliyor…",
  submitFailed:
    "Gönderilemedi: {error}\nTekrar denemek için “{submit}” düğmesine basın.",
  canceledCard: "Talep iptal edildi.",
  canceledMessage: "İptal edildi. Yeni talep için {cmd} yazın.",
  successHeader: "Talebiniz oluşturuldu — {identifier}",
  fallbackTitle: "{team} talebi — {date}",

  btnContinue: "Devam ›",
  btnClear: "Temizle",
  btnBack: "‹ Geri",
  btnCancel: "İptal",
  btnSubmit: "Gönder",

  myEmpty: "Henüz bir talep açmadınız. Başlamak için {cmd} yazın.",
  myHeader: "Talepleriniz (son {count})",
  allHeader: "{panel} — talepler ({count})",
  allEmpty: "Bu filtreyle eşleşen talep yok.",
  allFailed: "Talepler alınamadı. Lütfen daha sonra tekrar deneyin.",
  statusUnknown: "durum alınamadı",
  untitled: "(başlık yok)",
  sourceTelegram: "Telegram",
  sourcePanel: "Panel",
  filterPrompt: "Durum filtresi seçin:",
  filterAll: "Tümü",
  filterBacklog: "Backlog",
  filterUnstarted: "Başlamadı",
  filterStarted: "Devam ediyor",
  filterCompleted: "Tamamlandı",

  relJustNow: "az önce",
  relHours: "{h} sa önce",
  relDays: "{d} gün önce",
  relWeeks: "{w} hafta önce",

  bodyTeamLine: "**Takım:** {team}",
  bodyEmpty: "(içerik belirtilmedi)",

  statusUpdated: "Talep durumu güncellendi",
} satisfies Record<keyof typeof EN, string>

const DICT: Record<BotLang, Record<keyof typeof EN, string>> = { en: EN, tr: TR }

export type BotTextKey = keyof typeof EN

/** Sözlükten metin — {var} yer tutucuları vars ile doldurulur. */
export function botText(
  lang: BotLang,
  key: BotTextKey,
  vars?: Record<string, string | number>,
): string {
  const template = DICT[lang][key] ?? EN[key]
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_m, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  )
}

/** Önem etiketi (dil bazlı) — {1,2,4} dışındaki değerler "—". */
export function priorityText(lang: BotLang, p: number | null): string {
  if (p === 1) return botText(lang, "priority1")
  if (p === 2) return botText(lang, "priority2")
  if (p === 4) return botText(lang, "priority4")
  return botText(lang, "priorityNone")
}

/** Kısa görece zaman (dil bazlı) — triage relTime davranışı. */
export function relTimeText(lang: BotLang, date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime()
  if (Number.isNaN(diff)) return ""
  const h = 3_600_000
  const d = 24 * h
  if (diff < h) return botText(lang, "relJustNow")
  if (diff < d) return botText(lang, "relHours", { h: Math.floor(diff / h) })
  if (diff < 7 * d) return botText(lang, "relDays", { d: Math.floor(diff / d) })
  if (diff < 30 * d)
    return botText(lang, "relWeeks", { w: Math.floor(diff / (7 * d)) })
  return new Date(date).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US")
}

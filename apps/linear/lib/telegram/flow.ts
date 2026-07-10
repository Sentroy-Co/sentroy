/**
 * Talep konuşma akışı (triage flow.server.ts portu — sunucu-taraflı FSM).
 * İçeriği YAZMAK dışında tüm adımlar inline buton. Tek canlı kart
 * (editMessageText). Her adımda Geri (+ yetkiliyse İptal). Detay adımında
 * KVKK hassas-veri uyarısı. AWAIT_CONFIRM özet+onay. SUBMITTING kilidi
 * çift-submit'i engeller. Başlık deterministik türetilir.
 *
 * Triage'dan farklar:
 *  - Kategori ağacı yerine LINEAR TAKIMI seçilir (tek seviyeli keyboard).
 *  - Tüm metinler dil sözlüğünden (messages.ts, default EN) — kurumsal üslup.
 *  - Operatör yetkileri (canCreate/canListAll/canCancel) komut + buton
 *    seviyesinde uygulanır; /taleplerim her operatöre açıktır.
 *  - /start karşılama menüsü (yetkiye göre filtreli inline buton).
 *  - Talep listesi (/talepler) önce durum filtresi klavyesi gösterir.
 *  - memberUserId eşli operatörlerde /taleplerim panel taleplerini de içerir.
 */

import { getLinearContext, type LinearContext } from "../linear/context"
import { getTeams } from "../linear/metadata"
import { listInboxIssues, listIssues } from "../linear/issues"
import { resolveRequester } from "../linear/mapping"
import type { IssuePriority, IssueStateType } from "../linear/types"
import type {
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  TgCallbackQuery,
  TgMessage,
  TgUser,
} from "./api"
import {
  getPanelUserById,
  type BotRuntime,
  type LinearTelegramOperator,
} from "./store"
import {
  botText,
  cmdDisplay,
  priorityText,
  relTimeText,
  resolveCommand,
  type BotLang,
} from "./messages"
import {
  clearSession,
  createSession,
  getSession,
  patchSession,
  type DraftSegment,
  type TelegramSession,
} from "./session"
import {
  buildRequester,
  createTelegramIssue,
  getIssueStates,
  listUserRequests,
} from "./requests"

type Operator = LinearTelegramOperator

type TeamOption = { id: string; name: string; key: string }

/**
 * Şirketin Linear takım seçenekleri (cache'li getTeams). Global varsayılan
 * takım kavramı KALKTI — erişim operatör bazlı `teamAccess` ile yönetilir;
 * "all" erişiminde tüm takımlar olduğu gibi listelenir.
 */
async function teamOptions(ctx: LinearContext): Promise<TeamOption[]> {
  const teams = await getTeams(ctx)
  return teams.map((t) => ({ id: t.id, name: t.name, key: t.key }))
}

// --- Taslak segmentleri (mesaj-id bazlı; mesaj düzenlenince yakalamak için) ---
function segTitle(segs: DraftSegment[]): string | null {
  return segs.find((s) => s.slot === "title")?.text ?? null
}
function segDetail(segs: DraftSegment[]): string | null {
  const t = segs
    .filter((s) => s.slot === "detail")
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n")
  return t || null
}
/**
 * Segmenti upsert eder. Yeni mesajda slotForNew verilir; DÜZENLEMEDE null (yalnız
 * mevcut segment güncellenir, slot korunur — bilinmeyen mesaj yok sayılır). Boş
 * metin segmenti kaldırır. Değişiklik yoksa AYNI referansı döner (çağıran "fark
 * yok"u referans eşitliğiyle anlar).
 */
function putSegment(
  segs: DraftSegment[],
  id: number,
  text: string,
  slotForNew: "title" | "detail" | null,
): DraftSegment[] {
  const existing = segs.find((s) => s.id === id)
  if (!text) return existing ? segs.filter((s) => s.id !== id) : segs
  if (existing) {
    if (existing.text === text) return segs
    return segs.map((s) => (s.id === id ? { ...s, text } : s))
  }
  if (!slotForNew) return segs
  return [...segs, { id, slot: slotForNew, text }]
}

// --- Klavyeler -----------------------------------------------------------
// Callback data'ları dil-bağımsız id'lerdir; yalnız label'lar sözlükten gelir.

/** Geri/İptal satırı — İptal yalnız canCancel yetkisi olan operatörde görünür. */
function navRow(
  lang: BotLang,
  op: Operator,
  withBack: boolean,
): InlineKeyboardButton[] {
  const row: InlineKeyboardButton[] = []
  if (withBack) row.push({ text: botText(lang, "btnBack"), callback_data: "back" })
  if (op.canCancel)
    row.push({ text: botText(lang, "btnCancel"), callback_data: "cancel" })
  return row
}

function pushNav(
  rows: InlineKeyboardButton[][],
  lang: BotLang,
  op: Operator,
  withBack: boolean,
): InlineKeyboardMarkup {
  const nav = navRow(lang, op, withBack)
  if (nav.length > 0) rows.push(nav)
  return { inline_keyboard: rows }
}

function teamKeyboard(
  lang: BotLang,
  op: Operator,
  teams: TeamOption[],
): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = teams.map((t) => [
    { text: t.name, callback_data: `team:${t.id}` },
  ])
  return pushNav(rows, lang, op, false)
}
const PRIORITY_VALUES: IssuePriority[] = [1, 2, 4]
/**
 * Önem klavyesi. `withBack=false` sabit-takım erişiminde kullanılır — takım
 * adımı atlandığından geri dönülecek adım yoktur.
 */
function priorityKeyboard(
  lang: BotLang,
  op: Operator,
  withBack = true,
): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = PRIORITY_VALUES.map((v) => [
    { text: priorityText(lang, v), callback_data: `pri:${v}` },
  ])
  return pushNav(rows, lang, op, withBack)
}
function titleKeyboard(lang: BotLang, op: Operator): InlineKeyboardMarkup {
  return pushNav([], lang, op, true)
}
function detailsKeyboard(lang: BotLang, op: Operator): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [
    [{ text: botText(lang, "btnContinue"), callback_data: "next" }],
    [{ text: botText(lang, "btnClear"), callback_data: "clear" }],
  ]
  return pushNav(rows, lang, op, true)
}
function confirmKeyboard(lang: BotLang, op: Operator): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [
    [{ text: botText(lang, "btnSubmit"), callback_data: "submit" }],
  ]
  return pushNav(rows, lang, op, true)
}

/** Karşılama menüsü — operatörün yetkilerine göre filtrelenir. */
function menuKeyboard(lang: BotLang, op: Operator): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = []
  if (op.canCreate)
    rows.push([{ text: botText(lang, "menuNew"), callback_data: "menu:new" }])
  rows.push([{ text: botText(lang, "menuMine"), callback_data: "menu:mine" }])
  if (op.canListAll)
    rows.push([{ text: botText(lang, "menuAll"), callback_data: "menu:all" }])
  return { inline_keyboard: rows }
}

// --- Durum filtresi (/talepler) --------------------------------------------

type StatusFilter = "all" | "backlog" | "unstarted" | "started" | "completed"

const STATUS_FILTERS: {
  id: StatusFilter
  labelKey: "filterAll" | "filterBacklog" | "filterUnstarted" | "filterStarted" | "filterCompleted"
  /** listIssues stateType parametresi. */
  stateType: "open" | "closed" | "all"
  /** null → tip filtresi yok; aksi halde state.type bu kümede olmalı. */
  types: IssueStateType[] | null
}[] = [
  { id: "all", labelKey: "filterAll", stateType: "all", types: null },
  // Backlog filtresi triage tipini de kapsar (Linear'da ikisi de "beklemede").
  { id: "backlog", labelKey: "filterBacklog", stateType: "open", types: ["backlog", "triage"] },
  { id: "unstarted", labelKey: "filterUnstarted", stateType: "open", types: ["unstarted"] },
  { id: "started", labelKey: "filterStarted", stateType: "open", types: ["started"] },
  { id: "completed", labelKey: "filterCompleted", stateType: "closed", types: ["completed"] },
]

function filterKeyboard(lang: BotLang): InlineKeyboardMarkup {
  // 2'li satırlar — 5 seçenek: [Tümü, Backlog] [Başlamadı, Devam ediyor] [Tamamlandı]
  const buttons = STATUS_FILTERS.map((f) => ({
    text: botText(lang, f.labelKey),
    callback_data: `all:${f.id}`,
  }))
  const rows: InlineKeyboardButton[][] = []
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2))
  }
  return { inline_keyboard: rows }
}

// --- Kart metinleri ------------------------------------------------------

function titleText(lang: BotLang): string {
  return [botText(lang, "titleHeader"), "", botText(lang, "titleGuide")].join("\n")
}
function detailsText(lang: BotLang, s: TelegramSession): string {
  const title = segTitle(s.draftSegments)
  const desc = s.draftText
    ? botText(lang, "detailsStatusYes")
    : botText(lang, "detailsStatusNo")
  const lines: string[] = []
  if (title) lines.push(botText(lang, "titleLine", { title }), "")
  lines.push(
    botText(lang, "detailsHeader"),
    "",
    botText(lang, "detailsGuide"),
    "",
    botText(lang, "detailsStatusLine", { desc, photos: s.draftPhotos.length }),
    botText(lang, "detailsDone", { continue: botText(lang, "btnContinue") }),
  )
  return lines.join("\n")
}
function confirmText(
  lang: BotLang,
  s: TelegramSession,
  teamName: string | null,
): string {
  const title = segTitle(s.draftSegments) ?? "—"
  const preview = (s.draftText ?? "").slice(0, 240)
  return [
    botText(lang, "confirmHeader"),
    "",
    `• ${botText(lang, "confirmTitle")}: ${title}`,
    `• ${botText(lang, "confirmTeam")}: ${teamName ?? "—"}`,
    `• ${botText(lang, "confirmPriority")}: ${priorityText(lang, s.priority)}`,
    `• ${botText(lang, "confirmImages")}: ${s.draftPhotos.length}`,
    preview ? `\n${preview}${(s.draftText ?? "").length > 240 ? "…" : ""}` : "",
  ].join("\n")
}

function deriveTitle(lang: BotLang, text: string, teamLabel: string): string {
  const firstLine =
    (text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  const t = firstLine.slice(0, 80).trim()
  if (t.length >= 3) return t
  const date = new Date().toISOString().slice(0, 10)
  return botText(lang, "fallbackTitle", { team: teamLabel, date })
}

/** Canlı kartı güncelle; edit başarısızsa yeni kart at ve id'yi sakla. */
async function editCard(
  bot: BotRuntime,
  chatId: number,
  cardMessageId: string | null,
  text: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<void> {
  const reply_markup = keyboard
  if (!cardMessageId) {
    const sent = await bot.api.sendMessage(
      chatId,
      text,
      reply_markup ? { reply_markup } : undefined,
    )
    await patchSession(bot.companyId, chatId, {
      cardMessageId: String(sent.message_id),
    })
    return
  }
  try {
    await bot.api.editMessageText(
      chatId,
      cardMessageId,
      text,
      reply_markup ? { reply_markup } : undefined,
    )
  } catch {
    const sent = await bot.api.sendMessage(
      chatId,
      text,
      reply_markup ? { reply_markup } : undefined,
    )
    await patchSession(bot.companyId, chatId, {
      cardMessageId: String(sent.message_id),
    })
  }
}

// --- Komutlar ------------------------------------------------------------

/** Karşılama: kısa kurumsal tanıtım + yetkiye göre filtreli buton menüsü
 *  (komutların metin listesi bilinçli olarak yok — butonlar yeterli). */
async function sendWelcome(
  bot: BotRuntime,
  chatId: number,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  await bot.api.sendMessage(chatId, botText(lang, "welcome"), {
    reply_markup: menuKeyboard(lang, op),
  })
}

export async function handleCommand(
  bot: BotRuntime,
  msg: TgMessage,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  const chatId = msg.chat.id
  const raw = (msg.text ?? "")
    .trim()
    .split(/\s+/)[0]!
    .toLowerCase()
    .replace(/@.*$/, "")
  // Komut eşlemesi dil-bağımsız: kanonik EN + TR alias'ları birlikte kabul.
  const cmd = resolveCommand(raw)

  if (cmd === "create") {
    if (!op.canCreate) {
      await bot.api.sendMessage(chatId, botText(lang, "noPermission"))
      return
    }
    return startRequest(bot, chatId, msg.from, op)
  }
  if (cmd === "mine") return listMyRequests(bot, chatId, msg.from, op)
  if (cmd === "all") {
    if (!op.canListAll) {
      await bot.api.sendMessage(chatId, botText(lang, "noPermission"))
      return
    }
    // Takım erişimi tanımlı değilse listeleme de kapalı (teamAccess modeli).
    if (!op.teamAccess) {
      await bot.api.sendMessage(chatId, botText(lang, "noTeamAccess"))
      return
    }
    // Önce durum filtresi klavyesi (liste seçime göre döner).
    await bot.api.sendMessage(chatId, botText(lang, "filterPrompt"), {
      reply_markup: filterKeyboard(lang),
    })
    return
  }
  if (cmd === "cancel") {
    if (!op.canCancel) {
      await bot.api.sendMessage(chatId, botText(lang, "noPermission"))
      return
    }
    await clearSession(bot.companyId, chatId)
    await bot.api.sendMessage(
      chatId,
      botText(lang, "canceledMessage", { cmd: cmdDisplay(lang, "create") }),
    )
    return
  }
  // /start dahil bilinmeyen komutlar → karşılama menüsü.
  await sendWelcome(bot, chatId, op)
}

// Linear durum tipine göre nokta işareti (liste okunurluğu — korunur).
const STATE_EMOJI: Record<IssueStateType, string> = {
  triage: "🟠",
  backlog: "⚪",
  unstarted: "🔵",
  started: "🟡",
  completed: "🟢",
  canceled: "⚫",
}

/** Bağlı Linear context'i çözer; yoksa kullanıcıya bilgi mesajı atar. */
async function requireLinearCtx(
  bot: BotRuntime,
  chatId: number,
): Promise<LinearContext | null> {
  const ctx = await getLinearContext(bot.companyId)
  if (!ctx) {
    await bot.api.sendMessage(
      chatId,
      botText(bot.config.language, "linearNotConfigured"),
    )
    return null
  }
  return ctx
}

// --- /taleplerim — telegram + (eşli ise) panel talepleri birleşik -----------

type MyEntry = {
  issueId: string
  head: string
  title: string
  metaLine: string
  when: number
}

/**
 * Operatörün bottan açtığı talepler + canlı Linear durumu. memberUserId
 * eşlemesi varsa aynı kullanıcının PANELDEN açtığı talepler de eklenir
 * (listInboxIssues — panelin kendi Inbox yolu), issueId ile dedup'lanır ve
 * her satır kaynak etiketi taşır ("Telegram" / "Panel").
 */
async function listMyRequests(
  bot: BotRuntime,
  chatId: number,
  from: TgUser | undefined,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  const userId = from?.id
  if (userId == null) return
  const rows = await listUserRequests(bot.companyId, userId, 10)

  const ctx = await requireLinearCtx(bot, chatId)
  if (!ctx) return

  const entries: MyEntry[] = []
  const seenIssueIds = new Set<string>()

  if (rows.length > 0) {
    // Canlı durumlar tek sorguda (erişilemezse durum boş gösterilir).
    const states = await getIssueStates(
      ctx,
      rows.map((r) => r.issueId),
    ).catch(() => new Map<string, never>())
    for (const r of rows) {
      const s = states.get(r.issueId)
      const dot = s ? (STATE_EMOJI[s.state.type] ?? "•") : "•"
      const statusName = s?.state.name ?? botText(lang, "statusUnknown")
      const title = s?.title ?? r.identifier ?? botText(lang, "untitled")
      const head = [r.identifier, priorityText(lang, r.priority)]
        .filter(Boolean)
        .join(" · ")
      seenIssueIds.add(r.issueId)
      entries.push({
        issueId: r.issueId,
        head: `${dot} ${head}`,
        title,
        metaLine: [
          statusName,
          r.teamName,
          relTimeText(lang, r.createdAt),
          botText(lang, "sourceTelegram"),
        ]
          .filter(Boolean)
          .join(" · "),
        when: new Date(r.createdAt).getTime(),
      })
    }
  }

  // Eşli şirket kullanıcısı → panelden açtığı talepler (Inbox yolu).
  if (op.memberUserId) {
    const panelUser = await getPanelUserById(op.memberUserId)
    if (panelUser) {
      try {
        const requester = await resolveRequester(ctx, {
          id: panelUser.id,
          email: panelUser.email,
          name: panelUser.name,
        })
        const page = await listInboxIssues(ctx, { requester, pageSize: 15 })
        for (const issue of page.nodes) {
          if (seenIssueIds.has(issue.id)) continue // dedup (issueId)
          const dot = STATE_EMOJI[issue.state.type] ?? "•"
          entries.push({
            issueId: issue.id,
            head: `${dot} ${issue.identifier}`,
            title: issue.title || botText(lang, "untitled"),
            metaLine: [
              issue.state.name,
              relTimeText(lang, issue.updatedAt),
              botText(lang, "sourcePanel"),
            ].join(" · "),
            when: new Date(issue.updatedAt).getTime(),
          })
        }
      } catch {
        // Panel listesi alınamazsa telegram listesiyle devam (kısmi başarı).
      }
    }
  }

  if (entries.length === 0) {
    await bot.api.sendMessage(
      chatId,
      botText(lang, "myEmpty", { cmd: cmdDisplay(lang, "create") }),
    )
    return
  }

  const top = entries.sort((a, b) => b.when - a.when).slice(0, 10)
  const lines = top.map((e) => `${e.head}\n   ${e.title}\n   ${e.metaLine}`)
  await bot.api.sendMessage(
    chatId,
    `${botText(lang, "myHeader", { count: top.length })}\n\n${lines.join("\n\n")}`,
  )
}

/** /talepler — seçilen durum filtresine göre paneldeki talepler. Takım
 *  kapsamı operatörün `teamAccess`'inden gelir: "all" → filtresiz; <teamId>
 *  → o takıma filtreli; null → kibar red (ilk-takım fallback'i YOK). */
async function listAllRequests(
  bot: BotRuntime,
  chatId: number,
  from: TgUser,
  op: Operator,
  filter: StatusFilter,
): Promise<void> {
  const lang = bot.config.language
  if (!op.teamAccess) {
    await bot.api.sendMessage(chatId, botText(lang, "noTeamAccess"))
    return
  }
  const ctx = await requireLinearCtx(bot, chatId)
  if (!ctx) return
  const spec = STATUS_FILTERS.find((f) => f.id === filter)
  if (!spec) return
  let nodes
  try {
    // scope="workspace" → requester filtresi uygulanmaz (panelden açılan
    // tüm talepler; panel-kaynak filtresi listIssues'ta varsayılan açık).
    const page = await listIssues(ctx, {
      requester: buildRequester(from),
      scope: "workspace",
      stateType: spec.stateType,
      pageSize: 25,
      teamId: op.teamAccess === "all" ? undefined : op.teamAccess,
    })
    nodes = page.nodes
  } catch {
    await bot.api.sendMessage(chatId, botText(lang, "allFailed"))
    return
  }
  // stateType kaba filtre; tip bazlı ince filtre burada uygulanır.
  if (spec.types) {
    nodes = nodes.filter((i) => spec.types!.includes(i.state.type))
  }
  nodes = nodes.slice(0, 10)
  if (nodes.length === 0) {
    await bot.api.sendMessage(chatId, botText(lang, "allEmpty"))
    return
  }
  const lines = nodes.map((i) => {
    const dot = STATE_EMOJI[i.state.type] ?? "•"
    const who = i.assignee?.name ? ` · ${i.assignee.name}` : ""
    return (
      `${dot} ${i.identifier} · ${i.state.name}\n` +
      `   ${i.title}${who} · ${relTimeText(lang, i.updatedAt)}`
    )
  })
  await bot.api.sendMessage(
    chatId,
    `${botText(lang, "allHeader", { panel: ctx.panelLabelName, count: nodes.length })}\n\n${lines.join("\n\n")}`,
  )
}

/**
 * Yeni talep akışını başlatır. Takım adımı operatörün `teamAccess`'ine göre:
 *  - null   → kibar red (takım erişimi tanımsız),
 *  - "all"  → takım seçim klavyesi (tüm takımlar),
 *  - teamId → takım adımı ATLANIR; doğrudan önem adımıyla başlar.
 */
async function startRequest(
  bot: BotRuntime,
  chatId: number,
  from: TgUser | undefined,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  if (!op.teamAccess) {
    await bot.api.sendMessage(chatId, botText(lang, "noTeamAccess"))
    return
  }
  const ctx = await requireLinearCtx(bot, chatId)
  if (!ctx) return
  const teams = await teamOptions(ctx).catch(() => [])
  if (teams.length === 0) {
    await bot.api.sendMessage(chatId, botText(lang, "noTeams"))
    return
  }

  // Sabit takım erişimi: takım Linear'da hâlâ mevcutsa adımı atla.
  if (op.teamAccess !== "all") {
    const team = teams.find((t) => t.id === op.teamAccess)
    if (!team) {
      // Erişim verilen takım artık yok (silinmiş/görünmez) — yönetici düzeltsin.
      await bot.api.sendMessage(chatId, botText(lang, "noTeams"))
      return
    }
    await createSession(bot.companyId, chatId, from?.id ?? chatId)
    const sent = await bot.api.sendMessage(
      chatId,
      botText(lang, "priorityPrompt"),
      // Takım adımı hiç yaşanmadı → önem adımında Geri butonu yok.
      { reply_markup: priorityKeyboard(lang, op, false) },
    )
    await patchSession(bot.companyId, chatId, {
      teamId: team.id,
      state: "AWAIT_PRIORITY",
      cardMessageId: String(sent.message_id),
    })
    return
  }

  await createSession(bot.companyId, chatId, from?.id ?? chatId)
  const sent = await bot.api.sendMessage(chatId, botText(lang, "teamPrompt"), {
    reply_markup: teamKeyboard(lang, op, teams),
  })
  await patchSession(bot.companyId, chatId, {
    cardMessageId: String(sent.message_id),
  })
}

// --- Serbest metin / görsel (yalnız AWAIT_DETAILS) -----------------------
export async function handleMessage(
  bot: BotRuntime,
  msg: TgMessage,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  const chatId = msg.chat.id
  const session = await getSession(bot.companyId, chatId)
  if (!session) {
    await bot.api.sendMessage(
      chatId,
      botText(lang, "noActiveSession", { cmd: cmdDisplay(lang, "create") }),
    )
    return
  }

  // Başlık adımı: ilk metin başlık olur (slot=title), sonra detay adımına geç.
  if (session.state === "AWAIT_TITLE") {
    const incoming = (msg.text ?? msg.caption ?? "").trim()
    if (!incoming) {
      await bot.api.sendMessage(chatId, botText(lang, "titleAskText"))
      return
    }
    const title = incoming.split("\n")[0]!.slice(0, 100).trim()
    if (title.length < 2) {
      await bot.api.sendMessage(chatId, botText(lang, "titleTooShort"))
      return
    }
    const segs = putSegment(
      session.draftSegments,
      msg.message_id,
      title,
      "title",
    )
    await patchSession(bot.companyId, chatId, {
      draftSegments: segs,
      state: "AWAIT_DETAILS",
    })
    const fresh = (await getSession(bot.companyId, chatId))!
    await editCard(
      bot,
      chatId,
      fresh.cardMessageId,
      detailsText(lang, fresh),
      detailsKeyboard(lang, op),
    )
    return
  }

  if (session.state !== "AWAIT_DETAILS") {
    await bot.api.sendMessage(chatId, botText(lang, "useButtons"))
    return
  }

  let changed = false
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1]!
    session.draftPhotos = [...session.draftPhotos, largest.file_id]
    await patchSession(bot.companyId, chatId, {
      draftPhotos: session.draftPhotos,
    })
    changed = true
  }
  const incoming = (msg.text ?? msg.caption ?? "").trim()
  if (incoming) {
    const segs = putSegment(
      session.draftSegments,
      msg.message_id,
      incoming,
      "detail",
    )
    session.draftSegments = segs
    session.draftText = segDetail(segs)
    await patchSession(bot.companyId, chatId, {
      draftSegments: segs,
      draftText: session.draftText,
    })
    changed = true
  }
  if (changed) {
    await editCard(
      bot,
      chatId,
      session.cardMessageId,
      detailsText(lang, session),
      detailsKeyboard(lang, op),
    )
  }
}

/**
 * Düzenlenen mesaj (edited_message). Aynı mesajın segmentini günceller (başlık ya
 * da açıklama — slot korunur) ve mevcut adımın kartını tazeler. Telegram edited
 * mesaj için YENİ update_id üretir → dedup sorun olmaz. allowed_updates'e
 * "edited_message" eklenmiş olmalı (yoksa Telegram hiç göndermez).
 */
export async function handleEditedMessage(
  bot: BotRuntime,
  msg: TgMessage,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  const chatId = msg.chat.id
  const session = await getSession(bot.companyId, chatId)
  if (!session) return
  if (
    session.state !== "AWAIT_TITLE" &&
    session.state !== "AWAIT_DETAILS" &&
    session.state !== "AWAIT_CONFIRM"
  )
    return
  const incoming = (msg.text ?? msg.caption ?? "").trim()
  // slotForNew=null: yalnız önceden yakalanmış bir mesaj güncellenir.
  const segs = putSegment(session.draftSegments, msg.message_id, incoming, null)
  if (segs === session.draftSegments) return // bilinmeyen mesaj / değişiklik yok
  session.draftSegments = segs
  session.draftText = segDetail(segs)
  await patchSession(bot.companyId, chatId, {
    draftSegments: segs,
    draftText: session.draftText,
  })
  const fresh = (await getSession(bot.companyId, chatId))!
  if (fresh.state === "AWAIT_CONFIRM") {
    await editCard(
      bot,
      chatId,
      fresh.cardMessageId,
      confirmText(lang, fresh, await teamNameOf(bot, fresh.teamId)),
      confirmKeyboard(lang, op),
    )
  } else {
    await editCard(
      bot,
      chatId,
      fresh.cardMessageId,
      detailsText(lang, fresh),
      detailsKeyboard(lang, op),
    )
  }
}

/** Session'daki teamId'yi insan-okur takım adına çözer (cache'li getTeams). */
async function teamNameOf(
  bot: BotRuntime,
  teamId: string | null,
): Promise<string | null> {
  if (!teamId) return null
  const ctx = await getLinearContext(bot.companyId)
  if (!ctx) return null
  const teams = await getTeams(ctx).catch(() => [])
  return teams.find((t) => t.id === teamId)?.name ?? null
}

// --- Buton (callback) ----------------------------------------------------
export async function handleCallback(
  bot: BotRuntime,
  cb: TgCallbackQuery,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  const chatId = cb.message?.chat.id
  if (chatId == null) {
    await bot.api.answerCallbackQuery(cb.id)
    return
  }
  const data = cb.data ?? ""

  // Menü + durum filtresi callback'leri OTURUM GEREKTİRMEZ (karşılama
  // menüsünden gelir) — yetki kontrolü burada da uygulanır.
  if (data.startsWith("menu:") || data.startsWith("all:")) {
    if (data === "menu:new" && !op.canCreate) {
      await bot.api.answerCallbackQuery(cb.id, botText(lang, "noPermission"))
      return
    }
    if ((data === "menu:all" || data.startsWith("all:")) && !op.canListAll) {
      await bot.api.answerCallbackQuery(cb.id, botText(lang, "noPermission"))
      return
    }
    // Takım erişimi tanımsız operatörde talep/list akışları kapalı.
    if (
      (data === "menu:new" || data === "menu:all" || data.startsWith("all:")) &&
      !op.teamAccess
    ) {
      await bot.api.answerCallbackQuery(cb.id, botText(lang, "noTeamAccess"))
      return
    }
    await bot.api.answerCallbackQuery(cb.id)
    if (data === "menu:new") return startRequest(bot, chatId, cb.from, op)
    if (data === "menu:mine") return listMyRequests(bot, chatId, cb.from, op)
    if (data === "menu:all") {
      await bot.api.sendMessage(chatId, botText(lang, "filterPrompt"), {
        reply_markup: filterKeyboard(lang),
      })
      return
    }
    if (data.startsWith("all:")) {
      return listAllRequests(
        bot,
        chatId,
        cb.from,
        op,
        data.slice(4) as StatusFilter,
      )
    }
    return
  }

  const session = await getSession(bot.companyId, chatId)
  if (!session) {
    await bot.api.answerCallbackQuery(
      cb.id,
      botText(lang, "sessionExpired", { cmd: cmdDisplay(lang, "create") }),
    )
    return
  }

  if (data === "cancel") {
    // İptal yetkisi olmayan operatörde buton zaten görünmez; stale karta karşı
    // yine de kontrol edilir.
    if (!op.canCancel) {
      await bot.api.answerCallbackQuery(cb.id, botText(lang, "noPermission"))
      return
    }
    await bot.api.answerCallbackQuery(cb.id)
    await clearSession(bot.companyId, chatId)
    await editCard(bot, chatId, session.cardMessageId, botText(lang, "canceledCard"))
    return
  }

  await bot.api.answerCallbackQuery(cb.id)

  if (data === "back") return goBack(bot, chatId, session, op)

  if (data === "clear" && session.state === "AWAIT_DETAILS") {
    // Açıklama segmentleri + görselleri temizle (başlık korunur). Telegram silinen
    // mesajları bota bildirmediğinden, yanlış içeriği toptan sıfırlamanın yolu bu.
    const segs = session.draftSegments.filter((s) => s.slot === "title")
    await patchSession(bot.companyId, chatId, {
      draftSegments: segs,
      draftText: null,
      draftPhotos: [],
    })
    const fresh = (await getSession(bot.companyId, chatId))!
    await editCard(
      bot,
      chatId,
      fresh.cardMessageId,
      detailsText(lang, fresh),
      detailsKeyboard(lang, op),
    )
    return
  }

  if (data.startsWith("team:") && session.state === "AWAIT_TEAM") {
    const teamId = data.slice(5)
    const ctx = await getLinearContext(bot.companyId)
    const teams = ctx ? await getTeams(ctx).catch(() => []) : []
    // Yalnız gerçekten var olan takım kabul (stale/uydurma buton verisi yut).
    if (!teams.some((t) => t.id === teamId)) return
    await patchSession(bot.companyId, chatId, {
      teamId,
      state: "AWAIT_PRIORITY",
    })
    await editCard(
      bot,
      chatId,
      session.cardMessageId,
      botText(lang, "priorityPrompt"),
      priorityKeyboard(lang, op),
    )
    return
  }
  if (data.startsWith("pri:") && session.state === "AWAIT_PRIORITY") {
    const n = Number(data.slice(4))
    if (![1, 2, 4].includes(n)) return
    await patchSession(bot.companyId, chatId, {
      priority: n as IssuePriority,
      state: "AWAIT_TITLE",
    })
    await editCard(
      bot,
      chatId,
      session.cardMessageId,
      titleText(lang),
      titleKeyboard(lang, op),
    )
    return
  }
  if (data === "next" && session.state === "AWAIT_DETAILS") {
    if (!session.draftText && session.draftPhotos.length === 0) {
      await bot.api.sendMessage(chatId, botText(lang, "needContent"))
      return
    }
    await patchSession(bot.companyId, chatId, {
      state: "AWAIT_CONFIRM",
      idempotencyKey: crypto.randomUUID(),
    })
    const fresh = (await getSession(bot.companyId, chatId))!
    await editCard(
      bot,
      chatId,
      fresh.cardMessageId,
      confirmText(lang, fresh, await teamNameOf(bot, fresh.teamId)),
      confirmKeyboard(lang, op),
    )
    return
  }
  if (data === "submit" && session.state === "AWAIT_CONFIRM") {
    return submit(bot, cb, session, op)
  }
  // Stale buton / yanlış adım — sessizce yut (answerCallbackQuery yapıldı).
}

async function goBack(
  bot: BotRuntime,
  chatId: number,
  session: TelegramSession,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  if (session.state === "AWAIT_PRIORITY") {
    // Takım seçimine dön — yalnız "all" erişiminde takım adımı vardır;
    // sabit-takım erişiminde bu buton zaten render edilmez (stale'e karşı yut).
    if (op.teamAccess !== "all") return
    const ctx = await getLinearContext(bot.companyId)
    const teams = ctx ? await teamOptions(ctx).catch(() => []) : []
    await patchSession(bot.companyId, chatId, {
      state: "AWAIT_TEAM",
      teamId: null,
    })
    await editCard(
      bot,
      chatId,
      session.cardMessageId,
      botText(lang, "teamPrompt"),
      teamKeyboard(lang, op, teams),
    )
  } else if (session.state === "AWAIT_TITLE") {
    await patchSession(bot.companyId, chatId, { state: "AWAIT_PRIORITY" })
    await editCard(
      bot,
      chatId,
      session.cardMessageId,
      botText(lang, "priorityPrompt"),
      // Sabit-takım erişiminde önem adımından geriye takım adımı yok.
      priorityKeyboard(lang, op, op.teamAccess === "all"),
    )
  } else if (session.state === "AWAIT_DETAILS") {
    await patchSession(bot.companyId, chatId, { state: "AWAIT_TITLE" })
    await editCard(
      bot,
      chatId,
      session.cardMessageId,
      titleText(lang),
      titleKeyboard(lang, op),
    )
  } else if (session.state === "AWAIT_CONFIRM") {
    await patchSession(bot.companyId, chatId, { state: "AWAIT_DETAILS" })
    const fresh = (await getSession(bot.companyId, chatId))!
    await editCard(
      bot,
      chatId,
      fresh.cardMessageId,
      detailsText(lang, fresh),
      detailsKeyboard(lang, op),
    )
  }
  // AWAIT_TEAM zaten ilk adım — geri butonu bu adımda gösterilmez.
}

async function submit(
  bot: BotRuntime,
  cb: TgCallbackQuery,
  session: TelegramSession,
  op: Operator,
): Promise<void> {
  const lang = bot.config.language
  const chatId = cb.message!.chat.id
  if (session.state === "SUBMITTING") {
    await bot.api.answerCallbackQuery(cb.id, botText(lang, "submittingShort"))
    return
  }
  await patchSession(bot.companyId, chatId, { state: "SUBMITTING" })
  await editCard(bot, chatId, session.cardMessageId, botText(lang, "submitting"))
  try {
    const ctx = await getLinearContext(bot.companyId)
    if (!ctx) throw new Error(botText(lang, "linearNotConfigured"))
    // Takım: session'daki seçim; sabit-takım erişiminde teamAccess yedeği.
    // Global default / ilk-takım fallback'i BİLİNÇLİ olarak yok.
    const teamId =
      session.teamId ??
      (op.teamAccess && op.teamAccess !== "all" ? op.teamAccess : null)
    if (!teamId) throw new Error(botText(lang, "noTeams"))
    const teams = await getTeams(ctx).catch(() => [])
    const teamName = teams.find((t) => t.id === teamId)?.name ?? "Telegram"
    // Başlık operatörün girdiği başlık segmenti; (eski oturum güvenliği için)
    // yoksa açıklamanın ilk satırından türet.
    const title =
      segTitle(session.draftSegments) ??
      deriveTitle(lang, session.draftText ?? "", teamName)
    const result = await createTelegramIssue(ctx, bot.api, {
      from: cb.from,
      chatId,
      sourceMessageId: cb.message?.message_id ?? null,
      teamId,
      teamName,
      priority: (session.priority ?? 4) as IssuePriority,
      title,
      text: session.draftText ?? "",
      photoFileIds: session.draftPhotos,
      idempotencyKey: session.idempotencyKey ?? crypto.randomUUID(),
      lang,
    })
    const message = [
      botText(lang, "successHeader", { identifier: result.identifier }),
      "",
      `${botText(lang, "confirmTeam")}: ${teamName}`,
      `${botText(lang, "confirmPriority")}: ${priorityText(lang, session.priority)}`,
      ...(result.uploaded > 0
        ? [`${botText(lang, "confirmImages")}: ${result.uploaded}`]
        : []),
    ].join("\n")
    await editCard(bot, chatId, session.cardMessageId, message)
    await clearSession(bot.companyId, chatId)
  } catch (e) {
    await patchSession(bot.companyId, chatId, { state: "AWAIT_CONFIRM" })
    await editCard(
      bot,
      chatId,
      session.cardMessageId,
      botText(lang, "submitFailed", {
        error: (e as Error).message,
        submit: botText(lang, "btnSubmit"),
      }),
      confirmKeyboard(lang, op),
    )
  }
}

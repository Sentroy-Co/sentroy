/**
 * Engellenen gönderici (inbox-block) mailleri için mail-server temizliği.
 *
 * Güvenlik kararı: bloklanan göndericiden gelen mailler artık yalnız UI'da
 * gizlenmez — mail-server'dan KALICI silinir (okunmamış sayacında sayılmaya
 * devam etmesin + güvenlik). Bunun bedeli: block kaldırılınca o eski mailler
 * geri gelmez. Bu, [[inbox-block]] modelinin eski "sadece gizle" davranışını
 * operatörün açık talebiyle değiştirir.
 *
 * Tüm fonksiyonlar best-effort: tek tek silme/listeleme hatalarında devam
 * eder, asla çağıranı patlatmaz.
 */

interface MsgLite {
  uid: number
  from?: { address?: string | null } | null
  seen?: boolean
}

/**
 * Minimal yapısal arayüz — mail app'in `SentroyClient`'ı (createSentroyClient)
 * bunu karşılar. Full SDK `Sentroy` tipine bağlanmıyoruz (audience/buckets/…
 * alanları burada gereksiz, ve proxy client onları taşımıyor).
 */
interface InboxCapable {
  inbox: {
    list(params: {
      mailbox?: string
      folder?: string
      page?: number
      limit?: number
      unread?: boolean
    }): Promise<unknown>
    delete(uid: number, mailbox?: string, folder?: string): Promise<unknown>
  }
}

const PAGE_SIZE = 100

/** `inbox.list` cevabının gerçek (server) şekli: `{ data, meta }`. */
async function listPage(
  sentroy: InboxCapable,
  params: { mailbox: string; page: number; limit: number; unread?: boolean },
): Promise<MsgLite[]> {
  const raw = (await sentroy.inbox.list(params)) as { data?: MsgLite[] }
  return raw?.data ?? []
}

function blockedAddr(m: MsgLite, blocked: Set<string>): boolean {
  const a = m.from?.address?.toLowerCase()
  return !!a && blocked.has(a)
}

/** Verilen uid'leri mail-server'dan sil (best-effort). Döner: silinen sayı. */
export async function deleteUids(
  sentroy: InboxCapable,
  mailbox: string,
  uids: number[],
): Promise<number> {
  let deleted = 0
  for (const uid of uids) {
    try {
      await sentroy.inbox.delete(uid, mailbox)
      deleted++
    } catch {
      /* best-effort — bir mail silinemezse diğerlerine devam */
    }
  }
  return deleted
}

/**
 * Bir mailbox'ın INBOX'unu (capped) tarayıp blocked gönderici(ler)den gelen
 * tüm mailleri siler. Pagination drift'i önlemek için önce eşleşen uid'ler
 * toplanır, sonra silinir (IMAP uid'leri stabil).
 */
export async function purgeBlockedSenders(
  sentroy: InboxCapable,
  mailbox: string,
  blocked: Set<string>,
  opts?: { maxPages?: number },
): Promise<{ deleted: number }> {
  if (blocked.size === 0) return { deleted: 0 }
  const maxPages = opts?.maxPages ?? 20
  const uids: number[] = []
  for (let page = 1; page <= maxPages; page++) {
    let data: MsgLite[]
    try {
      data = await listPage(sentroy, { mailbox, page, limit: PAGE_SIZE })
    } catch {
      break
    }
    if (data.length === 0) break
    for (const m of data) if (blockedAddr(m, blocked)) uids.push(m.uid)
    if (data.length < PAGE_SIZE) break
  }
  const deleted = await deleteUids(sentroy, mailbox, uids)
  return { deleted }
}

/**
 * Okunmamış maillerden blocked gönderici(ler)e ait olanların sayısını döner.
 * Notifications badge sayımından düşmek için (capped scan — yalnız block
 * varsa çağrılır). Mail-server unread toplamı server-side filtrelenemediği
 * için ilk `maxScan` okunmamışı tarayıp blocked olanları sayarız.
 */
export async function countBlockedUnread(
  sentroy: InboxCapable,
  mailbox: string,
  blocked: Set<string>,
  opts?: { maxScan?: number },
): Promise<number> {
  if (blocked.size === 0) return 0
  const maxScan = opts?.maxScan ?? 200
  let blockedUnread = 0
  let scanned = 0
  for (let page = 1; scanned < maxScan; page++) {
    let data: MsgLite[]
    try {
      data = await listPage(sentroy, {
        mailbox,
        page,
        limit: PAGE_SIZE,
        unread: true,
      })
    } catch {
      break
    }
    if (data.length === 0) break
    scanned += data.length
    for (const m of data) if (blockedAddr(m, blocked)) blockedUnread++
    if (data.length < PAGE_SIZE) break
  }
  return blockedUnread
}

/**
 * Liste route'u için sayfa-scoped ayıklama: dönen mesajlardan blocked
 * olanları çıkarır ve (fire-and-forget) mail-server'dan siler. Ekstra tarama
 * yok — zaten çekilmiş sayfayı kullanır, hot-path'i yormaz.
 */
export async function filterAndPurgePage<T extends MsgLite>(
  sentroy: InboxCapable,
  mailbox: string,
  messages: T[],
  blocked: Set<string>,
): Promise<T[]> {
  if (blocked.size === 0) return messages
  const visible: T[] = []
  const blockedUids: number[] = []
  for (const m of messages) {
    if (blockedAddr(m, blocked)) blockedUids.push(m.uid)
    else visible.push(m)
  }
  if (blockedUids.length > 0) {
    // Sayfadaki blocked mailler azdır; await edip silinenleri kesinleştir.
    await deleteUids(sentroy, mailbox, blockedUids)
  }
  return visible
}

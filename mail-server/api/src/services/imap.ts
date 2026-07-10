import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { categorize, type MailCategory } from './mail-categorizer';

// ── Types ──

export interface ListOptions {
  page: number;
  limit: number;
  unreadOnly?: boolean;
  mailbox?: string;
}

export interface MessageSummary {
  uid: number;
  subject: string;
  from: { name: string; address: string };
  to: { name: string; address: string }[];
  date: string;
  seen: boolean;
  flagged: boolean;
  size: number;
  hasAttachments: boolean;
  preview: string;
  /** RFC 5322 Message-ID — thread bagi icin */
  messageId: string | null;
  /** Bu mesaj baska bir mesaja yanit ise onun Message-ID'si */
  inReplyTo: string | null;
  /** Otomatik kategorizasyon sonucu */
  category: MailCategory;
}

export interface MessageDetail {
  uid: number;
  subject: string;
  from: { name: string; address: string };
  to: { name: string; address: string }[];
  cc: { name: string; address: string }[];
  replyTo: { name: string; address: string } | null;
  date: string;
  seen: boolean;
  flagged: boolean;
  textBody: string | null;
  htmlBody: string | null;
  attachments: AttachmentInfo[];
  headers: Record<string, string>;
  /** RFC 5322 Message-ID — thread bagi icin */
  messageId: string | null;
  /** Bu mesaj baska bir mesaja yanit ise onun Message-ID'si */
  inReplyTo: string | null;
  /** Thread'deki onceki Message-ID'lerin tam zinciri */
  references: string[];
}

export interface AttachmentInfo {
  partId: string;
  filename: string;
  size: number;
  contentType: string;
  contentId: string | null;
}

export interface SearchOptions {
  text?: string;
  from?: string;
  subject?: string;
  since?: string;
  before?: string;
  mailbox?: string;
}

// ── Connection Pool ──

interface PooledConnection {
  client: ImapFlow;
  inUse: boolean;
  lastUsed: number;
  user: string;
}

class ImapConnectionPool {
  // Her kullanıcı email'i için ayrı pool havuzu
  private pools = new Map<string, PooledConnection[]>();
  private maxSizePerUser: number;
  private cleanupTimer: NodeJS.Timeout;

  constructor(maxSize = 5) {
    this.maxSizePerUser = maxSize;
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * İstenen kullanıcı hesabı için bir bağlantı döner.
   * - email verilmezse veya sistem kullanıcısı ise: IMAP_USER/IMAP_PASS ile direkt auth
   * - email verildiyse: IMAP_MASTER_USER/IMAP_MASTER_PASS ile master auth (user*master)
   */
  async acquire(email?: string): Promise<ImapFlow> {
    const targetUser =
      email || process.env.IMAP_USER || '';

    if (!targetUser) {
      throw new Error('IMAP target user not configured');
    }

    // Mevcut idle bağlantı var mı?
    const pool = this.pools.get(targetUser) || [];
    const idle = pool.find((c) => !c.inUse && c.client.usable);
    if (idle) {
      idle.inUse = true;
      idle.lastUsed = Date.now();
      return idle.client;
    }

    // Pool dolu mu? En eski idle'ı kapat
    if (pool.length >= this.maxSizePerUser) {
      const oldestIdle = pool
        .filter((c) => !c.inUse)
        .sort((a, b) => a.lastUsed - b.lastUsed)[0];

      if (oldestIdle) {
        try { await oldestIdle.client.logout(); } catch {}
        this.pools.set(
          targetUser,
          pool.filter((c) => c !== oldestIdle),
        );
      }
    }

    // Yeni bağlantı yapılandırması
    const auth = this.buildAuth(targetUser);

    const client = new ImapFlow({
      host: process.env.IMAP_HOST || 'dovecot',
      port: parseInt(process.env.IMAP_PORT || '143', 10),
      secure: false,
      auth,
      logger: false,
      tls: { rejectUnauthorized: false },
    });

    client.on('error', (err: Error) => {
      console.error(`[IMAP] connection error for ${targetUser}:`, err.message);
    });

    await client.connect();

    const entry: PooledConnection = {
      client,
      inUse: true,
      lastUsed: Date.now(),
      user: targetUser,
    };

    const updated = [...(this.pools.get(targetUser) || []), entry];
    this.pools.set(targetUser, updated);
    return client;
  }

  /**
   * Kimlik bilgilerini oluşturur:
   * - Sistem kullanıcısı (IMAP_USER) için düz şifre
   * - Diğer kullanıcılar için master user proxy auth (user*master)
   */
  private buildAuth(targetUser: string): { user: string; pass: string } {
    const systemUser = process.env.IMAP_USER || '';
    const systemPass = process.env.IMAP_PASS || '';
    const masterUser = process.env.IMAP_MASTER_USER || '';
    const masterPass = process.env.IMAP_MASTER_PASS || '';

    if (targetUser === systemUser) {
      return { user: systemUser, pass: systemPass };
    }

    if (!masterUser || !masterPass) {
      throw new Error(
        `IMAP_MASTER_USER/IMAP_MASTER_PASS required to access mailbox ${targetUser}`,
      );
    }

    return { user: `${targetUser}*${masterUser}`, pass: masterPass };
  }

  release(client: ImapFlow): void {
    for (const [, entries] of this.pools) {
      const entry = entries.find((c) => c.client === client);
      if (entry) {
        entry.inUse = false;
        entry.lastUsed = Date.now();
        return;
      }
    }
  }

  private cleanup(): void {
    const staleThreshold = Date.now() - 5 * 60_000;

    for (const [user, entries] of this.pools) {
      const stale = entries.filter(
        (c) => !c.inUse && c.lastUsed < staleThreshold,
      );
      for (const entry of stale) {
        try { entry.client.logout(); } catch {}
      }
      const remaining = entries.filter(
        (c) => c.inUse || c.lastUsed >= staleThreshold,
      );
      if (remaining.length === 0) {
        this.pools.delete(user);
      } else {
        this.pools.set(user, remaining);
      }
    }
  }

  async destroy(): Promise<void> {
    clearInterval(this.cleanupTimer);
    for (const [, entries] of this.pools) {
      for (const entry of entries) {
        try { await entry.client.logout(); } catch {}
      }
    }
    this.pools.clear();
  }
}

// Singleton pool
let pool: ImapConnectionPool | null = null;

function getPool(): ImapConnectionPool {
  if (!pool) {
    pool = new ImapConnectionPool(
      parseInt(process.env.IMAP_POOL_SIZE || '5', 10)
    );
  }
  return pool;
}

// ── Category count cache ───────────────────────────────────────────────────
// listMailboxes her çağrıda INBOX'ı baştan tarayıp Promotions/Updates/
// Receipts/Social sayılarını yeniden hesaplıyordu. Yoğun mailbox'larda
// bu birkaç saniyelik event-loop bloklaması demekti ve UI sürekli aynı
// veriyi yeniliyordu. Kullanıcı başına 30sn TTL'lik bir önbellek tutuyoruz —
// taze olmayan istekler full-scan yapar, taze olanlar mevcut sayıları döner.
const CATEGORY_COUNT_TTL_MS = 30_000;
type CategoryCounts = Record<'promotions' | 'updates' | 'receipts' | 'social', { total: number; unread: number }>;
const categoryCountCache = new Map<string, { counts: CategoryCounts; cachedAt: number }>();

// ── Helpers ──

/**
 * `BODY[HEADER.FIELDS (...)]` cevabını ucuzca regex ile çözer. simpleParser
 * tüm gövdeyi parse etmek için yapılmış (CPU-heavy); kategorizasyon için
 * yalnızca birkaç başlığı görmek yeterli olduğundan bu hafif yol kullanılır.
 *
 * `headers` parametresi imapflow tarafından Buffer olarak verilir; `\r\n`
 * ile satırlara böler, `Header: value` formatını ayrıştırır, devam satırlarını
 * (`\t` veya boşlukla başlayanlar) ekler. Lower-case key'lerle dönülür ki
 * categorize() her iki casing'i de görmeden çalışsın.
 */
function parseHeaderFieldsBuffer(buf: Buffer | string | undefined | null): Record<string, string> {
  if (!buf) return {};
  const text = typeof buf === 'string' ? buf : buf.toString('utf8');
  const result: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let lastKey: string | null = null;
  for (const raw of lines) {
    if (!raw) {
      lastKey = null;
      continue;
    }
    if (/^[\t ]/.test(raw) && lastKey) {
      // header continuation
      result[lastKey] += ' ' + raw.trim();
      continue;
    }
    const idx = raw.indexOf(':');
    if (idx <= 0) continue;
    const key = raw.slice(0, idx).trim().toLowerCase();
    const value = raw.slice(idx + 1).trim();
    if (key) {
      result[key] = value;
      lastKey = key;
    }
  }
  return result;
}

/** Kategorizasyon için yeterli olan minimum header seti. */
const CATEGORIZE_HEADER_FIELDS = [
  'list-unsubscribe',
  'precedence',
  'auto-submitted',
];

function parseAddress(addr: any): { name: string; address: string } {
  if (!addr) return { name: '', address: '' };
  if (Array.isArray(addr)) addr = addr[0];
  return {
    name: addr?.name || '',
    address: addr?.address || '',
  };
}

function parseAddressList(addrs: any): { name: string; address: string }[] {
  if (!addrs) return [];
  if (!Array.isArray(addrs)) addrs = [addrs];
  return addrs.map((a: any) => ({
    name: a?.name || '',
    address: a?.address || '',
  }));
}

function hasAttachmentParts(structure: any): boolean {
  if (!structure) return false;
  if (structure.disposition === 'attachment') return true;
  if (structure.childNodes) {
    return structure.childNodes.some((n: any) => hasAttachmentParts(n));
  }
  return false;
}

function extractAttachmentInfo(structure: any, parts: AttachmentInfo[] = []): AttachmentInfo[] {
  if (!structure) return parts;

  if (structure.disposition === 'attachment' || structure.disposition === 'inline') {
    if (structure.parameters?.name || structure.dispositionParameters?.filename) {
      // imapflow occasionally returns `subtype` as a slash-joined
      // string ("png/octet-stream") when the IMAP BODYSTRUCTURE has
      // unexpected fields — keep only the first segment so the
      // resulting MIME stays valid (`image/png`, not `image/png/octet-stream`).
      const rawType = structure.type || 'application';
      const rawSubtype = (structure.subtype || 'octet-stream').toString();
      const cleanType = rawType.split('/')[0];
      const cleanSubtype = rawSubtype.split('/')[0];
      parts.push({
        partId: structure.part || '',
        filename: structure.dispositionParameters?.filename || structure.parameters?.name || 'unknown',
        size: structure.size || 0,
        contentType: `${cleanType}/${cleanSubtype}`,
        contentId: structure.id || null,
      });
    }
  }

  if (structure.childNodes) {
    for (const child of structure.childNodes) {
      extractAttachmentInfo(child, parts);
    }
  }

  return parts;
}

// ── Service ──

export class ImapService {
  private client: ImapFlow | null = null;

  async init(email?: string): Promise<void> {
    this.client = await getPool().acquire(email);
  }

  release(): void {
    if (this.client) {
      getPool().release(this.client);
      this.client = null;
    }
  }

  private getClient(): ImapFlow {
    if (!this.client) throw new Error('ImapService not initialized — call init() first');
    return this.client;
  }

  /**
   * Tek bir IMAP klasorunun mesajlarini fetch eder.
   * Internal helper — listMessages tarafindan kullanilir.
   */
  private async fetchFolderMessages(
    folder: string,
    unreadOnly: boolean,
    folderTag?: string,
  ): Promise<MessageSummary[]> {
    const client = this.getClient();
    let lock;
    try {
      lock = await client.getMailboxLock(folder);
    } catch {
      return []; // klasor yoksa veya erisilemezse bos don
    }

    try {
      const mb = client.mailbox;
      const totalCount =
        mb && typeof mb === 'object' && 'exists' in mb
          ? (mb as any).exists as number
          : 0;

      if (totalCount === 0) return [];

      const messages: MessageSummary[] = [];
      const query: any = unreadOnly ? { seen: false } : { all: true };

      // Kategorizasyon için tüm header bloğunu indirip simpleParser ile
      // ayrıştırmak yerine yalnızca gerekli üç başlığı isteyip ucuz regex
      // ile çözüyoruz. Büyük INBOX'larda mailparser per-message çağrıları
      // olduğu için event loop dakikalarca bloklanabiliyordu.
      for await (const msg of client.fetch(query, {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true,
        headers: CATEGORIZE_HEADER_FIELDS,
      })) {
        const envelope = msg.envelope!;
        const flags = msg.flags!;

        const rawHeaders = parseHeaderFieldsBuffer(msg.headers as any);

        const fromAddr = parseAddress(envelope.from);
        const msgSubject = envelope.subject || '';
        const msgInReplyTo = envelope.inReplyTo || null;

        const category = categorize({
          from: fromAddr.address,
          subject: msgSubject,
          headers: rawHeaders,
          inReplyTo: msgInReplyTo,
        });

        messages.push({
          uid: msg.uid,
          subject: msgSubject,
          from: fromAddr,
          to: parseAddressList(envelope.to),
          date: envelope.date?.toISOString() || '',
          seen: flags.has('\\Seen'),
          flagged: flags.has('\\Flagged'),
          size: msg.size || 0,
          hasAttachments: hasAttachmentParts(msg.bodyStructure),
          preview: '',
          messageId: envelope.messageId || null,
          inReplyTo: msgInReplyTo,
          category,
        });
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  /** Sanal kategori klasor path'leri — __CAT_promotions__ vb. */
  private static readonly VIRTUAL_CATEGORIES: Record<string, MailCategory> = {
    __CAT_promotions__: 'promotions',
    __CAT_updates__: 'updates',
    __CAT_receipts__: 'receipts',
    __CAT_social__: 'social',
  };

  async listMessages(
    options: ListOptions
  ): Promise<{ messages: MessageSummary[]; totalCount: number }> {
    const mailbox = options.mailbox || 'INBOX';

    let messages: MessageSummary[];

    const virtualCategory = ImapService.VIRTUAL_CATEGORIES[mailbox];

    if (mailbox === '__ALL__' || virtualCategory) {
      // Virtual folder — INBOX mesajlarini tara (kategoriler INBOX'tan filtrelenir)
      // __ALL__ icin tum klasorler taranir
      if (mailbox === '__ALL__') {
        const client = this.getClient();
        const folders = await client.list();
        const allMessages: MessageSummary[] = [];
        // Spam ve Trash klasorlerini haric tut
        const excluded = new Set(['\\Junk', '\\Trash']);
        const excludedPaths = new Set(['Spam', 'Junk', 'Trash']);
        for (const f of folders) {
          const su = (f as any).specialUse as string | undefined;
          if (su && excluded.has(su)) continue;
          if (excludedPaths.has(f.path)) continue;
          const msgs = await this.fetchFolderMessages(
            f.path,
            !!options.unreadOnly,
            f.path,
          );
          allMessages.push(...msgs);
        }
        messages = allMessages;
      } else {
        // Kategori virtual folder — sadece INBOX'tan filtrele
        const inboxMsgs = await this.fetchFolderMessages(
          'INBOX',
          !!options.unreadOnly,
        );
        messages = inboxMsgs.filter((m) => m.category === virtualCategory);
      }
    } else {
      messages = await this.fetchFolderMessages(
        mailbox,
        !!options.unreadOnly,
      );
    }

    // En yeni önce, sonra sayfalama
    messages.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const paged = messages.slice(
      (options.page - 1) * options.limit,
      options.page * options.limit
    );

    return {
      messages: paged,
      totalCount: messages.length,
    };
  }

  async getMessage(uid: number, mailbox = 'INBOX'): Promise<MessageDetail | null> {
    const client = this.getClient();
    const lock = await client.getMailboxLock(mailbox);

    try {
      const result = await client.fetchOne(
        String(uid),
        {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          source: true,
        },
        { uid: true }
      );

      if (!result) return null;

      const envelope = result.envelope!;
      const flags = result.flags!;

      // mailparser ile source'u parse et → text/html body ayır
      let textBody: string | null = null;
      let htmlBody: string | null = null;
      const headers: Record<string, string> = {};

      if (result.source) {
        const parsed: ParsedMail = await simpleParser(result.source);
        textBody = parsed.text || null;
        htmlBody = parsed.html || null;

        // Önemli header'ları çıkar
        for (const [key, value] of parsed.headers) {
          if (typeof value === 'string') {
            headers[key] = value;
          } else if (value && typeof value === 'object' && 'text' in value) {
            headers[key] = (value as any).text;
          }
        }
      }

      // Attachment bilgilerini bodyStructure'dan çıkar
      const attachments = extractAttachmentInfo(result.bodyStructure);

      // References header — bosluklarla ayrilmis Message-ID listesi
      const refsRaw = headers['references'] || headers['References'] || '';
      const references = refsRaw
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.startsWith('<') && s.endsWith('>'));

      return {
        uid: result.uid,
        subject: envelope.subject || '',
        from: parseAddress(envelope.from),
        to: parseAddressList(envelope.to),
        cc: parseAddressList(envelope.cc),
        replyTo: envelope.replyTo?.[0] ? parseAddress(envelope.replyTo) : null,
        date: envelope.date?.toISOString() || '',
        seen: flags.has('\\Seen'),
        flagged: flags.has('\\Flagged'),
        textBody,
        htmlBody,
        attachments,
        headers,
        messageId: envelope.messageId || null,
        inReplyTo: envelope.inReplyTo || null,
        references,
      };
    } finally {
      lock.release();
    }
  }

  async markAsRead(uid: number, mailbox = 'INBOX'): Promise<void> {
    const client = this.getClient();
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  }

  async markAsUnread(uid: number, mailbox = 'INBOX'): Promise<void> {
    const client = this.getClient();
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  }

  async toggleFlag(uid: number, flag: string, mailbox = 'INBOX'): Promise<void> {
    const client = this.getClient();
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(String(uid), { uid: true, flags: true }, { uid: true });
      if (!msg) return;

      if (msg.flags?.has(flag)) {
        await client.messageFlagsRemove(String(uid), [flag], { uid: true });
      } else {
        await client.messageFlagsAdd(String(uid), [flag], { uid: true });
      }
    } finally {
      lock.release();
    }
  }

  async deleteMessage(uid: number, mailbox = 'INBOX'): Promise<void> {
    const client = this.getClient();
    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.messageDelete(String(uid), { uid: true });
    } finally {
      lock.release();
    }
  }

  async moveMessage(uid: number, fromMailbox: string, toMailbox: string): Promise<void> {
    const client = this.getClient();
    const lock = await client.getMailboxLock(fromMailbox);
    try {
      await client.messageMove(String(uid), toMailbox, { uid: true });
    } finally {
      lock.release();
    }
  }

  async getAttachments(uid: number, mailbox = 'INBOX'): Promise<AttachmentInfo[]> {
    const client = this.getClient();
    const lock = await client.getMailboxLock(mailbox);
    try {
      const result = await client.fetchOne(
        String(uid),
        { uid: true, bodyStructure: true },
        { uid: true }
      );

      if (!result) return [];
      return extractAttachmentInfo(result.bodyStructure);
    } finally {
      lock.release();
    }
  }

  async downloadAttachment(
    uid: number,
    partId: string,
    mailbox = 'INBOX'
  ): Promise<{ content: Buffer; filename: string; contentType: string } | null> {
    const client = this.getClient();
    const lock = await client.getMailboxLock(mailbox);
    try {
      const result = await client.fetchOne(
        String(uid),
        { uid: true, source: true, bodyStructure: true },
        { uid: true }
      );

      if (!result) return null;
      const msg = result as any;
      if (!msg.source) return null;

      const parsed = await simpleParser(msg.source);
      const attachment = parsed.attachments?.find(
        (att) => att.contentDisposition === 'attachment' || att.contentDisposition === 'inline'
      );

      // partId ile eşleştirme dene, yoksa index ile
      const allAttachments = parsed.attachments || [];
      const partIndex = parseInt(partId, 10);
      const target = !isNaN(partIndex) && partIndex < allAttachments.length
        ? allAttachments[partIndex]
        : allAttachments[0];

      if (!target) return null;

      return {
        content: target.content,
        filename: target.filename || 'download',
        contentType: target.contentType || 'application/octet-stream',
      };
    } finally {
      lock.release();
    }
  }

  async search(options: SearchOptions): Promise<MessageSummary[]> {
    const client = this.getClient();
    const mailbox = options.mailbox || 'INBOX';
    const lock = await client.getMailboxLock(mailbox);

    try {
      const query: any = {};
      if (options.text) query.body = options.text;
      if (options.from) query.from = options.from;
      if (options.subject) query.subject = options.subject;
      if (options.since) query.since = options.since;
      if (options.before) query.before = options.before;

      const messages: MessageSummary[] = [];

      for await (const msg of client.fetch(query, {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true,
      })) {
        const envelope = msg.envelope!;
        const flags = msg.flags!;

        const fromAddr = parseAddress(envelope.from);
        const subj = envelope.subject || '';
        const irt = envelope.inReplyTo || null;

        messages.push({
          uid: msg.uid,
          subject: subj,
          from: fromAddr,
          to: parseAddressList(envelope.to),
          date: envelope.date?.toISOString() || '',
          seen: flags.has('\\Seen'),
          flagged: flags.has('\\Flagged'),
          size: msg.size || 0,
          hasAttachments: hasAttachmentParts(msg.bodyStructure),
          preview: '',
          messageId: envelope.messageId || null,
          inReplyTo: irt,
          category: categorize({ from: fromAddr.address, subject: subj, inReplyTo: irt }),
        });
      }

      return messages;
    } finally {
      lock.release();
    }
  }

  async listMailboxes(): Promise<{ name: string; path: string; specialUse: string | null; totalMessages: number; unreadMessages: number }[]> {
    const client = this.getClient();
    // statusQuery ile tek cagri — LIST-STATUS (RFC 5819) kullanir
    const mailboxes = await client.list({
      statusQuery: { messages: true, unseen: true },
    });

    const results = [];
    let allTotal = 0;
    let allUnread = 0;

    // All folder hesaplamasinda Spam ve Trash haric tutulur
    const excludedSpecialUse = new Set(['\\Junk', '\\Trash']);
    const excludedPaths = new Set(['Spam', 'Junk', 'Trash']);

    for (const mb of mailboxes) {
      // \Noselect flag'li folder'lari atla (namespace parent'lar, secilemez)
      if ((mb as any).flags?.has?.('\\Noselect')) continue;

      const status = (mb as any).status as { messages?: number; unseen?: number } | undefined;
      let total = status?.messages ?? 0;
      let unread = status?.unseen ?? 0;

      // statusQuery calismadiysa fallback
      if (!status) {
        try {
          const s = await client.status(mb.path, { messages: true, unseen: true });
          total = s.messages || 0;
          unread = s.unseen || 0;
        } catch {}
      }

      const su = (mb as any).specialUse as string | undefined;
      const isExcluded =
        (su && excludedSpecialUse.has(su)) || excludedPaths.has(mb.path);

      if (!isExcluded) {
        allTotal += total;
        allUnread += unread;
      }

      results.push({
        name: mb.name,
        path: mb.path,
        specialUse: su || null,
        totalMessages: total,
        unreadMessages: unread,
      });
    }

    // "All" virtual folder — tum klasorlerin toplami
    results.unshift({
      name: 'All',
      path: '__ALL__',
      specialUse: '\\All',
      totalMessages: allTotal,
      unreadMessages: allUnread,
    });

    // Sanal kategori klasorleri — INBOX mesajlarindan hesaplanir (eger INBOX varsa)
    // UI'da "Promotions (3)" gostermek icin count gerekli; ama INBOX'i her
    // listMailboxes cagrisinda taramak (mailparser ile) saniyelerce surebilir.
    // Bu yuzden kullanici basina kisa TTL'li bir cache tutuyoruz; cache miss
    // halinde tarama yapilir, bos kategoriler dahil tum sayilar dolar.
    try {
      const cacheKey = (this.client as any)?.options?.auth?.user || '__system__';
      const cached = categoryCountCache.get(cacheKey);
      let catCounts: CategoryCounts;

      if (cached && Date.now() - cached.cachedAt < CATEGORY_COUNT_TTL_MS) {
        catCounts = cached.counts;
      } else {
        const inboxMsgs = await this.fetchFolderMessages('INBOX', false);
        catCounts = {
          promotions: { total: 0, unread: 0 },
          updates: { total: 0, unread: 0 },
          receipts: { total: 0, unread: 0 },
          social: { total: 0, unread: 0 },
        };
        for (const m of inboxMsgs) {
          if (m.category !== 'primary' && catCounts[m.category]) {
            catCounts[m.category].total++;
            if (!m.seen) catCounts[m.category].unread++;
          }
        }
        categoryCountCache.set(cacheKey, { counts: catCounts, cachedAt: Date.now() });
      }

      const categoryFolders: { name: string; path: string; specialUse: string; totalMessages: number; unreadMessages: number }[] = [
        { name: 'Promotions', path: '__CAT_promotions__', specialUse: '\\Promotions', totalMessages: catCounts.promotions.total, unreadMessages: catCounts.promotions.unread },
        { name: 'Updates', path: '__CAT_updates__', specialUse: '\\Updates', totalMessages: catCounts.updates.total, unreadMessages: catCounts.updates.unread },
        { name: 'Receipts', path: '__CAT_receipts__', specialUse: '\\Receipts', totalMessages: catCounts.receipts.total, unreadMessages: catCounts.receipts.unread },
        { name: 'Social', path: '__CAT_social__', specialUse: '\\Social', totalMessages: catCounts.social.total, unreadMessages: catCounts.social.unread },
      ];

      // Sadece en az 1 mesaji olan kategorileri ekle — bos kategorileri gizle
      const inboxIdx = results.findIndex((r) => r.path === 'INBOX');
      const insertAt = inboxIdx >= 0 ? inboxIdx + 1 : results.length;
      const nonEmpty = categoryFolders.filter((c) => c.totalMessages > 0);
      results.splice(insertAt, 0, ...nonEmpty);
    } catch {
      // INBOX taranamadiysa kategori klasorleri gosterilmez — sorun degil
    }

    return results;
  }

  // ── Folder CRUD ──────────────────────────────────────────────────────────

  async createFolder(path: string): Promise<void> {
    const client = this.getClient();
    await client.mailboxCreate(path);
    // Dovecot'ta yeni klasorun list()'te gorunmesi icin subscribe gerekebilir
    try {
      await client.mailboxSubscribe(path);
    } catch {
      // subscribe desteklenmiyorsa sorun degil
    }
  }

  async renameFolder(oldPath: string, newPath: string): Promise<void> {
    const client = this.getClient();
    await client.mailboxRename(oldPath, newPath);
  }

  async deleteFolder(path: string): Promise<void> {
    const client = this.getClient();
    await client.mailboxDelete(path);
  }

  /**
   * Subject bazli thread toplama — INBOX + Sent klasorlerinde konuyla eslesen
   * tum mesajlari bulup tam detayiyla doner.
   *
   * - Her iki klasorde subject SEARCH yapilir
   * - Sonuclar normalize-subject ile filtrelenir (IMAP substring eşleşmesinden
   *   daha kesin)
   * - messageId bazli dedupe
   * - Kronolojik siralama (eskiden yeniye)
   *
   * @param subject - Thread'in ana konusu (Re:/Fwd: dahil, normalize server'da yapilir)
   * @param folders - Aramanin yapilacagi klasorler (varsayilan: INBOX + Sent)
   */
  async getThread(
    subject: string,
    folders?: string[],
  ): Promise<(MessageDetail & { folder: string })[]> {
    const client = this.getClient();

    // Re: / Fwd: prefix'leri strip — normalize
    const normSubject = subject
      .replace(/^(Re|Fwd|Fw|Ynt|Yanit|İlt):\s*/gi, '')
      .trim();

    if (!normSubject) return [];

    // Hangi klasorlerde arayacagiz
    let targetFolders = folders ?? ['INBOX'];
    if (!folders) {
      // Sent klasorunu otomatik bul
      try {
        const mailboxes = await client.list();
        const sent = mailboxes.find(
          (m) => (m as any).specialUse === '\\Sent',
        );
        if (sent) targetFolders.push(sent.path);
        else {
          const sentByName = mailboxes.find((m) => m.path === 'Sent');
          if (sentByName) targetFolders.push(sentByName.path);
        }
      } catch {
        // Sent bulunamazsa sadece INBOX'ta ara
      }
    }

    // Dedupe icin messageId seti
    const seenMids = new Set<string>();
    const results: (MessageDetail & { folder: string })[] = [];

    for (const folder of targetFolders) {
      let lock;
      try {
        lock = await client.getMailboxLock(folder);
      } catch {
        continue; // Klasor yoksa atla
      }

      try {
        // IMAP SEARCH SUBJECT — substring eslesme (IMAP standardı)
        const uids: number[] = [];
        for await (const msg of client.fetch(
          { subject: normSubject },
          {
            uid: true,
            envelope: true,
            flags: true,
            bodyStructure: true,
            source: true,
          },
        )) {
          const envelope = msg.envelope!;
          const msgSubject = envelope.subject || '';

          // Normalize subject karsilastirma — IMAP substring eslesmesi fazla
          // genis olabilir, burada kesin eslestiriyoruz
          const msgNorm = msgSubject
            .replace(/^(Re|Fwd|Fw|Ynt|Yanit|İlt):\s*/gi, '')
            .trim();
          if (msgNorm.toLowerCase() !== normSubject.toLowerCase()) continue;

          // messageId dedupe
          const mid = envelope.messageId || null;
          if (mid && seenMids.has(mid)) continue;
          if (mid) seenMids.add(mid);

          const flags = msg.flags!;
          let textBody: string | null = null;
          let htmlBody: string | null = null;
          const headers: Record<string, string> = {};

          if (msg.source) {
            try {
              const parsed = await simpleParser(msg.source);
              textBody = parsed.text || null;
              htmlBody = parsed.html || null;
              for (const [key, value] of parsed.headers) {
                if (typeof value === 'string') {
                  headers[key] = value;
                } else if (value && typeof value === 'object' && 'text' in value) {
                  headers[key] = (value as any).text;
                }
              }
            } catch {}
          }

          const attachments = extractAttachmentInfo(msg.bodyStructure);

          const refsRaw = headers['references'] || headers['References'] || '';
          const references = refsRaw
            .split(/\s+/)
            .map((s) => s.trim())
            .filter((s) => s.startsWith('<') && s.endsWith('>'));

          results.push({
            uid: msg.uid,
            subject: msgSubject,
            from: parseAddress(envelope.from),
            to: parseAddressList(envelope.to),
            cc: parseAddressList(envelope.cc),
            replyTo: envelope.replyTo?.[0] ? parseAddress(envelope.replyTo) : null,
            date: envelope.date?.toISOString() || '',
            seen: flags.has('\\Seen'),
            flagged: flags.has('\\Flagged'),
            textBody,
            htmlBody,
            attachments,
            headers,
            messageId: mid,
            inReplyTo: envelope.inReplyTo || null,
            references,
            folder,
          });
        }
      } finally {
        lock.release();
      }
    }

    // Kronolojik sira
    results.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return results;
  }

  /**
   * Mail gonderildikten sonra raw RFC 822 mesaji gondericinin Sent klasorune
   * ekler. Sent klasoru yoksa olusturulur. Connection pool'dan reused;
   * eskiden her gonderim icin yeni IMAP handshake aciliyordu.
   */
  async appendToSent(rawMessage: Buffer | string, flags: string[] = ['\\Seen']): Promise<void> {
    const client = this.getClient();
    const mailboxes = await client.list();

    let sentPath = mailboxes.find(
      (m) => (m as any).specialUse === '\\Sent',
    )?.path;

    if (!sentPath) {
      sentPath = mailboxes.find((m) => m.path === 'Sent')?.path;
    }

    if (!sentPath) {
      try {
        await client.mailboxCreate('Sent');
      } catch {
        // race condition / already exists — append yine de denenir
      }
      sentPath = 'Sent';
    }

    await client.append(sentPath, rawMessage, flags);
  }

  /**
   * Save a draft into the IMAP `\\Drafts` special-use folder so the
   * dashboard's "Save draft" button mirrors what desktop / mobile mail
   * clients would do. The `\\Draft` flag tags the message as in-progress
   * (RFC 6154 §3.1) — clients filter on it. `\\Seen` keeps it from
   * pretending to be unread mail in the user's folder count.
   */
  async appendToDrafts(rawMessage: Buffer | string, flags: string[] = ['\\Draft', '\\Seen']): Promise<void> {
    const client = this.getClient();
    const mailboxes = await client.list();

    let draftsPath = mailboxes.find(
      (m) => (m as any).specialUse === '\\Drafts',
    )?.path;

    if (!draftsPath) {
      draftsPath = mailboxes.find((m) => m.path === 'Drafts')?.path;
    }

    if (!draftsPath) {
      try {
        await client.mailboxCreate('Drafts');
      } catch {
        // race condition / already exists — append still attempts the path
      }
      draftsPath = 'Drafts';
    }

    await client.append(draftsPath, rawMessage, flags);
  }

  static async destroyPool(): Promise<void> {
    if (pool) {
      await pool.destroy();
      pool = null;
    }
  }
}

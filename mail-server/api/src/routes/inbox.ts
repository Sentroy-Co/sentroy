import { FastifyPluginAsync } from 'fastify';
import MailComposer from 'nodemailer/lib/mail-composer';
import { ImapService } from '../services/imap';
import type { MailCategory } from '../services/mail-categorizer';
import {
  subscribeMailDelivered,
  type MailDeliveredEvent,
} from '../services/events';

/**
 * Her request için pool'dan bağlantı alır, iş bitince geri bırakır.
 * @param email - Hangi kullanıcı hesabına bağlanılacak (undefined = sistem IMAP_USER)
 */
async function withImap<T>(
  email: string | undefined,
  fn: (imap: ImapService) => Promise<T>,
): Promise<T> {
  const imap = new ImapService();
  await imap.init(email);
  try {
    return await fn(imap);
  } finally {
    imap.release();
  }
}

/** mailbox query parametresi '@' içeriyorsa email, değilse undefined döner. */
function extractEmail(mailbox?: string): string | undefined {
  return mailbox && mailbox.includes('@') ? mailbox : undefined;
}

export const inboxRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireScope('read'));

  // GET /inbox — Mailbox listesi (mail listesi)
  fastify.get('/', async (request, reply) => {
    const {
      page = 1,
      limit = 20,
      unread,
      mailbox,
      folder,
    } = request.query as {
      page?: number;
      limit?: number;
      unread?: string;
      mailbox?: string;
      folder?: string;
    };

    // mailbox e-posta adresi olabilir (ör. inbox@...), IMAP klasör adı olarak folder kullan
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      const result = await withImap(extractEmail(mailbox), (imap) =>
        imap.listMessages({
          page: Number(page),
          limit: Number(limit),
          unreadOnly: unread === 'true',
          mailbox: imapFolder,
        })
      );

      return reply.send({
        data: result.messages,
        meta: {
          page: Number(page),
          limit: Number(limit),
          totalCount: result.totalCount,
          totalPages: Math.ceil(result.totalCount / Number(limit)),
        },
      });
    } catch (err) {
      fastify.log.error(err, 'IMAP listMessages failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // GET /inbox/mailboxes — Klasör listesi (INBOX, Sent, Trash, vb.)
  fastify.get('/mailboxes', async (request, reply) => {
    const { mailbox } = request.query as { mailbox?: string };
    try {
      const mailboxes = await withImap(extractEmail(mailbox), (imap) =>
        imap.listMailboxes(),
      );
      return reply.send({ data: mailboxes });
    } catch (err) {
      fastify.log.error(err, 'IMAP listMailboxes failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // GET /inbox/search — IMAP SEARCH
  fastify.get('/search', async (request, reply) => {
    const { q, from, subject, since, before, mailbox, folder } = request.query as {
      q?: string;
      from?: string;
      subject?: string;
      since?: string;
      before?: string;
      mailbox?: string;
      folder?: string;
    };

    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      const results = await withImap(extractEmail(mailbox), (imap) =>
        imap.search({ text: q, from, subject, since, before, mailbox: imapFolder })
      );
      return reply.send({ data: results });
    } catch (err) {
      fastify.log.error(err, 'IMAP search failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // ── Drafts ─────────────────────────────────────────────────────────────

  // POST /inbox/drafts — Saves an in-progress message into the IMAP
  // `\\Drafts` folder so it follows the user across devices and shows
  // up in any IMAP client (Apple Mail, mobile, Outlook). Builds RFC 822
  // server-side from the same compose payload the dashboard would have
  // sent — no LMTP, no queue, just an IMAP `APPEND` with the `\\Draft`
  // flag.
  fastify.post('/drafts', async (request, reply) => {
    const body = request.body as {
      mailbox?: string;
      from?: string;
      to?: string | string[];
      cc?: string | string[];
      replyTo?: string | string[];
      subject?: string;
      html?: string;
      text?: string;
      inReplyTo?: string;
      references?: string[];
      headers?: Record<string, string>;
      attachments?: Array<{
        filename: string;
        content: string;
        contentType?: string;
      }>;
    };

    const mailbox = (body.mailbox || body.from || '').toString().trim();
    if (!mailbox) {
      return reply
        .code(400)
        .send({ data: null, error: 'mailbox or from is required' });
    }

    try {
      const composer = new MailComposer({
        from: body.from || mailbox,
        to: body.to || undefined,
        cc: body.cc || undefined,
        replyTo: body.replyTo || undefined,
        subject: body.subject || '(no subject)',
        html: body.html || undefined,
        text: body.text || undefined,
        inReplyTo: body.inReplyTo || undefined,
        references: body.references || undefined,
        headers: body.headers,
        attachments: body.attachments?.map((att) => ({
          filename: att.filename,
          content: Buffer.from(att.content, 'base64'),
          contentType: att.contentType,
        })),
        date: new Date(),
      });

      const rawMessage = await composer.compile().build();

      await withImap(extractEmail(mailbox), (imap) =>
        imap.appendToDrafts(rawMessage),
      );
      return reply.code(201).send({
        data: { message: 'Draft saved', folder: 'Drafts' },
      });
    } catch (err) {
      fastify.log.error(err, 'IMAP appendToDrafts failed');
      return reply.code(500).send({
        data: null,
        error: err instanceof Error ? err.message : 'Failed to save draft',
      });
    }
  });

  // ── Folder CRUD ────────────────────────────────────────────────────────

  // POST /inbox/folders — Yeni custom folder olustur
  fastify.post('/folders', async (request, reply) => {
    const { mailbox, name } = request.body as { mailbox?: string; name?: string };
    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.code(400).send({ data: null, error: 'Folder name is required' });
    }

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.createFolder(name.trim()),
      );
      return reply.code(201).send({ data: { message: 'Folder created', path: name.trim() } });
    } catch (err) {
      fastify.log.error(err, 'IMAP createFolder failed');
      return reply.code(500).send({
        data: null,
        error: err instanceof Error ? err.message : 'Failed to create folder',
      });
    }
  });

  // PUT /inbox/folders — Rename folder
  fastify.put('/folders', async (request, reply) => {
    const { mailbox, oldPath, newPath } = request.body as {
      mailbox?: string;
      oldPath?: string;
      newPath?: string;
    };
    if (!oldPath || !newPath) {
      return reply.code(400).send({ data: null, error: 'oldPath and newPath are required' });
    }

    // Sistem klasorlerini yeniden adlandirmayi engelle
    const systemPaths = new Set(['INBOX', 'Sent', 'Trash', 'Drafts', 'Spam', 'Junk']);
    if (systemPaths.has(oldPath)) {
      return reply.code(400).send({ data: null, error: 'Cannot rename system folders' });
    }

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.renameFolder(oldPath, newPath.trim()),
      );
      return reply.send({ data: { message: 'Folder renamed', oldPath, newPath: newPath.trim() } });
    } catch (err) {
      fastify.log.error(err, 'IMAP renameFolder failed');
      return reply.code(500).send({
        data: null,
        error: err instanceof Error ? err.message : 'Failed to rename folder',
      });
    }
  });

  // DELETE /inbox/folders?path=X&mailbox=Y — Delete folder
  fastify.delete('/folders', async (request, reply) => {
    const { mailbox, path } = request.query as { mailbox?: string; path?: string };
    if (!path) {
      return reply.code(400).send({ data: null, error: 'Folder path is required' });
    }

    const systemPaths = new Set(['INBOX', 'Sent', 'Trash', 'Drafts', 'Spam', 'Junk']);
    if (systemPaths.has(path)) {
      return reply.code(400).send({ data: null, error: 'Cannot delete system folders' });
    }

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.deleteFolder(path),
      );
      return reply.send({ data: { message: 'Folder deleted', path } });
    } catch (err) {
      fastify.log.error(err, 'IMAP deleteFolder failed');
      return reply.code(500).send({
        data: null,
        error: err instanceof Error ? err.message : 'Failed to delete folder',
      });
    }
  });

  // GET /inbox/thread — Thread mesajlari (INBOX + Sent cross-search)
  //
  // Query: ?mailbox=info@example.com&subject=Project+update
  // Verilen subject'i Re:/Fwd: prefix'lerinden temizleyip INBOX ve Sent
  // klasorlerinde arar. Tum eslesen mesajlari kronolojik sirada doner.
  // Her mesajda `folder` alani hangi klasorden geldigini belirtir.
  fastify.get('/thread', async (request, reply) => {
    const { mailbox, subject } = request.query as {
      mailbox?: string;
      subject?: string;
    };

    if (!subject) {
      return reply.code(400).send({
        data: null,
        error: 'subject query parameter is required',
      });
    }

    try {
      const messages = await withImap(extractEmail(mailbox), (imap) =>
        imap.getThread(subject),
      );
      return reply.send({ data: messages });
    } catch (err) {
      fastify.log.error(err, 'IMAP getThread failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // GET /inbox/:uid — Mail detayı
  fastify.get('/:uid', async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const { mailbox, folder } = request.query as { mailbox?: string; folder?: string };
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      const message = await withImap(extractEmail(mailbox), (imap) =>
        imap.getMessage(Number(uid), imapFolder)
      );

      if (!message) {
        return reply.code(404).send({
          data: null,
          error: 'Message not found',
        });
      }

      return reply.send({ data: message });
    } catch (err) {
      fastify.log.error(err, 'IMAP getMessage failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // POST /inbox/:uid/read — Okundu olarak işaretle
  fastify.post('/:uid/read', async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const { mailbox, folder } = request.query as { mailbox?: string; folder?: string };
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.markAsRead(Number(uid), imapFolder),
      );
      return reply.send({ data: { message: 'Marked as read' } });
    } catch (err) {
      fastify.log.error(err, 'IMAP markAsRead failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // POST /inbox/:uid/unread — Okunmadı olarak işaretle
  fastify.post('/:uid/unread', async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const { mailbox, folder } = request.query as { mailbox?: string; folder?: string };
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.markAsUnread(Number(uid), imapFolder),
      );
      return reply.send({ data: { message: 'Marked as unread' } });
    } catch (err) {
      fastify.log.error(err, 'IMAP markAsUnread failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // POST /inbox/:uid/flag — Mail'i yıldızla / yıldızı kaldır
  fastify.post('/:uid/flag', async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const { mailbox, folder } = request.query as { mailbox?: string; folder?: string };
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.toggleFlag(Number(uid), '\\Flagged', imapFolder),
      );
      return reply.send({ data: { message: 'Flag toggled' } });
    } catch (err) {
      fastify.log.error(err, 'IMAP toggleFlag failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // POST /inbox/:uid/category — Kategori değiştir / kaldır
  // Body: { category: 'promotions'|'updates'|'receipts'|'social'|'primary'|null }
  // null/'primary' → $CatPrimary keyword'u (açık "kategorisiz" işareti).
  fastify.post('/:uid/category', async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const { mailbox, folder } = request.query as { mailbox?: string; folder?: string };
    const { category } = (request.body ?? {}) as { category?: string | null };
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    const target = category == null || category === '' ? 'primary' : String(category);
    const valid = new Set(['primary', 'promotions', 'updates', 'receipts', 'social']);
    if (!valid.has(target)) {
      return reply.code(400).send({
        data: null,
        error: `Invalid category — expected one of: ${[...valid].join(', ')}`,
      });
    }

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.setCategory(Number(uid), target as MailCategory, imapFolder),
      );
      return reply.send({ data: { message: 'Category updated', category: target } });
    } catch (err) {
      fastify.log.error(err, 'IMAP setCategory failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // POST /inbox/:uid/move — Mail'i başka klasöre taşı
  fastify.post('/:uid/move', async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const { from = 'INBOX', to, mailbox } = request.body as {
      from?: string;
      to: string;
      mailbox?: string;
    };

    if (!to) {
      return reply.code(400).send({
        data: null,
        error: 'Target mailbox (to) is required',
      });
    }

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.moveMessage(Number(uid), from, to)
      );
      return reply.send({ data: { message: `Moved to ${to}` } });
    } catch (err) {
      fastify.log.error(err, 'IMAP moveMessage failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // DELETE /inbox/:uid — Mail sil
  fastify.delete('/:uid', async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const { mailbox, folder } = request.query as { mailbox?: string; folder?: string };
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      await withImap(extractEmail(mailbox), (imap) =>
        imap.deleteMessage(Number(uid), imapFolder),
      );
      return reply.send({ data: { message: 'Message deleted' } });
    } catch (err) {
      fastify.log.error(err, 'IMAP deleteMessage failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // GET /inbox/:uid/attachments — Ek listesi
  fastify.get('/:uid/attachments', async (request, reply) => {
    const { uid } = request.params as { uid: string };
    const { mailbox, folder } = request.query as { mailbox?: string; folder?: string };
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      const attachments = await withImap(extractEmail(mailbox), (imap) =>
        imap.getAttachments(Number(uid), imapFolder)
      );
      return reply.send({ data: attachments });
    } catch (err) {
      fastify.log.error(err, 'IMAP getAttachments failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // GET /inbox/:uid/attachments/:partId/download — Ek indir
  fastify.get('/:uid/attachments/:partId/download', async (request, reply) => {
    const { uid, partId } = request.params as { uid: string; partId: string };
    const { mailbox, folder } = request.query as { mailbox?: string; folder?: string };
    const imapFolder = folder || (mailbox?.includes('@') ? 'INBOX' : mailbox);

    try {
      const result = await withImap(extractEmail(mailbox), (imap) =>
        imap.downloadAttachment(Number(uid), partId, imapFolder)
      );

      if (!result) {
        return reply.code(404).send({
          data: null,
          error: 'Attachment not found',
        });
      }

      return reply
        .header('Content-Type', result.contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(result.filename)}"`
        )
        .send(result.content);
    } catch (err) {
      fastify.log.error(err, 'IMAP downloadAttachment failed');
      return reply.code(503).send({
        data: null,
        error: 'IMAP service unavailable',
      });
    }
  });

  // GET /inbox/events — SSE stream: yeni mail geldikçe event fırlatır.
  //
  // Kullanım: ?mailbox=info@example.com,sales@example.com  (virgülle ayrılmış filtre)
  // Hiçbir mailbox verilmezse tüm teslim event'leri yayınlanır (admin scope için).
  //
  // Auth: standart Bearer (fastify.authenticate + requireScope('read')) — UI proxy
  // bu endpoint'i server-to-server çağırır, browser doğrudan bağlanmaz.
  fastify.get('/events', async (request, reply) => {
    const { mailbox } = request.query as { mailbox?: string };
    const filter = mailbox
      ? new Set(
          mailbox
            .split(',')
            .map((m) => m.trim().toLowerCase())
            .filter(Boolean),
        )
      : null;

    // SSE header'ları
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // nginx tamponlamayı kapat
    reply.raw.flushHeaders();

    // İlk keepalive — browser EventSource'a "hello"
    reply.raw.write(': connected\n\n');

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const unsubscribe = subscribeMailDelivered(
      redisUrl,
      (event: MailDeliveredEvent) => {
        if (filter && !filter.has(event.mailbox.toLowerCase())) return;
        try {
          reply.raw.write(
            `event: mail-delivered\ndata: ${JSON.stringify(event)}\n\n`,
          );
        } catch {
          // connection kapanmışsa ignore
        }
      },
    );

    // 25s'de bir keepalive comment — proxy timeout'ları kapanmasın
    const keepalive = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        clearInterval(keepalive);
      }
    }, 25_000);

    // Client disconnect → temizle
    request.raw.on('close', () => {
      clearInterval(keepalive);
      unsubscribe();
      try {
        reply.raw.end();
      } catch {}
    });

    // reply'ı açık tut — fastify return ile kapatmasın
    return reply;
  });

  // Shutdown hook — pool'u temizle
  fastify.addHook('onClose', async () => {
    await ImapService.destroyPool();
  });
};

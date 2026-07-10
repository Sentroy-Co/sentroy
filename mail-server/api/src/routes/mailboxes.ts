import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createDovecotUser,
  deleteDovecotUser,
  listDovecotUsers,
  updateDovecotPassword,
  deleteDovecotUsersByDomain,
} from '../services/dovecot';
import { updateVirtualMailboxes, reloadPostfix } from '../services/postfix';
import { domainScope, callerCompanyId } from '../utils/company-scope';

const createMailboxSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  domainId: z.string().uuid(),
});

const updatePasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const mailboxRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireScope('admin'));

  /**
   * Dovecot + Postfix virtual mailbox dosyalarını senkronize eder.
   * Bu global bir islem — tum company'lerin mailbox'lari ayni Dovecot'ta yasar.
   */
  async function syncMailboxes(): Promise<void> {
    const users = await listDovecotUsers();
    await updateVirtualMailboxes(
      users.map((u) => ({
        email: u.email,
        domain: u.domain,
        user: u.username,
      }))
    );
    await reloadPostfix();
  }

  // POST /mailboxes — Yeni mailbox oluştur
  fastify.post('/', async (request, reply) => {
    const body = createMailboxSchema.parse(request.body);

    // Domain var mı ve caller'a ait mi?
    const domain = await fastify.prisma.domain.findFirst({
      where: { id: body.domainId, ...domainScope(request) },
    });

    if (!domain) {
      return reply.code(404).send({
        data: null,
        error: 'Domain not found',
      });
    }

    // Email domain eşleşmesi
    const emailDomain = body.email.split('@')[1];
    if (emailDomain !== domain.domain) {
      return reply.code(400).send({
        data: null,
        error: `Email must belong to domain ${domain.domain}`,
      });
    }

    try {
      const user = await createDovecotUser(body.email, body.password);
      await syncMailboxes();

      return reply.code(201).send({
        data: {
          email: user.email,
          domain: user.domain,
          username: user.username,
          domainId: body.domainId,
        },
      });
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        return reply.code(409).send({
          data: null,
          error: err.message,
        });
      }
      throw err;
    }
  });

  // GET /mailboxes — Tüm mailbox'ları listele (sistem hesapları gizlenir)
  // Company scoped: sadece caller'in domain'lerine ait mailbox'lar goruniir.
  fastify.get('/', async (request, reply) => {
    const { domainId, includeSystem } = request.query as {
      domainId?: string;
      includeSystem?: string;
    };

    const users = await listDovecotUsers();

    // Sistem hesaplarını (IMAP_USER, SMTP_USER) gizle
    const systemEmails = new Set(
      [process.env.IMAP_USER, process.env.SMTP_USER]
        .filter(Boolean)
        .map((e) => (e as string).toLowerCase()),
    );

    let filtered = users;
    if (includeSystem !== 'true') {
      filtered = filtered.filter(
        (u) => !systemEmails.has(u.email.toLowerCase()),
      );
    }

    // domainId filter — company scope ile birlikte dogrula
    if (domainId) {
      const domain = await fastify.prisma.domain.findFirst({
        where: { id: domainId, ...domainScope(request) },
        select: { domain: true },
      });
      if (!domain) {
        // Domain yok veya bu caller'a ait degil — bos liste don
        return reply.send({ data: [], meta: { totalCount: 0 } });
      }
      filtered = filtered.filter((u) => u.domain === domain.domain);
    } else {
      // domainId yoksa, caller company-scoped ise sadece kendi domain'lerinin
      // mailbox'larina erisim ver. Legacy master (companyId=null) ise tumu.
      const callerCompany = callerCompanyId(request);
      if (callerCompany) {
        const myDomains = await fastify.prisma.domain.findMany({
          where: { companyId: callerCompany },
          select: { domain: true },
        });
        const allowed = new Set(myDomains.map((d) => d.domain));
        filtered = filtered.filter((u) => allowed.has(u.domain));
      }
    }

    return reply.send({
      data: filtered,
      meta: { totalCount: filtered.length },
    });
  });

  // PUT /mailboxes/:email/password — Şifre değiştir
  fastify.put('/:email/password', async (request, reply) => {
    const { email } = request.params as { email: string };
    const body = updatePasswordSchema.parse(request.body);
    const decoded = decodeURIComponent(email);

    // Email'in domain'i caller'a ait olmali
    const emailDomain = decoded.split('@')[1];
    if (!emailDomain) {
      return reply.code(400).send({ data: null, error: 'Invalid email' });
    }
    const domain = await fastify.prisma.domain.findFirst({
      where: { domain: emailDomain, ...domainScope(request) },
      select: { id: true },
    });
    if (!domain) {
      return reply.code(404).send({ data: null, error: 'Mailbox not found' });
    }

    try {
      await updateDovecotPassword(decoded, body.password);
      return reply.send({
        data: { message: 'Password updated successfully' },
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return reply.code(404).send({
          data: null,
          error: err.message,
        });
      }
      throw err;
    }
  });

  // DELETE /mailboxes/:email — Mailbox sil
  fastify.delete('/:email', async (request, reply) => {
    const { email } = request.params as { email: string };
    const decoded = decodeURIComponent(email);

    const emailDomain = decoded.split('@')[1];
    if (!emailDomain) {
      return reply.code(400).send({ data: null, error: 'Invalid email' });
    }
    const domain = await fastify.prisma.domain.findFirst({
      where: { domain: emailDomain, ...domainScope(request) },
      select: { id: true, catchAllMailboxEmail: true },
    });
    if (!domain) {
      return reply.code(404).send({ data: null, error: 'Mailbox not found' });
    }

    // Catch-all anchor'ını silme — önce catch-all'ı disable etmek lazım.
    // UI tarafı zaten catch-all yönetimini ayrı endpoint'le yapıyor; doğrudan
    // anchor silmeye çalışmak silent data-loss riski (ileride alias'a düşen
    // mailler boşa gider). Açık 409 dön, kullanıcı disable et sonra silsin.
    if (
      domain.catchAllMailboxEmail &&
      domain.catchAllMailboxEmail.toLowerCase() === decoded.toLowerCase()
    ) {
      return reply.code(409).send({
        data: null,
        error:
          'Cannot delete catch-all anchor mailbox. Disable catch-all first (PATCH /domains/:id with catchAllMailboxEmail: null).',
      });
    }

    try {
      await deleteDovecotUser(decoded);
      await syncMailboxes();

      return reply.send({
        data: { message: 'Mailbox deleted successfully' },
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        return reply.code(404).send({
          data: null,
          error: err.message,
        });
      }
      throw err;
    }
  });

  // DELETE /mailboxes/domain/:domainId — Domain'e ait tüm mailbox'ları sil
  fastify.delete('/domain/:domainId', async (request, reply) => {
    const { domainId } = request.params as { domainId: string };

    const domain = await fastify.prisma.domain.findFirst({
      where: { id: domainId, ...domainScope(request) },
      select: { domain: true },
    });

    if (!domain) {
      return reply.code(404).send({
        data: null,
        error: 'Domain not found',
      });
    }

    const deleted = await deleteDovecotUsersByDomain(domain.domain);
    if (deleted > 0) {
      await syncMailboxes();
    }

    return reply.send({
      data: { message: `${deleted} mailbox(es) deleted`, count: deleted },
    });
  });
};

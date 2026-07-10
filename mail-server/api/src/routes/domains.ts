import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generateDkim, writeDkimKey, removeDkimKey, updateDkimSigningMap } from '../services/dkim';
import { verifyDomainDns, getDnsRecords } from '../services/dns';
import {
  updateVirtualDomains,
  updateVirtualAliases,
  reloadPostfix,
} from '../services/postfix';
import { domainScope, callerCompanyId } from '../utils/company-scope';

const createDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/),
});

/**
 * Tüm aktif domainler için Postfix ve Rspamd dosyalarını senkronize eder.
 * Bu global bir islem — her company'nin domain'leri ayni Postfix/Rspamd
 * altyapisinda yasiyor.
 */
async function syncInfrastructure(prisma: any): Promise<void> {
  const allDomains = await prisma.domain.findMany({
    where: { status: { in: ['active', 'pending', 'verifying'] } },
    select: { domain: true, dkimSelector: true, catchAllMailboxEmail: true },
  });

  await updateVirtualDomains(allDomains.map((d: any) => d.domain));

  await updateDkimSigningMap(
    allDomains.map((d: any) => ({
      domain: d.domain,
      selector: d.dkimSelector,
    }))
  );

  // Catch-all alias dosyasını her sync'te yeniden yaz — domain set'i
  // değişebilir (yeni domain, silinen domain, transfer). Aktif rule'ları
  // tek pass'te derler.
  const catchAllRules = allDomains
    .filter((d: any) => d.catchAllMailboxEmail)
    .map((d: any) => ({
      domain: d.domain,
      targetEmail: d.catchAllMailboxEmail as string,
    }));
  await updateVirtualAliases(catchAllRules);

  await reloadPostfix();
}

export const domainRoutes: FastifyPluginAsync = async (fastify) => {
  // Tüm domain route'ları admin scope gerektirir
  fastify.addHook('onRequest', fastify.requireScope('admin'));

  // POST /domains — Yeni domain ekle
  fastify.post('/', async (request, reply) => {
    const body = createDomainSchema.parse(request.body);
    const callerCompany = callerCompanyId(request);

    // Domain zaten var mı? (globally unique)
    const existing = await fastify.prisma.domain.findUnique({
      where: { domain: body.domain },
    });

    if (existing) {
      return reply.code(409).send({
        data: null,
        error: 'Domain already exists',
      });
    }

    // DKIM key pair üret
    const { publicKey, privateKey, selector } = await generateDkim(body.domain);

    // DKIM private key'i Rspamd volume'una yaz
    await writeDkimKey(body.domain, selector, privateKey);

    const domain = await fastify.prisma.domain.create({
      data: {
        domain: body.domain,
        status: 'pending',
        dkimSelector: selector,
        dkimPublicKey: publicKey,
        dkimPrivateKey: privateKey,
        companyId: callerCompany,
      },
    });

    // Postfix ve Rspamd dosyalarını senkronize et
    await syncInfrastructure(fastify.prisma);

    // DNS kayıtlarını döndür
    const dnsRecords = getDnsRecords(body.domain, publicKey, selector);

    return reply.code(201).send({
      data: {
        id: domain.id,
        domain: domain.domain,
        status: domain.status,
        dkimSelector: domain.dkimSelector,
        dkimPublicKey: domain.dkimPublicKey,
        spfVerified: domain.spfVerified,
        dkimVerified: domain.dkimVerified,
        dmarcVerified: domain.dmarcVerified,
        createdAt: domain.createdAt,
        updatedAt: domain.updatedAt,
        dnsRecords,
      },
    });
  });

  // GET /domains — Tüm domainleri listele (company scoped)
  fastify.get('/', async (request, reply) => {
    const { page = 1, limit = 20 } = request.query as {
      page?: number;
      limit?: number;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = domainScope(request);

    const [domains, totalCount] = await Promise.all([
      fastify.prisma.domain.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          domain: true,
          status: true,
          spfVerified: true,
          dkimVerified: true,
          dmarcVerified: true,
          dkimSelector: true,
          bimiLogoUrl: true,
          bimiVmcUrl: true,
          bimiVerified: true,
          catchAllMailboxEmail: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      fastify.prisma.domain.count({ where }),
    ]);

    return reply.send({
      data: domains,
      meta: {
        page: Number(page),
        limit: take,
        totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    });
  });

  // GET /domains/:id — Domain detayı
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const domain = await fastify.prisma.domain.findFirst({
      where: { id, ...domainScope(request) },
      select: {
        id: true,
        domain: true,
        status: true,
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        dkimSelector: true,
        dkimPublicKey: true,
        bimiLogoUrl: true,
        bimiVmcUrl: true,
        bimiVerified: true,
        catchAllMailboxEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!domain) {
      return reply.code(404).send({
        data: null,
        error: 'Domain not found',
      });
    }

    return reply.send({ data: domain });
  });

  // POST /domains/:id/verify — DNS kayıtlarını doğrula
  fastify.post('/:id/verify', async (request, reply) => {
    const { id } = request.params as { id: string };

    const domain = await fastify.prisma.domain.findFirst({
      where: { id, ...domainScope(request) },
    });

    if (!domain) {
      return reply.code(404).send({
        data: null,
        error: 'Domain not found',
      });
    }

    const verification = await verifyDomainDns(
      domain.domain,
      domain.dkimSelector,
      domain.dkimPublicKey
    );

    const allVerified =
      verification.spf && verification.dkim && verification.dmarc;

    // State machine: pending → verifying → active / failed
    let newStatus = domain.status;
    if (allVerified) {
      newStatus = 'active';
    } else if (domain.status === 'pending') {
      newStatus = 'verifying';
    }

    const updated = await fastify.prisma.domain.update({
      where: { id },
      data: {
        spfVerified: verification.spf,
        dkimVerified: verification.dkim,
        dmarcVerified: verification.dmarc,
        bimiVerified: verification.bimi,
        status: newStatus,
      },
    });

    // Eğer aktif olduysa infrastructure'ı güncelle
    if (newStatus === 'active' && domain.status !== 'active') {
      await syncInfrastructure(fastify.prisma);
    }

    return reply.send({
      data: {
        id: updated.id,
        domain: updated.domain,
        status: updated.status,
        spfVerified: updated.spfVerified,
        dkimVerified: updated.dkimVerified,
        dmarcVerified: updated.dmarcVerified,
        dkimSelector: updated.dkimSelector,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        verification,
      },
    });
  });

  // PATCH /domains/:id — Domain transfer (companyId değişimi) ve/veya
  // catch-all mailbox set/unset.
  //
  // Body:
  //   { companyId: string }                    → ownership transfer (DKIM korunur)
  //   { catchAllMailboxEmail: string | null }  → catch-all set/unset
  //   ikisi birlikte de gönderilebilir.
  //
  // Transfer akışı: DKIM key/public key dokunulmaz, sadece `companyId`
  // değişir. Caller'ın bu domain'e mevcut erişim yetkisi olmalı
  // (`domainScope` filter); transfer sonrası caller'ın key'i artık bu
  // domain'i göremez (yeni companyId eski key'in scope'unda değil).
  //
  // Catch-all akışı: `catchAllMailboxEmail` set edilirse (null değilse) o
  // adres bu domain'in mevcut bir mailbox'ı olmalı; set sonrası Postfix
  // virtual_alias_maps regenerate edilir. UI tarafı conflicting mailbox
  // silmeyi yönetir; biz sadece routing kuralı.
  const patchDomainSchema = z.object({
    companyId: z.string().min(1).optional(),
    catchAllMailboxEmail: z.string().email().nullable().optional(),
  });
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = patchDomainSchema.parse(request.body);

    if (
      body.companyId === undefined &&
      body.catchAllMailboxEmail === undefined
    ) {
      return reply.code(400).send({
        data: null,
        error: 'At least one of companyId or catchAllMailboxEmail is required',
      });
    }

    const domain = await fastify.prisma.domain.findFirst({
      where: { id, ...domainScope(request) },
    });

    if (!domain) {
      return reply.code(404).send({
        data: null,
        error: 'Domain not found',
      });
    }

    // catchAllMailboxEmail set ediliyorsa local-part + domain match kontrolü
    if (
      body.catchAllMailboxEmail !== undefined &&
      body.catchAllMailboxEmail !== null
    ) {
      const [, anchorDomain] = body.catchAllMailboxEmail.split('@');
      if (anchorDomain?.toLowerCase() !== domain.domain.toLowerCase()) {
        return reply.code(400).send({
          data: null,
          error: `catchAllMailboxEmail must end with @${domain.domain}`,
        });
      }
    }

    const updateData: {
      companyId?: string;
      catchAllMailboxEmail?: string | null;
    } = {};
    if (body.companyId !== undefined) updateData.companyId = body.companyId;
    if (body.catchAllMailboxEmail !== undefined) {
      updateData.catchAllMailboxEmail = body.catchAllMailboxEmail;
    }

    const updated = await fastify.prisma.domain.update({
      where: { id },
      data: updateData,
    });

    // Catch-all değiştiyse Postfix aliases yenile.
    if (body.catchAllMailboxEmail !== undefined) {
      await syncInfrastructure(fastify.prisma);
    }

    return reply.send({
      data: {
        id: updated.id,
        domain: updated.domain,
        status: updated.status,
        spfVerified: updated.spfVerified,
        dkimVerified: updated.dkimVerified,
        dmarcVerified: updated.dmarcVerified,
        dkimSelector: updated.dkimSelector,
        bimiLogoUrl: updated.bimiLogoUrl,
        bimiVmcUrl: updated.bimiVmcUrl,
        bimiVerified: updated.bimiVerified,
        catchAllMailboxEmail: updated.catchAllMailboxEmail,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  });

  // DELETE /domains/:id — Domain sil
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const domain = await fastify.prisma.domain.findFirst({
      where: { id, ...domainScope(request) },
    });

    if (!domain) {
      return reply.code(404).send({
        data: null,
        error: 'Domain not found',
      });
    }

    // DKIM key dosyasını sil
    await removeDkimKey(domain.domain, domain.dkimSelector);

    // DB'den sil
    await fastify.prisma.domain.delete({ where: { id } });

    // Postfix ve Rspamd dosyalarını senkronize et
    await syncInfrastructure(fastify.prisma);

    return reply.code(200).send({
      data: { message: 'Domain deleted successfully' },
    });
  });

  // GET /domains/:id/dns-records — DNS kayıtlarını döndür
  fastify.get('/:id/dns-records', async (request, reply) => {
    const { id } = request.params as { id: string };

    const domain = await fastify.prisma.domain.findFirst({
      where: { id, ...domainScope(request) },
    });

    if (!domain) {
      return reply.code(404).send({
        data: null,
        error: 'Domain not found',
      });
    }

    const dnsRecords = getDnsRecords(
      domain.domain,
      domain.dkimPublicKey,
      domain.dkimSelector,
      domain.bimiLogoUrl,
      domain.bimiVmcUrl,
    );

    return reply.send({ data: dnsRecords });
  });

  // GET /domains/:id/bimi — BIMI konfigurasyonunu getir
  fastify.get('/:id/bimi', async (request, reply) => {
    const { id } = request.params as { id: string };

    const domain = await fastify.prisma.domain.findFirst({
      where: { id, ...domainScope(request) },
      select: {
        id: true,
        domain: true,
        bimiLogoUrl: true,
        bimiVmcUrl: true,
        bimiVerified: true,
      },
    });

    if (!domain) {
      return reply.code(404).send({ data: null, error: 'Domain not found' });
    }

    return reply.send({ data: domain });
  });

  // PUT /domains/:id/bimi — BIMI konfigurasyonunu guncelle
  fastify.put('/:id/bimi', async (request, reply) => {
    const { id } = request.params as { id: string };

    const body = z.object({
      logoUrl: z.string().url().nullable(),
      vmcUrl: z.string().url().nullable().optional(),
    }).parse(request.body);

    const domain = await fastify.prisma.domain.findFirst({
      where: { id, ...domainScope(request) },
    });
    if (!domain) {
      return reply.code(404).send({ data: null, error: 'Domain not found' });
    }

    if (domain.status !== 'active') {
      return reply.code(400).send({
        data: null,
        error: 'Domain must be verified (active) before configuring BIMI',
      });
    }

    const updated = await fastify.prisma.domain.update({
      where: { id },
      data: {
        bimiLogoUrl: body.logoUrl,
        bimiVmcUrl: body.vmcUrl ?? null,
        bimiVerified: false, // BIMI kaydı değiştiğinde yeniden doğrulanmalı
      },
      select: {
        id: true,
        domain: true,
        bimiLogoUrl: true,
        bimiVmcUrl: true,
        bimiVerified: true,
      },
    });

    return reply.send({ data: updated });
  });

  // POST /domains/:id/bimi/verify — BIMI DNS kaydını doğrula
  fastify.post('/:id/bimi/verify', async (request, reply) => {
    const { id } = request.params as { id: string };

    const domain = await fastify.prisma.domain.findFirst({
      where: { id, ...domainScope(request) },
    });
    if (!domain) {
      return reply.code(404).send({ data: null, error: 'Domain not found' });
    }

    if (!domain.bimiLogoUrl) {
      return reply.code(400).send({ data: null, error: 'BIMI logo URL not configured' });
    }

    const verification = await verifyDomainDns(
      domain.domain,
      domain.dkimSelector,
      domain.dkimPublicKey,
    );

    const updated = await fastify.prisma.domain.update({
      where: { id },
      data: { bimiVerified: verification.bimi },
      select: {
        id: true,
        domain: true,
        bimiLogoUrl: true,
        bimiVmcUrl: true,
        bimiVerified: true,
      },
    });

    return reply.send({
      data: { ...updated, bimiRecord: verification.details.bimi },
    });
  });
};

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { domainScope, throughDomainScope } from '../utils/company-scope';

const addSuppressionSchema = z.object({
  email: z.string().email(),
  reason: z.enum(['bounce', 'unsubscribe', 'complaint', 'manual']).default('manual'),
  domainId: z.string().uuid(),
});

export const suppressionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireScope('admin'));

  // GET /suppressions
  fastify.get('/', async (request, reply) => {
    const {
      page = 1,
      limit = 50,
      domainId,
      reason,
    } = request.query as {
      page?: number;
      limit?: number;
      domainId?: string;
      reason?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where: any = { ...throughDomainScope(request) };
    if (domainId) where.domainId = domainId;
    if (reason) where.reason = reason;

    const [items, totalCount] = await Promise.all([
      fastify.prisma.suppression.findMany({
        skip,
        take,
        where,
        orderBy: { createdAt: 'desc' },
        include: { domain: { select: { domain: true } } },
      }),
      fastify.prisma.suppression.count({ where }),
    ]);

    return reply.send({
      data: items,
      meta: {
        page: Number(page),
        limit: take,
        totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    });
  });

  // POST /suppressions — Manual ekleme
  fastify.post('/', async (request, reply) => {
    const body = addSuppressionSchema.parse(request.body);

    const domain = await fastify.prisma.domain.findFirst({
      where: { id: body.domainId, ...domainScope(request) },
    });

    if (!domain) {
      return reply.code(404).send({ data: null, error: 'Domain not found' });
    }

    const suppression = await fastify.prisma.suppression.upsert({
      where: {
        email_domainId: { email: body.email, domainId: body.domainId },
      },
      create: {
        email: body.email,
        domainId: body.domainId,
        reason: body.reason,
      },
      update: {},
    });

    return reply.code(201).send({ data: suppression });
  });

  // DELETE /suppressions/:id — Listeden çıkar
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await fastify.prisma.suppression.findFirst({
      where: { id, ...throughDomainScope(request) },
    });
    if (!existing) {
      return reply.code(404).send({ data: null, error: 'Suppression not found' });
    }

    await fastify.prisma.suppression.delete({ where: { id } });
    return reply.send({ data: { message: 'Removed from suppression list' } });
  });

  // GET /suppressions/check — Email suppress edilmiş mi kontrol et
  fastify.get('/check', async (request, reply) => {
    const { email, domainId } = request.query as {
      email: string;
      domainId: string;
    };

    if (!email || !domainId) {
      return reply.code(400).send({ data: null, error: 'email and domainId required' });
    }

    // Domain caller'a ait olmali
    const domain = await fastify.prisma.domain.findFirst({
      where: { id: domainId, ...domainScope(request) },
      select: { id: true },
    });
    if (!domain) {
      return reply.send({ data: { suppressed: false, reason: null } });
    }

    const entry = await fastify.prisma.suppression.findUnique({
      where: {
        email_domainId: { email, domainId },
      },
    });

    return reply.send({
      data: {
        suppressed: !!entry,
        reason: entry?.reason || null,
      },
    });
  });
};

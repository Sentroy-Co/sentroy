import { FastifyPluginAsync } from 'fastify';
import { throughDomainScope } from '../utils/company-scope';

export const logRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /logs — Gönderim logları
  fastify.get('/', async (request, reply) => {
    const {
      page = 1,
      limit = 20,
      status,
      domainId,
      from,
      to,
    } = request.query as {
      page?: number;
      limit?: number;
      status?: string;
      domainId?: string;
      from?: string;
      to?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = { ...throughDomainScope(request) };
    if (status) where.status = status;
    if (domainId) where.domainId = domainId;
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(from) };
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(to) };

    const [logs, totalCount] = await Promise.all([
      fastify.prisma.mailLog.findMany({
        skip,
        take,
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          domain: {
            select: { domain: true },
          },
        },
      }),
      fastify.prisma.mailLog.count({ where }),
    ]);

    return reply.send({
      data: logs,
      meta: {
        page: Number(page),
        limit: take,
        totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    });
  });

  // GET /logs/:id — Tek mail log detayı
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const log = await fastify.prisma.mailLog.findFirst({
      where: { id, ...throughDomainScope(request) },
      include: {
        domain: {
          select: { domain: true },
        },
      },
    });

    if (!log) {
      return reply.code(404).send({
        data: null,
        error: 'Log not found',
      });
    }

    return reply.send({ data: log });
  });
};

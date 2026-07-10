import { FastifyPluginAsync } from 'fastify';
import { domainScope, throughDomainScope } from '../utils/company-scope';

export const statisticsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /statistics/overview — Genel istatistikler
  fastify.get('/overview', async (request, reply) => {
    const { domainId, from, to } = request.query as {
      domainId?: string;
      from?: string;
      to?: string;
    };

    const where: any = { ...throughDomainScope(request) };
    if (domainId) where.domainId = domainId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [
      total,
      sent,
      bounced,
      failed,
      opened,
      clicked,
    ] = await Promise.all([
      fastify.prisma.mailLog.count({ where }),
      fastify.prisma.mailLog.count({ where: { ...where, status: 'sent' } }),
      fastify.prisma.mailLog.count({ where: { ...where, status: 'bounced' } }),
      fastify.prisma.mailLog.count({ where: { ...where, status: 'failed' } }),
      fastify.prisma.mailLog.count({ where: { ...where, openedAt: { not: null } } }),
      fastify.prisma.mailLog.count({ where: { ...where, clickedAt: { not: null } } }),
    ]);

    const delivered = sent;
    const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;
    const bounceRate = total > 0 ? (bounced / total) * 100 : 0;
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
    const clickRate = opened > 0 ? (clicked / opened) * 100 : 0;

    return reply.send({
      data: {
        total,
        sent,
        bounced,
        failed,
        queued: total - sent - bounced - failed,
        opened,
        clicked,
        rates: {
          delivery: Math.round(deliveryRate * 100) / 100,
          bounce: Math.round(bounceRate * 100) / 100,
          open: Math.round(openRate * 100) / 100,
          click: Math.round(clickRate * 100) / 100,
        },
      },
    });
  });

  // GET /statistics/daily — Günlük breakdown
  fastify.get('/daily', async (request, reply) => {
    const { domainId, days = 30 } = request.query as {
      domainId?: string;
      days?: number;
    };

    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    const where: any = {
      createdAt: { gte: since },
      ...throughDomainScope(request),
    };
    if (domainId) where.domainId = domainId;

    const logs = await fastify.prisma.mailLog.findMany({
      where,
      select: {
        status: true,
        createdAt: true,
        openedAt: true,
        clickedAt: true,
      },
    });

    // Günlere göre grupla
    const daily: Record<string, {
      sent: number;
      bounced: number;
      failed: number;
      opened: number;
      clicked: number;
    }> = {};

    for (const log of logs) {
      const day = log.createdAt.toISOString().split('T')[0];
      if (!daily[day]) {
        daily[day] = { sent: 0, bounced: 0, failed: 0, opened: 0, clicked: 0 };
      }

      if (log.status === 'sent') daily[day].sent++;
      if (log.status === 'bounced') daily[day].bounced++;
      if (log.status === 'failed') daily[day].failed++;
      if (log.openedAt) daily[day].opened++;
      if (log.clickedAt) daily[day].clicked++;
    }

    // Tarihe göre sırala
    const sorted = Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({ date, ...stats }));

    return reply.send({ data: sorted });
  });

  // GET /statistics/domains — Domain bazlı özet
  fastify.get('/domains', async (request, reply) => {
    const domains = await fastify.prisma.domain.findMany({
      where: domainScope(request),
      select: {
        id: true,
        domain: true,
        status: true,
        _count: {
          select: {
            logs: true,
            templates: true,
            suppressions: true,
          },
        },
      },
    });

    const result = [];
    for (const d of domains) {
      const [sent, bounced, opened] = await Promise.all([
        fastify.prisma.mailLog.count({ where: { domainId: d.id, status: 'sent' } }),
        fastify.prisma.mailLog.count({ where: { domainId: d.id, status: 'bounced' } }),
        fastify.prisma.mailLog.count({ where: { domainId: d.id, openedAt: { not: null } } }),
      ]);

      result.push({
        id: d.id,
        domain: d.domain,
        status: d.status,
        totalMails: d._count.logs,
        templates: d._count.templates,
        suppressions: d._count.suppressions,
        sent,
        bounced,
        opened,
        deliveryRate: d._count.logs > 0
          ? Math.round((sent / d._count.logs) * 10000) / 100
          : 0,
      });
    }

    return reply.send({ data: result });
  });
};

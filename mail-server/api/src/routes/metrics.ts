import { FastifyPluginAsync } from 'fastify';
import { register, mailQueueDepth, domainsTotal } from '../services/metrics';
import { getMailQueue } from '../services/queue';

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /metrics — Prometheus scrape endpoint
  fastify.get('/metrics', async (request, reply) => {
    try {
      // Queue depth güncelle — singleton Queue üzerinden, scrape başına
      // yeni Redis bağlantısı açmıyoruz.
      const queue = getMailQueue(fastify.redis);
      const [waiting, active, delayed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getFailedCount(),
      ]);

      mailQueueDepth.set({ state: 'waiting' }, waiting);
      mailQueueDepth.set({ state: 'active' }, active);
      mailQueueDepth.set({ state: 'delayed' }, delayed);
      mailQueueDepth.set({ state: 'failed' }, failed);

      // Domain sayıları güncelle
      const domainCounts = await fastify.prisma.domain.groupBy({
        by: ['status'],
        _count: true,
      });

      for (const dc of domainCounts) {
        domainsTotal.set({ status: dc.status }, dc._count);
      }

      const metrics = await register.metrics();
      return reply
        .header('Content-Type', register.contentType)
        .send(metrics);
    } catch (err) {
      return reply.code(500).send('Error collecting metrics');
    }
  });
};

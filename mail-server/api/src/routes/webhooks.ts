import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { domainScope, throughDomainScope } from '../utils/company-scope';

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(
    z.enum(['sent', 'bounced', 'failed', 'opened', 'clicked', 'unsubscribed'])
  ).min(1),
  domainId: z.string().uuid(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(
    z.enum(['sent', 'bounced', 'failed', 'opened', 'clicked', 'unsubscribed'])
  ).min(1).optional(),
  active: z.boolean().optional(),
});

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireScope('admin'));

  // POST /webhooks
  fastify.post('/', async (request, reply) => {
    const body = createWebhookSchema.parse(request.body);

    const domain = await fastify.prisma.domain.findFirst({
      where: { id: body.domainId, ...domainScope(request) },
    });

    if (!domain) {
      return reply.code(404).send({ data: null, error: 'Domain not found' });
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await fastify.prisma.webhook.create({
      data: {
        url: body.url,
        events: body.events,
        secret,
        domainId: body.domainId,
      },
    });

    return reply.code(201).send({
      data: {
        ...webhook,
        secret, // Sadece oluşturma sırasında gösterilir
      },
    });
  });

  // GET /webhooks
  fastify.get('/', async (request, reply) => {
    const { domainId } = request.query as { domainId?: string };
    const where = {
      ...(domainId ? { domainId } : {}),
      ...throughDomainScope(request),
    };

    const webhooks = await fastify.prisma.webhook.findMany({
      where,
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        domainId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: webhooks });
  });

  // GET /webhooks/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const webhook = await fastify.prisma.webhook.findFirst({
      where: { id, ...throughDomainScope(request) },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        domainId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!webhook) {
      return reply.code(404).send({ data: null, error: 'Webhook not found' });
    }

    return reply.send({ data: webhook });
  });

  // PUT /webhooks/:id
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateWebhookSchema.parse(request.body);

    const existing = await fastify.prisma.webhook.findFirst({
      where: { id, ...throughDomainScope(request) },
    });
    if (!existing) {
      return reply.code(404).send({ data: null, error: 'Webhook not found' });
    }

    const updated = await fastify.prisma.webhook.update({
      where: { id },
      data: body,
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        domainId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.send({ data: updated });
  });

  // DELETE /webhooks/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await fastify.prisma.webhook.findFirst({
      where: { id, ...throughDomainScope(request) },
    });
    if (!existing) {
      return reply.code(404).send({ data: null, error: 'Webhook not found' });
    }

    await fastify.prisma.webhook.delete({ where: { id } });
    return reply.send({ data: { message: 'Webhook deleted' } });
  });
};

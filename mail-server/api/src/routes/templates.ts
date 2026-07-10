import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  compileMjmlLocalized,
  extractVariablesFromLocalized,
  renderTemplate,
  resolveLocalized,
  type LocalizedValue,
} from '../services/template-engine';
import { domainScope, throughDomainScope } from '../utils/company-scope';

// Multilang değer: ya düz string, ya da { lang: value } objesi
const localizedField = z.union([z.string(), z.record(z.string())]);

const createTemplateSchema = z.object({
  name: localizedField,
  subject: localizedField,
  mjmlBody: localizedField,
  domainId: z.string().uuid(),
});

const updateTemplateSchema = z.object({
  name: localizedField.optional(),
  subject: localizedField.optional(),
  mjmlBody: localizedField.optional(),
});

function validateLocalized(
  value: LocalizedValue,
  fieldName: string,
): string | null {
  if (typeof value === 'string') {
    if (!value.trim()) return `${fieldName} cannot be empty`;
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return `${fieldName} must have at least one language`;
  for (const [lang, v] of entries) {
    if (!v || typeof v !== 'string' || !v.trim()) {
      return `${fieldName}.${lang} cannot be empty`;
    }
  }
  return null;
}

export const templateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireScope('send'));

  // POST /templates
  fastify.post('/', async (request, reply) => {
    const body = createTemplateSchema.parse(request.body);

    for (const [k, v] of [
      ['name', body.name],
      ['subject', body.subject],
      ['mjmlBody', body.mjmlBody],
    ] as const) {
      const err = validateLocalized(v, k);
      if (err) {
        return reply.code(400).send({ data: null, error: err });
      }
    }

    const domain = await fastify.prisma.domain.findFirst({
      where: { id: body.domainId, ...domainScope(request) },
    });

    if (!domain) {
      return reply.code(404).send({ data: null, error: 'Domain not found' });
    }

    const htmlBody = compileMjmlLocalized(body.mjmlBody);
    const variables = extractVariablesFromLocalized(body.mjmlBody, body.subject);

    const template = await fastify.prisma.template.create({
      data: {
        name: body.name as any,
        subject: body.subject as any,
        mjmlBody: body.mjmlBody as any,
        htmlBody: htmlBody as any,
        variables,
        domainId: body.domainId,
      },
    });

    return reply.code(201).send({ data: template });
  });

  // GET /templates
  fastify.get('/', async (request, reply) => {
    const {
      page = 1,
      limit = 20,
      domainId,
    } = request.query as {
      page?: number;
      limit?: number;
      domainId?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = {
      ...(domainId ? { domainId } : {}),
      ...throughDomainScope(request),
    };

    const [templates, totalCount] = await Promise.all([
      fastify.prisma.template.findMany({
        skip,
        take,
        where,
        orderBy: { createdAt: 'desc' },
      }),
      fastify.prisma.template.count({ where }),
    ]);

    return reply.send({
      data: templates,
      meta: {
        page: Number(page),
        limit: take,
        totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
    });
  });

  // GET /templates/:id
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const template = await fastify.prisma.template.findFirst({
      where: { id, ...throughDomainScope(request) },
    });

    if (!template) {
      return reply.code(404).send({ data: null, error: 'Template not found' });
    }

    return reply.send({ data: template });
  });

  // PUT /templates/:id
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateTemplateSchema.parse(request.body);

    const existing = await fastify.prisma.template.findFirst({
      where: { id, ...throughDomainScope(request) },
    });

    if (!existing) {
      return reply.code(404).send({ data: null, error: 'Template not found' });
    }

    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) {
        const err = validateLocalized(v as LocalizedValue, k);
        if (err) {
          return reply.code(400).send({ data: null, error: err });
        }
      }
    }

    const mjmlBody = (body.mjmlBody ?? existing.mjmlBody) as LocalizedValue;
    const subject = (body.subject ?? existing.subject) as LocalizedValue;
    const name = (body.name ?? existing.name) as LocalizedValue;

    const htmlBody = body.mjmlBody
      ? compileMjmlLocalized(body.mjmlBody)
      : (existing.htmlBody as LocalizedValue);

    const variables =
      body.mjmlBody || body.subject
        ? extractVariablesFromLocalized(mjmlBody, subject)
        : existing.variables;

    const updated = await fastify.prisma.template.update({
      where: { id },
      data: {
        name: name as any,
        subject: subject as any,
        mjmlBody: mjmlBody as any,
        htmlBody: htmlBody as any,
        variables,
      },
    });

    return reply.send({ data: updated });
  });

  // DELETE /templates/:id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await fastify.prisma.template.findFirst({
      where: { id, ...throughDomainScope(request) },
    });

    if (!existing) {
      return reply.code(404).send({ data: null, error: 'Template not found' });
    }

    await fastify.prisma.template.delete({ where: { id } });

    return reply.send({ data: { message: 'Template deleted successfully' } });
  });

  // POST /templates/:id/preview
  fastify.post('/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { variables = {}, lang } = (request.body || {}) as {
      // Section desteği için variables artık array (rows) içerebilir.
      variables?: Record<
        string,
        string | number | boolean | Array<Record<string, string | number | boolean>>
      >;
      lang?: string;
    };

    const template = await fastify.prisma.template.findFirst({
      where: { id, ...throughDomainScope(request) },
    });

    if (!template) {
      return reply.code(404).send({ data: null, error: 'Template not found' });
    }

    const htmlStr = resolveLocalized(template.htmlBody as LocalizedValue, lang);
    const subjectStr = resolveLocalized(template.subject as LocalizedValue, lang);

    const rendered = renderTemplate(htmlStr, subjectStr, variables);

    return reply.send({
      data: {
        html: rendered.html,
        subject: rendered.subject,
        templateVariables: template.variables,
      },
    });
  });
};

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validateEmail, validateEmails } from '../services/email-validator';

const validateSingleSchema = z.object({
  email: z.string().min(1),
});

const validateBatchSchema = z.object({
  emails: z.array(z.string().min(1)).min(1).max(100),
});

export const validateRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /validate/email — Tek email doğrulama
  fastify.post('/email', async (request, reply) => {
    const body = validateSingleSchema.parse(request.body);
    const result = await validateEmail(body.email);
    return reply.send({ data: result });
  });

  // POST /validate/batch — Toplu email doğrulama (max 100)
  fastify.post('/batch', async (request, reply) => {
    const body = validateBatchSchema.parse(request.body);
    const results = await validateEmails(body.emails);

    const valid = results.filter((r) => r.valid).length;
    const invalid = results.length - valid;

    return reply.send({
      data: results,
      meta: { total: results.length, valid, invalid },
    });
  });
};

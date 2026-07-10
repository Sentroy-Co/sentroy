import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

const errorHandlerFn: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    // Zod validation hatası → 400
    if (error instanceof ZodError) {
      return reply.code(400).send({
        data: null,
        error: 'Validation error',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    // Prisma unique constraint → 409
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[])?.join(', ') || 'field';
      return reply.code(409).send({
        data: null,
        error: `Duplicate value for: ${target}`,
      });
    }

    // Prisma not found → 404
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return reply.code(404).send({
        data: null,
        error: 'Resource not found',
      });
    }

    // Rate limit → 429
    if (error.statusCode === 429) {
      return reply.code(429).send({
        data: null,
        error: 'Too many requests. Please try again later.',
      });
    }

    // Fastify validation (schema) → 400
    if (error.validation) {
      return reply.code(400).send({
        data: null,
        error: 'Validation error',
        details: error.validation,
      });
    }

    // Bilinen HTTP hataları (4xx)
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        data: null,
        error: error.message,
      });
    }

    // Beklenmeyen hata → 500 (detay logla ama client'a gösterme)
    fastify.log.error(error);
    return reply.code(500).send({
      data: null,
      error: 'Internal server error',
    });
  });
};

export const errorHandler = fp(errorHandlerFn, {
  name: 'error-handler',
});

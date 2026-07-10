import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.enum(['send', 'read', 'admin'])).min(1),
  domainId: z.string().uuid().nullable().optional(),
  // UI tarafindaki Company.id. Key'i belirli bir company'ye bagli tutar.
  // NULL = legacy/master key (tum company'lere erisir).
  companyId: z.string().min(1).max(64).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireScope('admin'));

  // POST /api-keys — Yeni API key oluştur
  fastify.post('/', async (request, reply) => {
    const body = createApiKeySchema.parse(request.body);

    // 48 byte random token üret (base64url = 64 karakter)
    const plainKey = `sk_${crypto.randomBytes(36).toString('base64url')}`;
    // İlk 12 karakter — hızlı indexli lookup için plaintext prefix
    const keyPrefix = plainKey.slice(0, 12);

    const keyHash = await bcrypt.hash(plainKey, 12);

    const apiKey = await fastify.prisma.apiKey.create({
      data: {
        name: body.name,
        keyPrefix,
        keyHash,
        scopes: body.scopes,
        domainId: body.domainId ?? null,
        companyId: body.companyId ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    // Plain key sadece bu response'da döner — bir daha gösterilmez
    return reply.code(201).send({
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: plainKey,
        scopes: apiKey.scopes,
        domainId: apiKey.domainId,
        companyId: apiKey.companyId,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
        _warning: 'Bu API key sadece bir kez gösterilir. Güvenli bir yere kaydedin.',
      },
    });
  });

  // GET /api-keys/me — Caller'ın kendi API key bilgisi (ID, scope'lar)
  // UI bunu master key'in ID'sini tespit etmek için kullanır.
  fastify.get('/me', async (request, reply) => {
    if (!request.apiKey) {
      return reply.code(401).send({ data: null, error: 'Unauthorized' });
    }
    const key = await fastify.prisma.apiKey.findUnique({
      where: { id: request.apiKey.id },
      select: {
        id: true,
        name: true,
        scopes: true,
        domainId: true,
        companyId: true,
        lastUsed: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return reply.send({ data: key });
  });

  // GET /api-keys — API key listesi (hash olmadan)
  // Eger caller company-scoped ise sadece kendi company'sinin key'leri,
  // legacy master (companyId=null) ise hepsi gelir.
  fastify.get('/', async (request, reply) => {
    const callerCompany = request.apiKey?.companyId ?? null;
    const keys = await fastify.prisma.apiKey.findMany({
      where: callerCompany ? { companyId: callerCompany } : undefined,
      select: {
        id: true,
        name: true,
        scopes: true,
        domainId: true,
        companyId: true,
        lastUsed: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: keys });
  });

  // DELETE /api-keys/:id — API key iptal et
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await fastify.prisma.apiKey.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.code(404).send({
        data: null,
        error: 'API key not found',
      });
    }

    // Company scoping — sadece kendi company'nin key'leri silinebilir
    const callerCompany = request.apiKey?.companyId ?? null;
    if (callerCompany && existing.companyId !== callerCompany) {
      return reply.code(404).send({
        data: null,
        error: 'API key not found',
      });
    }

    await fastify.prisma.apiKey.delete({ where: { id } });

    return reply.send({
      data: { message: 'API key revoked successfully' },
    });
  });
};

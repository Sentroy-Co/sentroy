import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    enforceDomainScope: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * API key'de domainId set edilmişse, request'teki domainId'nin
 * eşleştiğini kontrol eder. Body, params veya query'den domainId alır.
 *
 * admin scope'u olan key'ler her domain'e erişebilir.
 * domainId null olan key'ler tüm domainlere erişebilir.
 */
const domainScopeFn: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'enforceDomainScope',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.apiKey) return;

      // Admin veya domain kısıtlaması olmayan key → geç
      if (
        request.apiKey.scopes.includes('admin') ||
        !request.apiKey.domainId
      ) {
        return;
      }

      const scopedDomainId = request.apiKey.domainId;

      // domainId'yi body, params veya query'den bul
      const body = request.body as any;
      const params = request.params as any;
      const query = request.query as any;

      const requestDomainId =
        body?.domainId || params?.domainId || query?.domainId || params?.id;

      // Domain ID verilmişse ve eşleşmiyorsa reddet
      if (requestDomainId && requestDomainId !== scopedDomainId) {
        reply.code(403).send({
          data: null,
          error: 'API key does not have access to this domain',
        });
        return;
      }

      // domainId yoksa query'ye otomatik ekle (listeleme için)
      if (!requestDomainId && query) {
        (request.query as any).domainId = scopedDomainId;
      }
    }
  );
};

export const domainScope = fp(domainScopeFn, {
  name: 'domain-scope',
  dependencies: ['auth'],
});

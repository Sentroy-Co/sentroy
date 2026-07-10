import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import bcrypt from 'bcrypt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireScope: (scope: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const KEY_PREFIX_LENGTH = 12;

const authPluginFn: FastifyPluginAsync = async (fastify) => {
  // Token → key metadata cache (doğrulanmış eşleşmeler)
  // bcrypt karşılaştırmasını tekrarlamayı önler.
  const keyCache = new Map<
    string,
    {
      hash: string;
      id: string;
      scopes: string[];
      domainId: string | null;
      companyId: string | null;
      cachedAt: number;
      /** En son DB'ye lastUsed yazılan timestamp — yazma throttle'ı için */
      lastUsedSyncedAt: number;
    }
  >();
  const CACHE_TTL = 5 * 60_000;
  // Cache'i sınırla — unbounded Map büyümesi (rotate edilen/çok sayıda token)
  // GC baskısı + latency jitter yaratır. Aşınca en eski entry atılır (LRU-ish).
  const MAX_CACHE_ENTRIES = 5000;
  // lastUsed DB write throttle — her authenticated istek bir Prisma update
  // tetikliyordu. Yoğun trafikte saniyede onlarca redundant UPDATE oluyor.
  // 60sn'de bir flush yeterli (UI/audit için bu hassasiyet fazlasıyla yeterli).
  const LAST_USED_THROTTLE_MS = 60_000;

  /**
   * lastUsed alanını gereksiz yere her istekte güncellemeyi engeller.
   * Cache entry'sindeki `lastUsedSyncedAt`'i kontrol eder, sadece eskiyse yazar.
   */
  function touchLastUsed(entry: { id: string; lastUsedSyncedAt: number }) {
    const now = Date.now();
    if (now - entry.lastUsedSyncedAt < LAST_USED_THROTTLE_MS) return;
    entry.lastUsedSyncedAt = now;
    fastify.prisma.apiKey
      .update({
        where: { id: entry.id },
        data: { lastUsed: new Date(now) },
      })
      .catch(() => {});
  }

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        reply.code(401).send({
          data: null,
          error: 'Missing or invalid Authorization header',
        });
        return;
      }

      const token = authHeader.slice(7);

      // ── Cache yolu ───────────────────────────────────────────────────
      // Cache key zaten token'ın kendisi — entry varsa bu token bcrypt ile
      // bir defa zaten doğrulanmış demektir. Burada tekrar bcrypt.compare
      // yapmak her authenticated istek için ~100-300ms ekliyor ve libuv
      // thread pool'unu (varsayılan 4) tüketiyordu → API "donuyor" gibi
      // görünüyordu. Sadece TTL kontrol et, hash backing store değişimi
      // için defansif olarak hash referansını da tut.
      const cached = keyCache.get(token);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
        // SLIDING TTL: aktif token'ın cache'i her kullanımda tazelenir → 5 dk'da
        // bir expiry + tam bcrypt re-scan ("API donuyor" / domain list yavaş
        // spike'ı) ortadan kalkar. Yalnız GERÇEKTEN idle (>TTL kullanılmamış)
        // token yeniden taranır.
        cached.cachedAt = Date.now();
        touchLastUsed(cached);

        request.apiKey = {
          id: cached.id,
          scopes: cached.scopes,
          domainId: cached.domainId,
          companyId: cached.companyId,
        };
        return;
      }

      // ── Prefix yolu — yeni key'ler için indexli hızlı lookup ───────
      const prefix =
        token.length >= KEY_PREFIX_LENGTH
          ? token.slice(0, KEY_PREFIX_LENGTH)
          : token;

      // Prefix eşleşen adaylar + legacy (null prefix) key'ler
      const candidates = await fastify.prisma.apiKey.findMany({
        where: {
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            { OR: [{ keyPrefix: prefix }, { keyPrefix: null }] },
          ],
        },
      });

      // bcrypt.compare PARALEL çalışır (sıralı K×~100ms yerine libuv threadpool'da
      // eşzamanlı) — cache-miss'te legacy null-prefix aday sayısı büyükse fark eder.
      const compareResults = await Promise.all(
        candidates.map((k) =>
          bcrypt.compare(token, k.keyHash).then((ok) => (ok ? k : null)).catch(() => null),
        ),
      );
      const matchedKey = compareResults.find((k) => k !== null) ?? null;
      let matchedEntry: ReturnType<typeof keyCache.get> = undefined;
      if (matchedKey) {
        const entry = {
          hash: matchedKey.keyHash,
          id: matchedKey.id,
          scopes: matchedKey.scopes,
          domainId: matchedKey.domainId,
          companyId: matchedKey.companyId,
          cachedAt: Date.now(),
          lastUsedSyncedAt: 0,
        };
        keyCache.set(token, entry);
        matchedEntry = entry;
        // LRU-ish sınır: aşınca en eski (insertion-order ilk) entry'yi at.
        if (keyCache.size > MAX_CACHE_ENTRIES) {
          const oldest = keyCache.keys().next().value;
          if (oldest !== undefined) keyCache.delete(oldest);
        }
        // Legacy key eşleşti — prefix'i backfill et (bir defa).
        if (!matchedKey.keyPrefix) {
          fastify.prisma.apiKey
            .update({ where: { id: matchedKey.id }, data: { keyPrefix: prefix } })
            .catch(() => {});
        }
      }

      if (!matchedKey || !matchedEntry) {
        reply.code(401).send({
          data: null,
          error: 'Invalid API key',
        });
        return;
      }

      touchLastUsed(matchedEntry);

      request.apiKey = {
        id: matchedKey.id,
        scopes: matchedKey.scopes,
        domainId: matchedKey.domainId,
        companyId: matchedKey.companyId,
      };
    }
  );

  fastify.decorate(
    'requireScope',
    (scope: string) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.apiKey) {
          reply.code(401).send({
            data: null,
            error: 'Authentication required',
          });
          return;
        }

        if (
          !request.apiKey.scopes.includes(scope) &&
          !request.apiKey.scopes.includes('admin')
        ) {
          reply.code(403).send({
            data: null,
            error: `Insufficient permissions. Required scope: ${scope}`,
          });
          return;
        }
      }
  );
};

export const authPlugin = fp(authPluginFn, {
  name: 'auth',
});

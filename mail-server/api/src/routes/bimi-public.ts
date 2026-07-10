import { FastifyPluginAsync } from 'fastify';
import dns from 'dns';

const resolver = new dns.promises.Resolver();

interface CacheEntry {
  data: { logoUrl: string | null; vmcUrl: string | null; found: boolean };
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const POSITIVE_TTL_MS = 6 * 60 * 60 * 1000; // 6 saat — BIMI kaydi nadiren degisir
const NEGATIVE_TTL_MS = 30 * 60 * 1000; // 30 dakika — yok/cozumlenmeyen

// Sonsuz buyume onlemi — max entry
const MAX_CACHE = 5000;

function evictIfNeeded() {
  if (cache.size <= MAX_CACHE) return;
  // En eski girdileri sil (basit FIFO mantigi — Map insertion order)
  const toDelete = cache.size - MAX_CACHE + 500;
  let i = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++i >= toDelete) break;
  }
}

function parseBimiRecord(record: string): { logoUrl: string | null; vmcUrl: string | null } {
  let logoUrl: string | null = null;
  let vmcUrl: string | null = null;
  const parts = record.split(';').map((p) => p.trim());
  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    const value = valueParts.join('=').trim();
    if (key === 'l' && value) logoUrl = value;
    if (key === 'a' && value) vmcUrl = value;
  }
  return { logoUrl, vmcUrl };
}

async function lookupBimi(
  domain: string,
): Promise<{ logoUrl: string | null; vmcUrl: string | null; found: boolean }> {
  try {
    const records = await resolver.resolveTxt(`default._bimi.${domain}`);
    const bimi = records
      .map((r) => r.join(''))
      .find((r) => r.startsWith('v=BIMI1'));
    if (!bimi) return { logoUrl: null, vmcUrl: null, found: false };
    const parsed = parseBimiRecord(bimi);
    return { ...parsed, found: true };
  } catch {
    return { logoUrl: null, vmcUrl: null, found: false };
  }
}

export const bimiPublicRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /public/bimi?domain=example.com — Herhangi bir domain icin BIMI kaydini cozer
  fastify.get('/bimi', async (request, reply) => {
    const { domain } = request.query as { domain?: string };

    if (!domain || typeof domain !== 'string') {
      return reply.code(400).send({ data: null, error: 'domain query param is required' });
    }

    // Basit domain dogrulamasi (XSS/path traversal koruma)
    const normalized = domain.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(normalized)) {
      return reply.code(400).send({ data: null, error: 'invalid domain' });
    }

    // Cache kontrol
    const hit = cache.get(normalized);
    if (hit && hit.expiresAt > Date.now()) {
      return reply.send({ data: hit.data });
    }

    const result = await lookupBimi(normalized);

    cache.set(normalized, {
      data: result,
      expiresAt:
        Date.now() + (result.found ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
    });
    evictIfNeeded();

    return reply.send({ data: result });
  });

  // POST /public/bimi/batch — Birden fazla domain tek istekte
  fastify.post('/bimi/batch', async (request, reply) => {
    const { domains } = request.body as { domains?: string[] };

    if (!Array.isArray(domains) || domains.length === 0) {
      return reply.code(400).send({ data: null, error: 'domains array is required' });
    }

    if (domains.length > 50) {
      return reply.code(400).send({ data: null, error: 'max 50 domains per request' });
    }

    const unique = Array.from(
      new Set(
        domains
          .filter((d) => typeof d === 'string')
          .map((d) => d.trim().toLowerCase())
          .filter((d) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(d)),
      ),
    );

    const results: Record<
      string,
      { logoUrl: string | null; vmcUrl: string | null; found: boolean }
    > = {};

    await Promise.all(
      unique.map(async (d) => {
        const hit = cache.get(d);
        if (hit && hit.expiresAt > Date.now()) {
          results[d] = hit.data;
          return;
        }
        const result = await lookupBimi(d);
        cache.set(d, {
          data: result,
          expiresAt:
            Date.now() + (result.found ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
        });
        results[d] = result;
      }),
    );
    evictIfNeeded();

    return reply.send({ data: results });
  });
};

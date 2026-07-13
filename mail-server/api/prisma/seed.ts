import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Boot-time seed (Dockerfile CMD: `prisma db push && tsx prisma/seed.ts`).
 *
 * Two modes:
 *   1. ADMIN_API_KEY set  → idempotently ensure an admin-scoped key whose
 *      plaintext == ADMIN_API_KEY. This is the hands-off path for one-click
 *      deploys (Coolify `SERVICE_PASSWORD_64_ADMINTOKEN` → ADMIN_API_KEY): the
 *      operator reads the token from the panel; no interactive setup.sh, no
 *      log-scraping. Runs safely on every boot (upsert-by-prefix).
 *   2. ADMIN_API_KEY unset → legacy behavior: on an empty table, generate a
 *      random key and print it once to the container logs.
 */
const envKey = process.env.ADMIN_API_KEY?.trim();

async function ensureFromEnv(key: string): Promise<void> {
  if (key.length < 16) {
    console.warn('[seed] ADMIN_API_KEY < 16 karakter — güvensiz, atlanıyor.');
    return;
  }
  const keyPrefix = key.slice(0, 12);

  // Zaten var mı? Prefix ile aday bul, bcrypt ile doğrula (idempotent boot).
  const candidates = await prisma.apiKey.findMany({ where: { keyPrefix } });
  for (const c of candidates) {
    if (await bcrypt.compare(key, c.keyHash)) {
      console.log('[seed] ADMIN_API_KEY zaten kayıtlı, atlanıyor.');
      return;
    }
  }

  const keyHash = await bcrypt.hash(key, 12);
  await prisma.apiKey.create({
    data: {
      name: 'Bootstrap Admin Key (env)',
      keyPrefix,
      keyHash,
      scopes: ['admin'],
      domainId: null,
      companyId: null,
      expiresAt: null,
    },
  });
  console.log('[seed] Admin API key ADMIN_API_KEY env değerinden sağlandı (scope: admin).');
}

async function main() {
  if (envKey) {
    await ensureFromEnv(envKey);
    return;
  }

  const existingKeys = await prisma.apiKey.count();
  if (existingKeys > 0) {
    console.log('[seed] API key(ler) zaten mevcut, seed atlanıyor.');
    return;
  }

  const plainKey = `sk_${crypto.randomBytes(36).toString('base64url')}`;
  const keyPrefix = plainKey.slice(0, 12);
  const keyHash = await bcrypt.hash(plainKey, 12);

  await prisma.apiKey.create({
    data: {
      name: 'Bootstrap Admin Key',
      keyPrefix,
      keyHash,
      scopes: ['admin'],
      domainId: null,
      companyId: null,
      expiresAt: null,
    },
  });

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ADMIN API KEY (bunu kaydet — bir daha gösterilmeyecek!)       ║');
  console.log(`║  ${plainKey}  ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('║  İpucu: ADMIN_API_KEY env verirsen bu değer deterministik olur.    ║');
  console.log('');
}

main()
  .catch((e) => {
    console.error('[seed] Hata:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const existingKeys = await prisma.apiKey.count();
  if (existingKeys > 0) {
    console.log('[seed] API key(ler) zaten mevcut, seed atlanıyor.');
    return;
  }

  const plainKey = `sk_${crypto.randomBytes(36).toString('base64url')}`;
  const keyHash = await bcrypt.hash(plainKey, 12);

  await prisma.apiKey.create({
    data: {
      name: 'Bootstrap Admin Key',
      keyHash,
      scopes: ['admin'],
      domainId: null,
      expiresAt: null,
    },
  });

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ADMIN API KEY (bunu kaydet — bir daha gösterilmeyecek!)       ║');
  console.log(`║  ${plainKey}  ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
}

main()
  .catch((e) => {
    console.error('[seed] Hata:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

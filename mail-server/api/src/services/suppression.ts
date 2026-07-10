import { PrismaClient } from '@prisma/client';

type SuppressionReason = 'bounce' | 'unsubscribe' | 'complaint' | 'manual';

/**
 * Email'in suppression listesinde olup olmadığını kontrol eder.
 * Gönderim öncesi çağrılmalıdır.
 */
export async function isEmailSuppressed(
  prisma: PrismaClient,
  email: string,
  domainId: string
): Promise<boolean> {
  const entry = await prisma.suppression.findUnique({
    where: {
      email_domainId: { email, domainId },
    },
  });
  return !!entry;
}

/**
 * Email'i suppression listesine ekler.
 * Zaten varsa sessizce geçer.
 */
export async function addToSuppression(
  prisma: PrismaClient,
  email: string,
  domainId: string,
  reason: SuppressionReason
): Promise<void> {
  await prisma.suppression.upsert({
    where: {
      email_domainId: { email, domainId },
    },
    create: { email, domainId, reason },
    update: {}, // Zaten varsa dokunma
  });
}

/**
 * Email'i suppression listesinden çıkarır.
 */
export async function removeFromSuppression(
  prisma: PrismaClient,
  email: string,
  domainId: string
): Promise<boolean> {
  try {
    await prisma.suppression.delete({
      where: {
        email_domainId: { email, domainId },
      },
    });
    return true;
  } catch {
    return false;
  }
}

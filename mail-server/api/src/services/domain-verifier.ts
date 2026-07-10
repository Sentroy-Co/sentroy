import { PrismaClient } from '@prisma/client';
import { verifyDomainDns } from './dns';
import { updateVirtualDomains, reloadPostfix } from './postfix';
import { updateDkimSigningMap } from './dkim';

const VERIFY_INTERVAL = parseInt(
  process.env.DOMAIN_VERIFY_INTERVAL || '300000',
  10
);

const MAX_VERIFY_ATTEMPTS = 48; // 48 × 5dk = 4 saat sonra failed

/**
 * Periyodik DNS doğrulama servisi.
 * pending ve verifying durumundaki domainlerin DNS kayıtlarını kontrol eder.
 * Tüm kayıtlar doğrulanınca → active, belirli süre geçince → failed.
 */
export function startDomainVerifier(prisma: PrismaClient): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      const pendingDomains = await prisma.domain.findMany({
        where: {
          status: { in: ['pending', 'verifying'] },
        },
        select: {
          id: true,
          domain: true,
          status: true,
          dkimSelector: true,
          dkimPublicKey: true,
          createdAt: true,
        },
      });

      if (pendingDomains.length === 0) return;

      let infrastructureChanged = false;

      for (const domain of pendingDomains) {
        const verification = await verifyDomainDns(
          domain.domain,
          domain.dkimSelector,
          domain.dkimPublicKey
        );

        const allVerified =
          verification.spf && verification.dkim && verification.dmarc;

        // Oluşturulma zamanından bu yana geçen süreyi hesapla
        const elapsed = Date.now() - domain.createdAt.getTime();
        const attempts = Math.floor(elapsed / VERIFY_INTERVAL);

        let newStatus = domain.status;
        if (allVerified) {
          newStatus = 'active';
          infrastructureChanged = true;
        } else if (domain.status === 'pending') {
          newStatus = 'verifying';
        } else if (attempts >= MAX_VERIFY_ATTEMPTS) {
          newStatus = 'failed';
        }

        await prisma.domain.update({
          where: { id: domain.id },
          data: {
            spfVerified: verification.spf,
            dkimVerified: verification.dkim,
            dmarcVerified: verification.dmarc,
            status: newStatus,
          },
        });

        console.log(
          `[domain-verifier] ${domain.domain}: spf=${verification.spf} dkim=${verification.dkim} dmarc=${verification.dmarc} → ${newStatus}`
        );
      }

      // Yeni aktif domain varsa infrastructure güncelle
      if (infrastructureChanged) {
        const activeDomains = await prisma.domain.findMany({
          where: { status: { in: ['active', 'pending', 'verifying'] } },
          select: { domain: true, dkimSelector: true },
        });

        await updateVirtualDomains(activeDomains.map((d) => d.domain));
        await updateDkimSigningMap(
          activeDomains.map((d) => ({
            domain: d.domain,
            selector: d.dkimSelector,
          }))
        );
        await reloadPostfix();
      }
    } catch (err) {
      console.error('[domain-verifier] Error:', err);
    }
  }, VERIFY_INTERVAL);

  console.log(
    `[domain-verifier] Started, polling every ${VERIFY_INTERVAL / 1000}s`
  );

  return timer;
}

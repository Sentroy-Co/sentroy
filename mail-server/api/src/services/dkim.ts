import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DKIM_KEYS_PATH = process.env.DKIM_KEYS_PATH || '/etc/rspamd/dkim';

interface DkimKeyPair {
  publicKey: string;
  privateKey: string;
  selector: string;
}

export async function generateDkim(domain: string): Promise<DkimKeyPair> {
  const selector = 'mail';

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Public key'i DNS TXT kaydı formatına çevir
  const publicKeyDns = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');

  return {
    publicKey: publicKeyDns,
    privateKey,
    selector,
  };
}

/**
 * DKIM private key'i Rspamd volume'una yazar.
 * Dosya formatı: {domain}.{selector}.key
 * Rspamd dkim_signing.conf bu path'i referans alır.
 */
export async function writeDkimKey(
  domain: string,
  selector: string,
  privateKey: string
): Promise<string> {
  await fs.mkdir(DKIM_KEYS_PATH, { recursive: true });

  const keyFileName = `${domain}.${selector}.key`;
  const keyFilePath = path.join(DKIM_KEYS_PATH, keyFileName);

  await fs.writeFile(keyFilePath, privateKey, { mode: 0o600 });

  return keyFilePath;
}

/**
 * DKIM key dosyasını siler.
 */
export async function removeDkimKey(
  domain: string,
  selector: string
): Promise<void> {
  const keyFilePath = path.join(DKIM_KEYS_PATH, `${domain}.${selector}.key`);

  try {
    await fs.unlink(keyFilePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Rspamd DKIM signing map dosyasını günceller.
 * Her domain için selector → key path eşlemesi yazar.
 */
export async function updateDkimSigningMap(
  domains: { domain: string; selector: string }[]
): Promise<void> {
  const mapPath = path.join(DKIM_KEYS_PATH, 'dkim_selectors.map');

  const lines = domains.map(
    (d) => `${d.domain} ${d.selector}`
  );

  await fs.writeFile(mapPath, lines.join('\n') + '\n', { mode: 0o644 });
}

export function formatDkimDnsRecord(
  domain: string,
  publicKey: string,
  selector: string
): string {
  return `v=DKIM1; k=rsa; p=${publicKey}`;
}

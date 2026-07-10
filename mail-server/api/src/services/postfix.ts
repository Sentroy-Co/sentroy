import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const VIRTUAL_DIR = process.env.POSTFIX_VIRTUAL_DIR || '/etc/postfix/virtual';

/**
 * Postfix virtual domain dosyasını günceller.
 * Aktif domainlerin listesini yazar ve postmap çalıştırır.
 */
export async function updateVirtualDomains(
  domains: string[]
): Promise<void> {
  const filePath = `${VIRTUAL_DIR}/domains`;

  const content = domains
    .map((d) => `${d}    OK`)
    .join('\n');

  await fs.writeFile(
    filePath,
    `# Virtual domain listesi — API tarafından yönetilir\n${content}\n`,
    { mode: 0o644 }
  );

  try {
    await execAsync(`postmap ${filePath}`);
  } catch {
    // Container dışında çalışıyorsa postmap olmayabilir
  }
}

/**
 * Postfix virtual mailbox dosyasını günceller.
 * Her domain için catch-all mailbox tanımlar.
 */
export async function updateVirtualMailboxes(
  entries: { email: string; domain: string; user: string }[]
): Promise<void> {
  const filePath = `${VIRTUAL_DIR}/mailboxes`;

  const content = entries
    .map((e) => `${e.email}    ${e.domain}/${e.user}/`)
    .join('\n');

  await fs.writeFile(
    filePath,
    `# Virtual mailbox listesi — API tarafından yönetilir\n${content}\n`,
    { mode: 0o644 }
  );

  try {
    await execAsync(`postmap ${filePath}`);
  } catch {
    // Container dışında çalışıyorsa postmap olmayabilir
  }
}

/**
 * Postfix virtual_alias_maps dosyasını günceller.
 *
 * Her domain için catch-all alias formatı:
 *   <target>@<domain>    <target>@<domain>     # self-alias (specific)
 *   @<domain>            <target>@<domain>     # catch-all (default)
 *
 * Self-alias satırı kritik: aynı domainde başka mailbox'lar varsa onlar
 * `virtual_mailbox_maps`'te kayıtlı kalır + alias'a düşmez. Catch-all anchor'ı
 * için self-alias yazmazsak Postfix `@domain` match'ine düşüp loop riski
 * oluşur (loop koruması var ama temiz çözüm self-alias).
 *
 * Catch-all aktivasyonunda UI tarafı conflicting mailbox'ları sildiği için,
 * normal akışta sadece anchor self-alias + catch-all satırları yeterli.
 */
export async function updateVirtualAliases(
  rules: { domain: string; targetEmail: string }[]
): Promise<void> {
  const filePath = `${VIRTUAL_DIR}/aliases`;

  const lines: string[] = [];
  for (const r of rules) {
    lines.push(`${r.targetEmail}\t${r.targetEmail}`);
    lines.push(`@${r.domain}\t${r.targetEmail}`);
  }

  await fs.writeFile(
    filePath,
    `# Virtual alias listesi — API tarafından yönetilir (catch-all)\n${lines.join('\n')}\n`,
    { mode: 0o644 }
  );

  try {
    await execAsync(`postmap ${filePath}`);
  } catch {
    // Container dışında çalışıyorsa postmap olmayabilir
  }
}

/**
 * Postfix'i konfigürasyon değişikliği sonrası yeniden yükler.
 */
export async function reloadPostfix(): Promise<void> {
  try {
    await execAsync('postfix reload');
  } catch {
    // Container dışında çalışıyorsa postfix olmayabilir
  }
}

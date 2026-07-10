import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const USERS_FILE = process.env.DOVECOT_USERS_FILE || '/etc/dovecot/users-data/users';

interface DovecotUser {
  email: string;
  domain: string;
  username: string;
}

/**
 * BLF-CRYPT (bcrypt) hash üretir — Dovecot passwd-file formatı için.
 */
function generatePasswordHash(password: string): string {
  const hash = bcrypt.hashSync(password, 10);
  return `{BLF-CRYPT}${hash}`;
}

/**
 * Dovecot passwd-file'ını okur ve parse eder.
 * Format: user@domain:{scheme}hash:uid:gid::home::
 */
async function readUsersFile(): Promise<string[]> {
  try {
    const content = await fs.readFile(USERS_FILE, 'utf-8');
    return content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeUsersFile(lines: string[]): Promise<void> {
  const content =
    '# Dovecot users — API tarafından yönetilir\n' +
    lines.join('\n') +
    '\n';
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, content, { mode: 0o644 });
}

/**
 * Yeni Dovecot kullanıcısı oluşturur.
 */
export async function createDovecotUser(
  email: string,
  password: string
): Promise<DovecotUser> {
  const [username, domain] = email.split('@');
  if (!username || !domain) {
    throw new Error('Invalid email format');
  }

  const lines = await readUsersFile();

  // Zaten var mı?
  const exists = lines.some((line) => line.startsWith(`${email}:`));
  if (exists) {
    throw new Error(`User ${email} already exists`);
  }

  const hash = generatePasswordHash(password);
  // Format: user@domain:{scheme}hash:5000:5000::/var/mail/vhosts/domain/user::
  const line = `${email}:${hash}:5000:5000::/var/mail/vhosts/${domain}/${username}::`;

  lines.push(line);
  await writeUsersFile(lines);

  // Maildir oluştur
  const maildir = `/var/mail/vhosts/${domain}/${username}`;
  try {
    await execAsync(`mkdir -p ${maildir}/{cur,new,tmp} && chown -R 5000:5000 ${maildir}`);
  } catch {
    // Container dışında çalışıyorsa hata verebilir
  }

  return { email, domain, username };
}

/**
 * Dovecot kullanıcısının şifresini değiştirir.
 */
export async function updateDovecotPassword(
  email: string,
  newPassword: string
): Promise<void> {
  const lines = await readUsersFile();
  const index = lines.findIndex((line) => line.startsWith(`${email}:`));

  if (index === -1) {
    throw new Error(`User ${email} not found`);
  }

  const parts = lines[index].split(':');
  const hash = generatePasswordHash(newPassword);
  parts[1] = hash;
  lines[index] = parts.join(':');

  await writeUsersFile(lines);
}

/**
 * Dovecot kullanıcısını siler.
 */
export async function deleteDovecotUser(email: string): Promise<void> {
  const lines = await readUsersFile();
  const filtered = lines.filter((line) => !line.startsWith(`${email}:`));

  if (filtered.length === lines.length) {
    throw new Error(`User ${email} not found`);
  }

  await writeUsersFile(filtered);
}

/**
 * Tüm Dovecot kullanıcılarını listeler.
 */
export async function listDovecotUsers(): Promise<DovecotUser[]> {
  const lines = await readUsersFile();

  return lines.map((line) => {
    const email = line.split(':')[0];
    const [username, domain] = email.split('@');
    return { email, domain, username };
  });
}

/**
 * Bir domain'e ait tüm kullanıcıları siler.
 */
export async function deleteDovecotUsersByDomain(domain: string): Promise<number> {
  const lines = await readUsersFile();
  const filtered = lines.filter((line) => {
    const email = line.split(':')[0];
    return !email.endsWith(`@${domain}`);
  });

  const deletedCount = lines.length - filtered.length;
  if (deletedCount > 0) {
    await writeUsersFile(filtered);
  }
  return deletedCount;
}

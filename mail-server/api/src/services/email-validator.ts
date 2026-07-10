import dns from 'dns';

const resolver = new dns.promises.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

export interface ValidationResult {
  valid: boolean;
  email: string;
  checks: {
    syntax: boolean;
    mxExists: boolean;
    disposable: boolean;
  };
  suggestion?: string;
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Yaygın disposable email domain'leri
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'guerrillamail.com', 'mailinator.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'trashmail.com', '10minutemail.com', 'tempail.com',
  'fakeinbox.com', 'mailnesia.com', 'maildrop.cc', 'discard.email',
  'temp-mail.org', 'mohmal.com', 'getnada.com',
]);

// Yaygın domain typo'ları → doğru domain
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
};

/**
 * Email adresini doğrular:
 * 1. Syntax kontrolü (RFC 5322)
 * 2. MX kaydı var mı (domain gerçekten mail alıyor mu)
 * 3. Disposable/geçici email kontrolü
 * 4. Yaygın typo düzeltme önerisi
 */
export async function validateEmail(email: string): Promise<ValidationResult> {
  const normalized = email.trim().toLowerCase();
  const result: ValidationResult = {
    valid: false,
    email: normalized,
    checks: {
      syntax: false,
      mxExists: false,
      disposable: false,
    },
  };

  // Syntax kontrolü
  if (!EMAIL_REGEX.test(normalized)) {
    return result;
  }
  result.checks.syntax = true;

  const domain = normalized.split('@')[1];

  // Typo kontrolü
  if (DOMAIN_TYPOS[domain]) {
    result.suggestion = normalized.replace(domain, DOMAIN_TYPOS[domain]);
  }

  // Disposable kontrolü
  result.checks.disposable = DISPOSABLE_DOMAINS.has(domain);

  // MX kaydı kontrolü
  try {
    const mxRecords = await resolver.resolveMx(domain);
    result.checks.mxExists = mxRecords.length > 0;
  } catch {
    result.checks.mxExists = false;
  }

  // Geçerlilik: syntax OK + MX var + disposable değil
  result.valid =
    result.checks.syntax &&
    result.checks.mxExists &&
    !result.checks.disposable;

  return result;
}

/**
 * Toplu email doğrulama.
 */
export async function validateEmails(
  emails: string[]
): Promise<ValidationResult[]> {
  return Promise.all(emails.map(validateEmail));
}

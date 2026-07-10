import dns from 'dns';

// Bounded budget: timeout'suz resolver'da tek ölü nameserver c-ares'in çok-saniyeli
// retry bütçesinde asılır ve arkasındaki tüm domainlerin verification sweep'ini
// bloklar → liste "verifying"de takılı görünür. 3sn/2-deneme ile sınırla.
const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 2 });

interface DnsVerification {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  bimi: boolean;
  details: {
    spf: string | null;
    dkim: string | null;
    dmarc: string | null;
    bimi: string | null;
  };
}

export async function verifyDomainDns(
  domain: string,
  dkimSelector: string,
  expectedDkimPublicKey: string | null
): Promise<DnsVerification> {
  const result: DnsVerification = {
    spf: false,
    dkim: false,
    dmarc: false,
    bimi: false,
    details: { spf: null, dkim: null, dmarc: null, bimi: null },
  };

  // SPF check
  try {
    const records = await resolver.resolveTxt(domain);
    const spfRecord = records
      .map((r) => r.join(''))
      .find((r) => r.startsWith('v=spf1'));

    if (spfRecord) {
      result.spf = true;
      result.details.spf = spfRecord;
    }
  } catch {}

  // DKIM check
  try {
    const dkimDomain = `${dkimSelector}._domainkey.${domain}`;
    const records = await resolver.resolveTxt(dkimDomain);
    const dkimRecord = records
      .map((r) => r.join(''))
      .find((r) => r.includes('v=DKIM1'));

    if (dkimRecord) {
      result.details.dkim = dkimRecord;
      if (expectedDkimPublicKey && dkimRecord.includes(expectedDkimPublicKey.substring(0, 50))) {
        result.dkim = true;
      } else if (!expectedDkimPublicKey) {
        result.dkim = true;
      }
    }
  } catch {}

  // DMARC check
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const records = await resolver.resolveTxt(dmarcDomain);
    const dmarcRecord = records
      .map((r) => r.join(''))
      .find((r) => r.startsWith('v=DMARC1'));

    if (dmarcRecord) {
      result.dmarc = true;
      result.details.dmarc = dmarcRecord;
    }
  } catch {}

  // BIMI check
  try {
    const bimiDomain = `default._bimi.${domain}`;
    const records = await resolver.resolveTxt(bimiDomain);
    const bimiRecord = records
      .map((r) => r.join(''))
      .find((r) => r.startsWith('v=BIMI1'));

    if (bimiRecord) {
      result.bimi = true;
      result.details.bimi = bimiRecord;
    }
  } catch {}

  return result;
}

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
}

export function getDnsRecords(
  domain: string,
  dkimPublicKey: string | null,
  dkimSelector: string,
  bimiLogoUrl?: string | null,
  bimiVmcUrl?: string | null,
): DnsRecord[] {
  const serverIp = process.env.SERVER_IP || '0.0.0.0';
  const mailHostname = process.env.MAIL_HOSTNAME || `mail.${domain}`;

  const records: DnsRecord[] = [
    {
      type: 'TXT',
      name: domain,
      value: `v=spf1 ip4:${serverIp} ~all`,
    },
    {
      type: 'TXT',
      name: `_dmarc.${domain}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; ruf=mailto:dmarc@${domain}; fo=1`,
    },
    {
      type: 'MX',
      name: domain,
      value: mailHostname,
      priority: 10,
    },
    {
      type: 'A',
      name: mailHostname,
      value: serverIp,
    },
  ];

  if (dkimPublicKey) {
    records.push({
      type: 'TXT',
      name: `${dkimSelector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
    });
  }

  // BIMI record — only when logo URL is provided
  if (bimiLogoUrl) {
    let bimiValue = `v=BIMI1; l=${bimiLogoUrl}`;
    if (bimiVmcUrl) {
      bimiValue += `; a=${bimiVmcUrl}`;
    }
    records.push({
      type: 'TXT',
      name: `default._bimi.${domain}`,
      value: bimiValue,
    });
  }

  return records;
}

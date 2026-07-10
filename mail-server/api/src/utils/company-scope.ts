import type { FastifyRequest } from 'fastify';

/**
 * Company scoping helper'lari. Her API key'in kendi company'sinin verilerini
 * gormesini saglar; legacy master key (companyId = NULL) tumune erisir.
 *
 * Iki ana pattern:
 *   1. Direkt domain sorgulari   -> domainScope(request)
 *   2. Domain'e bagli kayitlar   -> throughDomainScope(request)
 *      (Template, Webhook, MailLog, Suppression)
 */

/**
 * Domain tablosuna uygulanacak where fragmanı. Caller company-scoped ise
 * { companyId: '...' }, master key ise {} doner.
 */
export function domainScope(
  request: FastifyRequest,
): { companyId?: string } {
  const cid = request.apiKey?.companyId ?? null;
  return cid ? { companyId: cid } : {};
}

/**
 * Domain'e bagli kayitlar (Template, MailLog, vb.) icin relation-based
 * filter. Caller company-scoped ise { domain: { companyId: '...' } }, master
 * key ise {} doner.
 */
export function throughDomainScope(
  request: FastifyRequest,
): { domain?: { companyId: string } } {
  const cid = request.apiKey?.companyId ?? null;
  return cid ? { domain: { companyId: cid } } : {};
}

/**
 * Caller'in companyId'sini dondurur (null = legacy master).
 * Ozel filter kurulumlari icin.
 */
export function callerCompanyId(request: FastifyRequest): string | null {
  return request.apiKey?.companyId ?? null;
}

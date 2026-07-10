-- Company-level scoping for API keys and domains.
-- Her iki kolon da nullable; legacy master key (setup.sh ile olusturulan) ve
-- mevcut domain'ler companyId = NULL ile geriye uyumlu kalir. Bir key'de
-- companyId varsa sadece ayni company'nin domainlerini gorur/degistirebilir.

ALTER TABLE "api_keys" ADD COLUMN "companyId" TEXT;
CREATE INDEX "api_keys_companyId_idx" ON "api_keys"("companyId");

ALTER TABLE "domains" ADD COLUMN "companyId" TEXT;
CREATE INDEX "domains_companyId_idx" ON "domains"("companyId");

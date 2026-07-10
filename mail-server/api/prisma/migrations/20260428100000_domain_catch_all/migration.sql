-- Catch-all mailbox alanı — domain'e gelen tanımsız adresleri tek bir
-- mailbox'a yönlendirmek için. Postfix virtual_alias_maps üzerinden uygulanır
-- (services/postfix.ts updateVirtualAliases). NULL = catch-all yok.

ALTER TABLE "domains" ADD COLUMN "catchAllMailboxEmail" TEXT;

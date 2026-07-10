-- Templates tablosundaki string alanları JSON'a dönüştür (multilang desteği için)
-- Mevcut string verileri JSON string olarak geçerli kalır

ALTER TABLE "templates"
  ALTER COLUMN "name"     TYPE JSONB USING to_jsonb("name"),
  ALTER COLUMN "subject"  TYPE JSONB USING to_jsonb("subject"),
  ALTER COLUMN "mjmlBody" TYPE JSONB USING to_jsonb("mjmlBody"),
  ALTER COLUMN "htmlBody" TYPE JSONB USING to_jsonb("htmlBody");

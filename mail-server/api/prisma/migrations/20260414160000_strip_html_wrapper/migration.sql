-- Eski wrapper'lı HTML body'leri yeniden derlenmesi için temizleyerek
-- htmlBody'yi mjmlBody ile eşitle. Uygulama katmanı ilk sendde veya
-- sonraki güncellemede bunları tekrar compile edecek.
-- Bu migration sadece bozuk wrapper'ı temizler — tam HTML dökümanı olanlar dokunulmaz.

UPDATE "templates"
SET "htmlBody" = "mjmlBody"
WHERE "htmlBody"::text LIKE '%email-container%';

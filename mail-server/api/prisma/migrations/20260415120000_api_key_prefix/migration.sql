-- AlterTable: API key'lerine plaintext prefix kolonu ekle
-- (authentication sırasında bcrypt karşılaştırma döngüsünü O(1)'e indirir)
ALTER TABLE "api_keys" ADD COLUMN "keyPrefix" TEXT;

-- CreateIndex: Prefix üzerinde indexli hızlı lookup
CREATE INDEX "api_keys_keyPrefix_idx" ON "api_keys"("keyPrefix");

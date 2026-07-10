-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "spfVerified" BOOLEAN NOT NULL DEFAULT false,
    "dkimVerified" BOOLEAN NOT NULL DEFAULT false,
    "dmarcVerified" BOOLEAN NOT NULL DEFAULT false,
    "dkimSelector" TEXT NOT NULL DEFAULT 'mail',
    "dkimPublicKey" TEXT,
    "dkimPrivateKey" TEXT,
    "trackOpens" BOOLEAN NOT NULL DEFAULT true,
    "trackClicks" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "mjmlBody" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "variables" TEXT[],
    "domainId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_logs" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "messageId" TEXT,
    "domainId" TEXT NOT NULL,
    "templateId" TEXT,
    "variables" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "mail_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "domainId" TEXT,
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "domainId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" TEXT NOT NULL,
    "mailLogId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_domain_key" ON "domains"("domain");

-- CreateIndex
CREATE INDEX "mail_logs_domainId_idx" ON "mail_logs"("domainId");

-- CreateIndex
CREATE INDEX "mail_logs_status_idx" ON "mail_logs"("status");

-- CreateIndex
CREATE INDEX "mail_logs_createdAt_idx" ON "mail_logs"("createdAt");

-- CreateIndex
CREATE INDEX "mail_logs_to_idx" ON "mail_logs"("to");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "webhooks_domainId_idx" ON "webhooks"("domainId");

-- CreateIndex
CREATE INDEX "suppressions_domainId_idx" ON "suppressions"("domainId");

-- CreateIndex
CREATE INDEX "suppressions_email_idx" ON "suppressions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_email_domainId_key" ON "suppressions"("email", "domainId");

-- CreateIndex
CREATE INDEX "tracking_events_mailLogId_idx" ON "tracking_events"("mailLogId");

-- CreateIndex
CREATE INDEX "tracking_events_type_idx" ON "tracking_events"("type");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_logs" ADD CONSTRAINT "mail_logs_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_mailLogId_fkey" FOREIGN KEY ("mailLogId") REFERENCES "mail_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

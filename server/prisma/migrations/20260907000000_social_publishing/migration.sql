CREATE TABLE "SocialProduct" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT NOT NULL, "audience" TEXT NOT NULL, "claims" TEXT NOT NULL,
  "voice" TEXT NOT NULL, "website" TEXT NOT NULL, "callToAction" TEXT NOT NULL, "growthPlan" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialProduct_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialAccount" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "platform" TEXT NOT NULL,
  "externalId" TEXT NOT NULL, "name" TEXT NOT NULL, "ciphertext" TEXT NOT NULL,
  "iv" TEXT NOT NULL, "authTag" TEXT NOT NULL, "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true, "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialPost" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "caption" TEXT NOT NULL, "imageUrl" TEXT, "creativeBrief" TEXT NOT NULL DEFAULT '', "rationale" TEXT NOT NULL DEFAULT '',
  "evidence" JSONB, "status" TEXT NOT NULL DEFAULT 'DRAFT', "scheduledAt" TIMESTAMP(3),
  "approvedBy" TEXT, "approvedAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3),
  "providerId" TEXT, "permalink" TEXT, "containerId" TEXT, "failureReason" TEXT, "metrics" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SocialProduct_organizationId_idx" ON "SocialProduct"("organizationId");
CREATE UNIQUE INDEX "SocialAccount_organizationId_platform_externalId_key" ON "SocialAccount"("organizationId", "platform", "externalId");
CREATE INDEX "SocialPost_organizationId_createdAt_idx" ON "SocialPost"("organizationId", "createdAt");
CREATE INDEX "SocialPost_status_scheduledAt_idx" ON "SocialPost"("status", "scheduledAt");
ALTER TABLE "SocialProduct" ADD CONSTRAINT "SocialProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SocialProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "CredentialProvider" ADD VALUE IF NOT EXISTS 'APIFY';
CREATE TABLE "ApifyDiscoveryRun" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "campaignId" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "source" TEXT NOT NULL,
 "runId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ApifyDiscoveryRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

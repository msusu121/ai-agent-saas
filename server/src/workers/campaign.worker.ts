import { Worker } from 'bullmq';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { queueRedis } from '../lib/redis.js';
import { completeWithOrganizationModel } from '../modules/ai/ai-provider.service.js';
import { discoverCampaignCandidates } from '../modules/campaigns/discovery.service.js';
import { enrichLeadFromPublicWebsite } from '../modules/campaigns/web-crawler.service.js';

const qualificationSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(20).max(1_500),
  recommendedOffer: z.string().min(3).max(300),
  signals: z.array(z.object({ type: z.string(), value: z.string(), confidence: z.number().min(0).max(1), evidenceUrl: z.string().url().nullable() })).max(12),
});

type EvidenceLead = {
  id: string;
  source: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  rawSignals: unknown;
  signals: Array<{ type: string; value: string }>;
};

function includesTerm(value: string | null, terms: string[]) {
  const haystack = value?.toLowerCase() ?? '';
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function evidenceScore(lead: EvidenceLead, campaign: { industries: string[]; locations: string[] }) {
  const raw = lead.rawSignals && typeof lead.rawSignals === 'object' && !Array.isArray(lead.rawSignals)
    ? lead.rawSignals as Record<string, unknown>
    : {};
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };

  if (lead.source?.toLowerCase().includes('google places')) add(15, 'verified through Google Places');
  if (typeof raw.googlePlaceId === 'string' && raw.googlePlaceId) add(10, 'stable Google place identity');
  if (raw.businessStatus === 'OPERATIONAL') add(10, 'listed as operational');
  if (lead.website && !new URL(lead.website).hostname.toLowerCase().includes('google.com')) add(15, 'first-party website found');
  if (typeof raw.phone === 'string' && raw.phone.trim()) add(10, 'public business phone found');
  const rating = typeof raw.rating === 'number' ? raw.rating : 0;
  if (rating > 0) add(Math.min(10, Math.round(rating * 2)), `public rating ${rating}/5`);
  const reviews = typeof raw.userRatingCount === 'number' ? raw.userRatingCount : 0;
  if (reviews > 0) add(Math.min(10, Math.max(2, Math.round(Math.log10(reviews + 1) * 4))), `${reviews} public reviews`);
  if (lead.signals.some((signal) => signal.type === 'WEBSITE_CONTENT')) add(10, 'website evidence crawled');
  if (lead.signals.some((signal) => signal.type === 'SOCIAL_PROFILE')) add(5, 'public social profile found');
  if (includesTerm(lead.industry, campaign.industries)) add(5, 'industry matches campaign');
  if (includesTerm(lead.location, campaign.locations)) add(5, 'location matches campaign');

  return { score: Math.min(100, score), reasons };
}

function providerWarning(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('(402)')) return 'AI qualification is pending because the configured provider requires billing or a different model.';
  return 'AI qualification is pending because the configured provider is currently unavailable.';
}

async function syncPlacesPhoneContact(lead: { id: string; organizationId: string; rawSignals: unknown }) {
  const raw = lead.rawSignals && typeof lead.rawSignals === 'object' && !Array.isArray(lead.rawSignals)
    ? lead.rawSignals as Record<string, unknown>
    : {};
  const phone = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  await prisma.$transaction([
    prisma.contact.deleteMany({ where: { leadId: lead.id, source: 'GOOGLE_PLACES' } }),
    ...(phone ? [prisma.contact.create({ data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      name: 'Public business contact',
      phone,
      source: 'GOOGLE_PLACES',
    } })] : []),
  ]);
}

export const campaignWorker = new Worker(
  'campaign-discovery',
  async (job) => {
    const { campaignId, organizationId } = z.object({ campaignId: z.string(), organizationId: z.string() }).parse(job.data);
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
    if (!campaign) throw new Error('Campaign not found');

    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'DISCOVERING' } });

    const persistedCandidates = await prisma.lead.count({
      where: { campaignId, organizationId },
    });
    if (!persistedCandidates) await discoverCampaignCandidates(campaign);
    const candidates = await prisma.lead.findMany({ where: { campaignId, organizationId, status: 'DISCOVERED' }, take: campaign.targetCount });
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'QUALIFYING' } });

    for (const lead of candidates) {
      await syncPlacesPhoneContact(lead);
      await enrichLeadFromPublicWebsite(lead);
      const enrichedLead = await prisma.lead.findUnique({ where: { id: lead.id }, include: { signals: { orderBy: { confidence: 'desc' }, take: 12 } } });
      if (!enrichedLead) continue;
      const baseline = evidenceScore(enrichedLead, campaign);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          score: baseline.score,
          status: baseline.score >= 60 ? 'QUALIFIED' : 'DISCOVERED',
          aiSummary: `Evidence score based on ${baseline.reasons.join(', ')}.`,
          recommendedOffer: campaign.offer,
        },
      });

      try {
        const result = await completeWithOrganizationModel({
          organizationId,
          system: 'You are a B2B lead qualification engine. Score only from supplied public evidence. Do not infer sensitive traits. Return valid JSON.',
          prompt: JSON.stringify({ offer: campaign.offer, industries: campaign.industries, locations: campaign.locations, businessSize: campaign.businessSize, evidenceScore: baseline.score, lead: enrichedLead }),
          responseSchema: qualificationSchema,
        }) as z.infer<typeof qualificationSchema>;
        const finalScore = Math.round((baseline.score + result.score) / 2);
        await prisma.$transaction(async (transaction) => {
          await transaction.lead.update({
            where: { id: lead.id },
            data: { score: finalScore, aiSummary: result.summary, recommendedOffer: result.recommendedOffer, status: finalScore >= 60 ? 'QUALIFIED' : 'DISCOVERED' },
          });
          await transaction.leadSignal.deleteMany({ where: { leadId: lead.id, source: 'AI_QUALIFICATION' } });
          await transaction.leadSignal.createMany({
            data: result.signals.map((signal) => ({
              leadId: lead.id,
              source: 'AI_QUALIFICATION',
              type: signal.type,
              value: signal.value,
              confidence: signal.confidence,
              ...(signal.evidenceUrl ? { evidenceUrl: signal.evidenceUrl } : {}),
            })),
          });
        });
      } catch (error) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { aiSummary: `${baseline.reasons.join('; ')}. ${providerWarning(error)}` },
        });
      }
    }
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'COMPLETED', failureReason: null } });
    return { qualified: candidates.length };
  },
  { connection: queueRedis, concurrency: 2, limiter: { max: 10, duration: 60_000 } },
);

campaignWorker.on('failed', async (job) => {
  const data = job?.data as { campaignId?: string } | undefined;
  if (data?.campaignId) {
    await prisma.campaign.updateMany({
      where: { id: data.campaignId },
      data: {
        status: 'FAILED',
        failureReason: (job?.failedReason || 'Campaign worker failed').slice(0, 500),
      },
    });
  }
});

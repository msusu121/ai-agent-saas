import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requireOrganization, requireRole } from '../../middleware/auth.js';
import { campaignQueue } from './campaign.queue.js';
import { discoverySources, sourceReady } from './discovery-policy.js';

const router = Router();
router.use(requireOrganization);

router.get('/sources', asyncHandler(async (request, response) => {
  const credentials = await prisma.providerCredential.findMany({ where: { organizationId: request.auth!.organizationId!, isActive: true }, select: { provider: true } });
  response.json({ sources: discoverySources.map((source) => ({ source, ready: sourceReady(source, credentials.map((item) => item.provider)) })) });
}));

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(100),
  offer: z.string().trim().min(20).max(2_000),
  locations: z.array(z.string().trim().min(2).max(100)).min(1).max(20),
  industries: z.array(z.string().trim().min(2).max(100)).min(1).max(20),
  businessSize: z.string().trim().min(2).max(60).nullable().optional(),
  discoverySources: z.array(z.enum(discoverySources)).min(1).max(4).refine((items) => new Set(items).size === items.length, 'Duplicate source').default(['GOOGLE_PLACES', 'WEB']),
  targetCount: z.number().int().min(1).max(500).default(25),
});

router.get('/', asyncHandler(async (request, response) => {
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: request.auth!.organizationId! },
    include: { _count: { select: { leads: true } } },
    orderBy: { createdAt: 'desc' },
  });
  response.json({ campaigns });
}));

router.post('/', requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'), asyncHandler(async (request, response) => {
  const input = campaignSchema.parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const { businessSize, ...requiredInput } = input;
  const campaign = await prisma.campaign.create({
    data: {
      ...requiredInput,
      organizationId,
      ...(businessSize !== undefined ? { businessSize } : {}),
    },
  });
  await prisma.auditLog.create({ data: { organizationId, userId: request.auth!.userId, action: 'CREATE', resourceType: 'Campaign', resourceId: campaign.id } });
  response.status(201).json({ campaign });
}));

router.patch('/:id', requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'), asyncHandler(async (request, response) => {
  const input = campaignSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required').parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const campaignId = String(request.params.id);
  const existing = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true, status: true } });
  if (!existing) throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  if (!['DRAFT', 'READY', 'PAUSED', 'FAILED'].includes(existing.status)) throw new AppError(409, 'Running campaigns cannot be edited', 'CAMPAIGN_RUNNING');
  const campaign = await prisma.campaign.update({ where: { id: campaignId }, data: Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Prisma.CampaignUpdateInput });
  await prisma.auditLog.create({ data: { organizationId, userId: request.auth!.userId, action: 'UPDATE', resourceType: 'Campaign', resourceId: campaign.id } });
  response.json({ campaign });
}));

router.delete('/:id', requireRole('OWNER', 'ADMIN', 'MANAGER'), asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const campaignId = String(request.params.id);
  const existing = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true, status: true } });
  if (!existing) throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  if (!['DRAFT', 'READY', 'PAUSED', 'FAILED', 'COMPLETED'].includes(existing.status)) throw new AppError(409, 'Running campaigns cannot be deleted', 'CAMPAIGN_RUNNING');
  await prisma.campaign.delete({ where: { id: campaignId } });
  await prisma.auditLog.create({ data: { organizationId, userId: request.auth!.userId, action: 'DELETE', resourceType: 'Campaign', resourceId: campaignId } });
  response.status(204).end();
}));

router.post('/:id/run', requireRole('OWNER', 'ADMIN', 'MANAGER'), asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const campaignId = String(request.params.id);
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
  if (!campaign) throw new AppError(404, 'Campaign not found', 'NOT_FOUND');
  if (!['DRAFT', 'READY', 'PAUSED', 'FAILED'].includes(campaign.status)) {
    throw new AppError(409, 'Campaign is already running', 'CAMPAIGN_ALREADY_RUNNING');
  }
  const [discoveryCredentials, aiCredential] = await Promise.all([
    prisma.providerCredential.findMany({ where: { organizationId, provider: { in: ['GOOGLE_PLACES', 'GOOGLE_CUSTOM_SEARCH', 'SERPER', 'BRAVE_SEARCH', 'APIFY'] }, isActive: true }, select: { provider: true } }),
    prisma.providerCredential.findFirst({ where: { organizationId, provider: { in: ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'OPENROUTER', 'GROQ'] }, isActive: true }, select: { id: true } }),
  ]);
  if (!campaign.discoverySources.some((source) => sourceReady(source, discoveryCredentials.map((item) => item.provider)))) throw new AppError(409, 'Connect a provider for your selected sources in Settings. Instagram and Facebook require an Apify API token', 'DISCOVERY_PROVIDER_REQUIRED');
  if (!aiCredential) throw new AppError(409, 'Connect a supported AI provider in Settings before running a search', 'AI_PROVIDER_REQUIRED');
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'QUEUED', discoveryReport: { sources: [] } } });
  const job = await campaignQueue.add('discover-and-qualify', { campaignId: campaign.id, organizationId }, { jobId: `campaign:${campaign.id}:${Date.now()}` });
  response.status(202).json({ campaignId: campaign.id, jobId: job.id, status: 'QUEUED' });
}));

export { router as campaignRouter };

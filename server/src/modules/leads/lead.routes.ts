import { LeadStatus, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requireOrganization, requireRole } from '../../middleware/auth.js';

const router = Router();
router.use(requireOrganization);

const leadInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  website: z.string().trim().url().nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  source: z.string().trim().max(100).nullable().optional(),
  status: z.nativeEnum(LeadStatus).default('DISCOVERED'),
  score: z.number().int().min(0).max(100).default(0),
  estimatedValue: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).default('KES'),
  aiSummary: z.string().trim().max(2_000).nullable().optional(),
  recommendedOffer: z.string().trim().max(1_000).nullable().optional(),
});

router.get('/', asyncHandler(async (request, response) => {
  const query = z.object({
    status: z.nativeEnum(LeadStatus).optional(),
    minimumScore: z.coerce.number().int().min(0).max(100).default(0),
    search: z.string().trim().max(100).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(request.query);
  const organizationId = request.auth!.organizationId!;

  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      score: { gte: query.minimumScore },
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { industry: { contains: query.search, mode: 'insensitive' } },
          { location: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: { signals: { take: 4, orderBy: { confidence: 'desc' } }, contacts: { take: 2 } },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const nextCursor = leads.length > query.limit ? leads.pop()?.id : undefined;
  response.json({ leads, nextCursor });
}));

router.post('/', requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'), asyncHandler(async (request, response) => {
  const input = leadInputSchema.parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const lead = await prisma.lead.create({ data: {
    organizationId, name: input.name, status: input.status, score: input.score, currency: input.currency,
    ...(input.website !== undefined ? { website: input.website } : {}), ...(input.industry !== undefined ? { industry: input.industry } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}), ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.estimatedValue !== undefined ? { estimatedValue: input.estimatedValue } : {}), ...(input.aiSummary !== undefined ? { aiSummary: input.aiSummary } : {}),
    ...(input.recommendedOffer !== undefined ? { recommendedOffer: input.recommendedOffer } : {}),
  } });
  await prisma.auditLog.create({
    data: { organizationId, userId: request.auth!.userId, action: 'CREATE', resourceType: 'Lead', resourceId: lead.id },
  });
  response.status(201).json({ lead });
}));

router.get('/:id', asyncHandler(async (request, response) => {
  const leadId = String(request.params.id);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: request.auth!.organizationId! },
    include: { signals: true, contacts: true, outreach: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!lead) throw new AppError(404, 'Lead not found', 'NOT_FOUND');
  response.json({ lead });
}));

router.patch('/:id/status', asyncHandler(async (request, response) => {
  const { status } = z.object({ status: z.nativeEnum(LeadStatus) }).parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const leadId = String(request.params.id);
  const result = await prisma.lead.updateMany({ where: { id: leadId, organizationId }, data: { status } });
  if (!result.count) throw new AppError(404, 'Lead not found', 'NOT_FOUND');
  await prisma.auditLog.create({ data: { organizationId, userId: request.auth!.userId, action: 'UPDATE', resourceType: 'Lead', resourceId: leadId, metadata: { status } } });
  response.json({ id: leadId, status });
}));

router.patch('/:id', requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'), asyncHandler(async (request, response) => {
  const input = leadInputSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required').parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const leadId = String(request.params.id);
  const existing = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { id: true } });
  if (!existing) throw new AppError(404, 'Lead not found', 'NOT_FOUND');
  const lead = await prisma.lead.update({ where: { id: leadId }, data: Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Prisma.LeadUpdateInput });
  await prisma.auditLog.create({
    data: { organizationId, userId: request.auth!.userId, action: 'UPDATE', resourceType: 'Lead', resourceId: lead.id },
  });
  response.json({ lead });
}));

router.delete('/:id', requireRole('OWNER', 'ADMIN', 'MANAGER'), asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const leadId = String(request.params.id);
  const result = await prisma.lead.deleteMany({ where: { id: leadId, organizationId } });
  if (!result.count) throw new AppError(404, 'Lead not found', 'NOT_FOUND');
  await prisma.auditLog.create({
    data: { organizationId, userId: request.auth!.userId, action: 'DELETE', resourceType: 'Lead', resourceId: leadId },
  });
  response.status(204).end();
}));

export { router as leadRouter };

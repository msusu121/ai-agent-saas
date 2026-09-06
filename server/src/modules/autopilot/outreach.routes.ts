import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requireOrganization, requireRole } from '../../middleware/auth.js';
import { completeWithOrganizationModel } from '../ai/ai-provider.service.js';
import { outreachQueue } from '../campaigns/campaign.queue.js';

const router = Router();
router.use(requireOrganization);

const draftSchema = z.object({ subject: z.string().max(180).nullable(), body: z.string().min(40).max(6_000) });

router.get('/', asyncHandler(async (request, response) => {
  const query = z.object({ leadId: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(request.query);
  const messages = await prisma.outreachMessage.findMany({
    where: { organizationId: request.auth!.organizationId!, ...(query.leadId ? { leadId: query.leadId } : {}) },
    include: { lead: { select: { id: true, name: true, industry: true, location: true, score: true, estimatedValue: true, currency: true, contacts: true } } },
    orderBy: { createdAt: 'desc' },
    take: query.limit,
  });
  response.json({ messages });
}));

router.post('/', requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'), asyncHandler(async (request, response) => {
  const input = z.object({
    leadId: z.string(),
    channel: z.enum(['EMAIL', 'WHATSAPP']),
    recipient: z.string().min(5).max(320),
    subject: z.string().max(180).nullable().optional(),
    body: z.string().min(1).max(6_000),
  }).parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId }, select: { id: true } });
  if (!lead) throw new AppError(404, 'Lead not found', 'NOT_FOUND');
  const message = await prisma.outreachMessage.create({ data: { organizationId, leadId: input.leadId, channel: input.channel, recipient: input.recipient, body: input.body, status: 'DRAFT', ...(input.subject !== undefined ? { subject: input.subject } : {}) } });
  await prisma.auditLog.create({ data: { organizationId, userId: request.auth!.userId, action: 'CREATE', resourceType: 'OutreachMessage', resourceId: message.id } });
  response.status(201).json({ message });
}));

router.post('/leads/:leadId/draft', requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'), asyncHandler(async (request, response) => {
  const { channel, recipient } = z.object({ channel: z.enum(['EMAIL', 'WHATSAPP']), recipient: z.string().min(5).max(320) }).parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const leadId = String(request.params.leadId);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    include: { signals: { orderBy: { confidence: 'desc' }, take: 10 } },
  });
  if (!lead) throw new AppError(404, 'Lead not found', 'NOT_FOUND');

    const draft = await completeWithOrganizationModel({
      organizationId,
      system: 'You write advanced B2B sales outreach grounded only in supplied evidence. Never invent facts. Return JSON with subject and body. For WhatsApp, generate a body that uses the EXACT template structure below — do NOT change the structure, only fill in the three values. Template: "Hi {{1}} 👋 We came across {{2}} and noticed there may be an opportunity to improve how you handle operations. We have a solution designed to help businesses like yours {{3}} — while reducing manual work and making day-to-day operations easier. Would you like me to show you how it could work? Reply YES and I\'ll send you a quick overview or arrange an onsite demonstration with an engineer. Reply STOP to opt out." {param1} = lead/business first name, {param2} = industry category (e.g., "logistics", "hospitality"), {param3} = recommended product or offer from the data. Tone: confident, consultative, warm, not pushy. Always return JSON with subject and body keys.',
      prompt: JSON.stringify({ channel, business: lead.name, industry: lead.industry, location: lead.location, summary: lead.aiSummary, recommendedOffer: lead.recommendedOffer, signals: lead.signals }),
      responseSchema: draftSchema,
    }) as z.infer<typeof draftSchema>;

  const message = await prisma.outreachMessage.create({
    data: {
      organizationId,
      leadId: lead.id,
      channel,
      recipient,
      subject: draft.subject,
      body: draft.body,
      status: 'NEEDS_REVIEW',
    },
  });
  response.status(201).json({ message });
}));

router.post('/:id/approve', requireRole('OWNER', 'ADMIN', 'MANAGER'), asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const messageId = String(request.params.id);
  const message = await prisma.outreachMessage.findFirst({ where: { id: messageId, organizationId } });
  if (!message) throw new AppError(404, 'Outreach message not found', 'NOT_FOUND');
  if (!['DRAFT', 'NEEDS_REVIEW'].includes(message.status)) throw new AppError(409, 'Message is not awaiting approval', 'INVALID_OUTREACH_STATE');
  const scheduledFor = z.object({ scheduledFor: z.coerce.date().optional() }).parse(request.body).scheduledFor ?? new Date();
  await prisma.outreachMessage.update({ where: { id: message.id }, data: { status: 'SCHEDULED', scheduledFor } });
  await outreachQueue.add('deliver', { messageId: message.id, organizationId }, { delay: Math.max(0, scheduledFor.getTime() - Date.now()), jobId: `outreach:${message.id}` });
  await prisma.auditLog.create({ data: { organizationId, userId: request.auth!.userId, action: 'OUTREACH_APPROVE', resourceType: 'OutreachMessage', resourceId: message.id } });
  response.status(202).json({ id: message.id, status: 'SCHEDULED', scheduledFor });
}));

router.patch('/:id', requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'), asyncHandler(async (request, response) => {
  const input = z.object({ subject: z.string().max(180).nullable().optional(), body: z.string().min(1).max(6_000).optional(), recipient: z.string().min(5).max(320).optional() })
    .refine((value) => Object.keys(value).length > 0, 'At least one field is required').parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const messageId = String(request.params.id);
  const message = await prisma.outreachMessage.findFirst({ where: { id: messageId, organizationId } });
  if (!message) throw new AppError(404, 'Outreach message not found', 'NOT_FOUND');
  if (!['DRAFT', 'NEEDS_REVIEW'].includes(message.status)) throw new AppError(409, 'Only drafts awaiting review can be edited', 'INVALID_OUTREACH_STATE');
  const updated = await prisma.outreachMessage.update({ where: { id: messageId }, data: Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Prisma.OutreachMessageUpdateInput });
  await prisma.auditLog.create({ data: { organizationId, userId: request.auth!.userId, action: 'UPDATE', resourceType: 'OutreachMessage', resourceId: updated.id } });
  response.json({ message: updated });
}));

router.delete('/:id', requireRole('OWNER', 'ADMIN', 'MANAGER'), asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const messageId = String(request.params.id);
  const result = await prisma.outreachMessage.deleteMany({ where: { id: messageId, organizationId, status: { in: ['DRAFT', 'NEEDS_REVIEW', 'STOPPED', 'FAILED'] } } });
  if (!result.count) throw new AppError(404, 'Editable outreach message not found', 'NOT_FOUND');
  await prisma.auditLog.create({ data: { organizationId, userId: request.auth!.userId, action: 'DELETE', resourceType: 'OutreachMessage', resourceId: messageId } });
  response.status(204).end();
}));

export { router as outreachRouter };

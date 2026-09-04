import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requireOrganization, requireRole } from '../../middleware/auth.js';
import { autopilotQueue } from '../campaigns/campaign.queue.js';

const router = Router();
router.use(requireOrganization);

router.get('/', asyncHandler(async (request, response) => {
  const config = await prisma.autopilotConfig.findUnique({ where: { organizationId: request.auth!.organizationId! } });
  response.json({ config });
}));

router.put('/', requireRole('OWNER', 'ADMIN', 'MANAGER'), asyncHandler(async (request, response) => {
  const input = z.object({
    enabled: z.boolean(),
    minimumScore: z.number().int().min(0).max(100),
    dailyLimit: z.number().int().min(1).max(500),
    workingDays: z.array(z.number().int().min(0).max(6)).min(1),
    workdayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    workdayEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().min(3).max(60),
    approvalMode: z.enum(['ALL', 'HIGH_VALUE_ONLY', 'NONE']),
    highValueThreshold: z.number().nonnegative().nullable(),
    followUpDays: z.number().int().min(1).max(30),
    stopOnReply: z.boolean(),
    stopOnMeeting: z.boolean(),
  }).parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const config = await prisma.autopilotConfig.upsert({
    where: { organizationId },
    update: input,
    create: { organizationId, ...input },
  });
  await prisma.auditLog.create({
    data: {
      organizationId,
      userId: request.auth!.userId,
      action: input.enabled ? 'AUTOPILOT_RESUME' : 'AUTOPILOT_PAUSE',
      resourceType: 'AutopilotConfig',
      resourceId: config.id,
    },
  });
  response.json({ config });
}));

router.get('/queue', asyncHandler(async (request, response) => {
  const messages = await prisma.outreachMessage.findMany({
    where: { organizationId: request.auth!.organizationId!, status: { in: ['NEEDS_REVIEW', 'SCHEDULED'] } },
    include: { lead: { select: { id: true, name: true, score: true, location: true } } },
    orderBy: [{ status: 'asc' }, { scheduledFor: 'asc' }],
    take: 100,
  });
  response.json({ messages });
}));

router.post('/run', requireRole('OWNER', 'ADMIN', 'MANAGER'), asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const config = await prisma.autopilotConfig.findUnique({ where: { organizationId } });
  if (!config?.enabled) throw new AppError(409, 'Autopilot must be enabled before running a cycle', 'AUTOPILOT_DISABLED');
  const [aiCredential, channelCredential] = await Promise.all([
    prisma.providerCredential.findFirst({ where: { organizationId, isActive: true, provider: { in: ['OPENAI','ANTHROPIC','OPENROUTER','GROQ'] } }, select: { id: true } }),
    prisma.providerCredential.findFirst({ where: { organizationId, isActive: true, provider: { in: ['RESEND','SENDGRID','WHATSAPP'] } }, select: { id: true } }),
  ]);
  if (!aiCredential) throw new AppError(409, 'Connect a supported AI provider before running Autopilot', 'AI_PROVIDER_REQUIRED');
  if (!channelCredential) throw new AppError(409, 'Connect an email or WhatsApp provider before running Autopilot', 'CHANNEL_PROVIDER_REQUIRED');
  const job = await autopilotQueue.add('cycle', { organizationId }, { jobId: `manual:${organizationId}:${Date.now()}` });
  response.status(202).json({ jobId: job.id, status: 'QUEUED' });
}));

export { router as autopilotRouter };

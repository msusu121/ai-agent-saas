import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requireOrganization, requireRole } from '../../middleware/auth.js';

const router = Router();
router.use(requireOrganization);
const stepSchema = z.object({
  position: z.number().int().min(1).max(20),
  delayHours: z.number().int().min(0).max(8760),
  channel: z.enum(['EMAIL', 'WHATSAPP']),
  subject: z.string().max(180).nullable().optional(),
  prompt: z.string().trim().min(10).max(6_000),
});
const sequenceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  isActive: z.boolean().default(true),
  steps: z
    .array(stepSchema)
    .min(1)
    .max(20)
    .refine(
      (steps) =>
        new Set(steps.map((step) => step.position)).size === steps.length,
      'Step positions must be unique',
    ),
});

router.get(
  '/',
  asyncHandler(async (request, response) => {
    const sequences = await prisma.sequence.findMany({
      where: { organizationId: request.auth!.organizationId! },
      include: {
        steps: { orderBy: { position: 'asc' } },
        _count: { select: { outreach: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    response.json({ sequences });
  }),
);

router.post(
  '/',
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'),
  asyncHandler(async (request, response) => {
  const input = sequenceSchema.parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const steps = input.steps.map((step) => ({ ...step, subject: step.subject ?? null }));
    const sequence = await prisma.sequence.create({
      data: {
        organizationId,
        name: input.name,
        isActive: input.isActive,
        steps: { create: steps },
      },
      include: {
        steps: { orderBy: { position: 'asc' } },
        _count: { select: { outreach: true } },
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: request.auth!.userId,
        action: 'CREATE',
        resourceType: 'Sequence',
        resourceId: sequence.id,
      },
    });
    response.status(201).json({ sequence });
  }),
);

router.put(
  '/:id',
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'),
  asyncHandler(async (request, response) => {
    const input = sequenceSchema.parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const sequenceId = String(request.params.id);
  const steps = input.steps.map((step) => ({ ...step, subject: step.subject ?? null }));
    const existing = await prisma.sequence.findFirst({
      where: { id: sequenceId, organizationId },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'Sequence not found', 'NOT_FOUND');
    const sequence = await prisma.$transaction(async (transaction) => {
      await transaction.sequenceStep.deleteMany({ where: { sequenceId } });
      return transaction.sequence.update({
        where: { id: sequenceId },
        data: {
          name: input.name,
          isActive: input.isActive,
          steps: { create: steps },
        },
        include: {
          steps: { orderBy: { position: 'asc' } },
          _count: { select: { outreach: true } },
        },
      });
    });
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: request.auth!.userId,
        action: 'UPDATE',
        resourceType: 'Sequence',
        resourceId: sequence.id,
      },
    });
    response.json({ sequence });
  }),
);

router.delete(
  '/:id',
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  asyncHandler(async (request, response) => {
    const organizationId = request.auth!.organizationId!;
    const sequenceId = String(request.params.id);
    const result = await prisma.sequence.deleteMany({
      where: { id: sequenceId, organizationId },
    });
    if (!result.count)
      throw new AppError(404, 'Sequence not found', 'NOT_FOUND');
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: request.auth!.userId,
        action: 'DELETE',
        resourceType: 'Sequence',
        resourceId: sequenceId,
      },
    });
    response.status(204).end();
  }),
);

export { router as sequenceRouter };

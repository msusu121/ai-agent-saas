import { CredentialProvider, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { encryptSecret } from '../../lib/credentials-crypto.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requireOrganization, requireRole } from '../../middleware/auth.js';
import { testApifyCredential } from '../campaigns/apify-discovery.service.js';

const router = Router();
router.use(requireOrganization, requireRole('OWNER', 'ADMIN'));

router.post('/:id/test', asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const credential = await prisma.providerCredential.findFirst({ where: { id: String(request.params.id), organizationId, provider: 'APIFY', isActive: true } });
  if (!credential) throw new AppError(404, 'Active Apify credential not found', 'NOT_FOUND');
  await testApifyCredential(credential, organizationId);
  response.json({ message: 'Apify token verified. Actor execution and discovery coverage have not been tested. No paid run was started.' });
}));

router.get('/', asyncHandler(async (request, response) => {
  const credentials = await prisma.providerCredential.findMany({
    where: { organizationId: request.auth!.organizationId! },
    select: { id: true, provider: true, label: true, lastFour: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
  });
  response.json({ credentials });
}));

router.post('/', asyncHandler(async (request, response) => {
  const input = z.object({
    provider: z.nativeEnum(CredentialProvider),
    label: z.string().min(2).max(60),
    secret: z.string().min(8).max(8_000),
    configuration: z.record(z.string(), z.unknown()).optional(),
  }).parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const encrypted = encryptSecret(input.secret, organizationId);
  const credential = await prisma.providerCredential.create({
    data: {
      organizationId,
      provider: input.provider,
      label: input.label,
      ...(input.configuration ? { configuration: input.configuration as Prisma.InputJsonValue } : {}),
      ...encrypted,
      lastFour: input.secret.slice(-4),
    },
    select: { id: true, provider: true, label: true, lastFour: true, isActive: true, createdAt: true },
  });
  await prisma.auditLog.create({
    data: { organizationId, userId: request.auth!.userId, action: 'CREDENTIAL_CREATE', resourceType: 'ProviderCredential', resourceId: credential.id },
  });
  response.status(201).json({ credential });
}));

router.patch('/:id', asyncHandler(async (request, response) => {
  const input = z.object({
    label: z.string().min(2).max(60).optional(),
    secret: z.string().min(8).max(8_000).optional(),
    isActive: z.boolean().optional(),
    configuration: z.object({ model: z.string().min(1).max(200) }).optional(),
  }).refine((value) => Object.keys(value).length > 0, 'At least one field is required').parse(request.body);
  const organizationId = request.auth!.organizationId!;
  const credentialId = String(request.params.id);
  const existing = await prisma.providerCredential.findFirst({ where: { id: credentialId, organizationId } });
  if (!existing) throw new AppError(404, 'Credential not found', 'NOT_FOUND');
  const encrypted = input.secret ? encryptSecret(input.secret, organizationId) : null;
  const credential = await prisma.providerCredential.update({
    where: { id: credentialId },
    data: {
      ...(input.label ? { label: input.label } : {}),
      ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
      ...(input.secret ? { ...encrypted!, lastFour: input.secret.slice(-4) } : {}),
      ...(input.configuration ? { configuration: input.configuration as Prisma.InputJsonValue } : {}),
    },
    select: { id: true, provider: true, label: true, lastFour: true, isActive: true, createdAt: true, updatedAt: true },
  });
  if (input.secret) {
    await prisma.auditLog.create({
      data: { organizationId, userId: request.auth!.userId, action: 'CREDENTIAL_ROTATE', resourceType: 'ProviderCredential', resourceId: credential.id },
    });
  }
  response.json({ credential });
}));

router.delete('/:id', asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const credentialId = String(request.params.id);
  const result = await prisma.providerCredential.deleteMany({ where: { id: credentialId, organizationId } });
  if (!result.count) throw new AppError(404, 'Credential not found', 'NOT_FOUND');
  await prisma.auditLog.create({
    data: { organizationId, userId: request.auth!.userId, action: 'CREDENTIAL_DELETE', resourceType: 'ProviderCredential', resourceId: credentialId },
  });
  response.status(204).end();
}));

export { router as credentialRouter };

import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireOrganization } from '../../middleware/auth.js';

const router = Router();

router.get('/current', requireAuth, requireOrganization, asyncHandler(async (request, response) => {
  const organizationId = request.auth!.organizationId!;
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      memberships: { include: { user: { select: { id: true, name: true, email: true, isActive: true } } }, orderBy: { createdAt: 'asc' } },
      auditLogs: { include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 25 },
    },
  });
  response.json({ organization });
}));

router.get('/', requireAuth, asyncHandler(async (request, response) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: request.auth!.userId },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true, plan: true, timezone: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  response.json({ organizations: memberships.map((item) => ({ ...item.organization, role: item.role })) });
}));

export { router as organizationRouter };

import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';

import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    const { payload } = await jwtVerify(header.slice(7), secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') throw new AppError(401, 'Invalid access token', 'UNAUTHORIZED');
    request.auth = { userId: payload.sub };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, 'Invalid or expired access token', 'UNAUTHORIZED'));
  }
};

export const requireOrganization: RequestHandler = async (request, _response, next) => {
  try {
    if (!request.auth) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    const organizationId = request.header('x-organization-id');
    if (!organizationId) throw new AppError(400, 'x-organization-id is required', 'ORGANIZATION_REQUIRED');

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: request.auth.userId, organizationId } },
      select: { role: true },
    });
    if (!membership) throw new AppError(403, 'You are not a member of this organization', 'FORBIDDEN');

    request.auth = { ...request.auth, organizationId, role: membership.role };
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...allowed: Array<'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'>): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth?.role || !allowed.includes(request.auth.role)) {
      next(new AppError(403, 'Insufficient organization permissions', 'FORBIDDEN'));
      return;
    }
    next();
  };
}

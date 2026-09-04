import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors.js';
import { login, register, revokeRefreshToken, rotateRefreshToken } from './auth.service.js';

const router = Router();
const cookieName = 'sales_agent_refresh';
const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
});

router.post('/register', asyncHandler(async (request, response) => {
  const input = credentialsSchema.extend({
    name: z.string().min(2).max(80),
    organizationName: z.string().min(2).max(100),
  }).parse(request.body);
  const userAgent = request.get('user-agent');
  const result = await register({ ...input, ...(userAgent ? { userAgent } : {}) });
  response.cookie(cookieName, result.refreshToken, cookieOptions);
  response.status(201).json({
    accessToken: result.accessToken,
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
    organizationId: result.user.organizationId,
  });
}));

router.post('/login', asyncHandler(async (request, response) => {
  const input = credentialsSchema.parse(request.body);
  const userAgent = request.get('user-agent');
  const result = await login({ ...input, ...(userAgent ? { userAgent } : {}) });
  response.cookie(cookieName, result.refreshToken, cookieOptions);
  response.json({ accessToken: result.accessToken, user: { id: result.user.id, email: result.user.email, name: result.user.name } });
}));

router.post('/refresh', asyncHandler(async (request, response) => {
  const token = request.cookies[cookieName] as string | undefined;
  if (!token) throw new AppError(401, 'Refresh session required', 'UNAUTHORIZED');
  const result = await rotateRefreshToken(token);
  response.cookie(cookieName, result.refreshToken, cookieOptions);
  response.json({ accessToken: result.accessToken });
}));

router.post('/logout', asyncHandler(async (request, response) => {
  const token = request.cookies[cookieName] as string | undefined;
  if (token) await revokeRefreshToken(token);
  response.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
  response.status(204).end();
}));

export { router as authRouter };

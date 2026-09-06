import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requireOrganization, requireRole } from '../../middleware/auth.js';
import { redis } from '../../lib/redis.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { meta } from './meta.service.js';
import { connectPage } from './social.routes.js';

export const socialOAuthRouter = Router();
const version = process.env.META_GRAPH_VERSION ?? 'v23.0';
socialOAuthRouter.post('/start', requireAuth, requireOrganization, requireRole('OWNER', 'ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET || !process.env.META_REDIRECT_URI) throw new AppError(409, 'Meta login is not configured on the server. Use a Page token or configure Meta OAuth.');
  const state = randomBytes(32).toString('hex');
  await redis.set(`social-oauth:${state}`, JSON.stringify({ organizationId: req.auth!.organizationId!, userId: req.auth!.userId }), 'EX', 600);
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: process.env.META_REDIRECT_URI, state, scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish' }).toString();
  res.json({ url: url.toString() });
}));
socialOAuthRouter.get('/callback', asyncHandler(async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!/^[a-f0-9]{64}$/.test(state)) throw new AppError(400, 'Invalid Meta login state');
  const stored = await redis.getdel(`social-oauth:${state}`);
  if (!stored) throw new AppError(400, 'Meta login expired. Connect again.');
  const { organizationId, userId } = JSON.parse(stored) as { organizationId: string; userId: string };
  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId } } });
  if (!membership || !['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) throw new AppError(403, 'Account connection permission no longer available');
  const redirect = new URL('/social', env.WEB_ORIGIN);
  try {
    if (req.query.error || typeof req.query.code !== 'string') throw new Error('Meta login was cancelled');
    const url = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    url.search = new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: process.env.META_REDIRECT_URI!, code: req.query.code }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = await response.json() as { access_token?: string };
    if (!response.ok || !body.access_token) throw new Error('Meta token exchange failed');
    const pages = await meta('me/accounts?fields=id,name,access_token,tasks&limit=100', body.access_token);
    let connected = 0;
    for (const page of pages.data ?? []) {
      if (typeof page.id === 'string' && typeof page.access_token === 'string' && page.tasks?.includes('CREATE_CONTENT')) {
        await connectPage(organizationId, page.id, page.access_token);
        connected++;
      }
    }
    if (!connected) throw new Error('No eligible Pages returned. Check Meta Page permissions.');
    redirect.searchParams.set('connected', String(connected));
  } catch { redirect.searchParams.set('connection_error', 'Meta connection did not complete. Check Page access and app permissions, then try again.'); }
  res.redirect(redirect.toString());
}));

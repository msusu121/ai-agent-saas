import { createHash, randomBytes } from 'node:crypto';

import argon2 from 'argon2';
import { SignJWT } from 'jose';

import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createAccessToken(userId: string): Promise<string> {
  return new SignJWT({ type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

async function createRefreshSession(userId: string, userAgent?: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await prisma.refreshSession.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, ...(userAgent ? { userAgent } : {}) },
  });
  return token;
}

export async function register(input: { email: string; name: string; password: string; organizationName: string; userAgent?: string }) {
  const email = input.email.trim().toLowerCase();
  const slugBase = input.organizationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42);
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  const user = await prisma.$transaction(async (transaction) => {
    const created = await transaction.user.create({ data: { email, name: input.name.trim(), passwordHash } });
    const organization = await transaction.organization.create({
      data: {
        name: input.organizationName.trim(),
        slug: `${slugBase}-${randomBytes(3).toString('hex')}`,
        memberships: { create: { userId: created.id, role: 'OWNER' } },
        autopilot: { create: {} },
      },
    });
    return { ...created, organizationId: organization.id };
  });

  const refreshToken = await createRefreshSession(user.id, input.userAgent);
  return { accessToken: await createAccessToken(user.id), refreshToken, user };
}

export async function login(input: { email: string; password: string; userAgent?: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
  if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, input.password))) {
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }
  const refreshToken = await createRefreshSession(user.id, input.userAgent);
  return { accessToken: await createAccessToken(user.id), refreshToken, user };
}

export async function rotateRefreshToken(token: string) {
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw new AppError(401, 'Invalid refresh session', 'INVALID_REFRESH_TOKEN');
  }

  const replacement = randomBytes(48).toString('base64url');
  await prisma.$transaction([
    prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    prisma.refreshSession.create({
      data: {
        tokenHash: hashToken(replacement),
        userId: session.userId,
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
        ...(session.userAgent ? { userAgent: session.userAgent } : {}),
      },
    }),
  ]);
  return { accessToken: await createAccessToken(session.userId), refreshToken: replacement };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

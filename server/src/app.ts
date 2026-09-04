import { randomUUID } from 'node:crypto';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { errorHandler, notFound } from './lib/errors.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { apiRouter } from './routes/index.js';

export const app = express();

if (env.TRUST_PROXY) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((request, response, next) => {
  request.requestId = request.header('x-request-id') ?? randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
});
app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] }));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/health/live', (_request, response) => response.json({ status: 'ok' }));
app.get('/health/ready', async (_request, response) => {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    response.json({ status: 'ready', services: { postgres: 'ok', redis: 'ok' } });
  } catch {
    response.status(503).json({ status: 'not-ready' });
  }
});

app.use('/api/v1', apiRouter);
app.use(notFound);
app.use(errorHandler);

import { createServer } from 'node:http';

import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { ensurePrivateBucket } from './modules/storage/minio.service.js';

const server = createServer(app);

async function start(): Promise<void> {
  await Promise.all([prisma.$connect(), redis.connect(), ensurePrivateBucket()]);
  server.listen(env.API_PORT, '127.0.0.1', () => {
    console.log(`Sales Agent API listening on http://127.0.0.1:${env.API_PORT}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error) => {
  console.error('API failed to start', error);
  process.exit(1);
});

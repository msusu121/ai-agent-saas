import { Redis } from 'ioredis';

import { env } from '../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  enableReadyCheck: true,
  maxRetriesPerRequest: 2,
  lazyConnect: true,
});

export const queueRedis = new Redis(env.REDIS_URL, {
  enableReadyCheck: true,
  maxRetriesPerRequest: null,
});

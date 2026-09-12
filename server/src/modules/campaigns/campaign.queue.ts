import { Queue } from 'bullmq';

import { queueRedis } from '../../lib/redis.js';

export const campaignQueue = new Queue('campaign-discovery', {
  connection: queueRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 604_800 },
  },
});

export const outreachQueue = new Queue('outreach-delivery', {
  connection: queueRedis,
  defaultJobOptions: {
    attempts: 5,
    // Provider limits are commonly one to ten seconds. Give the provider a
    // full minute before the first retry, then exponential backoff handles
    // sustained throttling without burning all attempts in one window.
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { age: 86_400, count: 5_000 },
    removeOnFail: { age: 1_209_600 },
  },
});

export const autopilotQueue = new Queue('autopilot-cycle', {
  connection: queueRedis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 604_800 },
  },
});

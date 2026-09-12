import { Worker } from 'bullmq';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { queueRedis, redis } from '../lib/redis.js';
import { deliverOutreach } from '../modules/autopilot/channel-delivery.service.js';

export const outreachWorker = new Worker(
  'outreach-delivery',
  async (job) => {
    const { messageId, organizationId, manualApproval } = z.object({ messageId: z.string(), organizationId: z.string(), manualApproval: z.boolean().default(false) }).parse(job.data);
    const [message, config] = await Promise.all([
      prisma.outreachMessage.findFirst({ where: { id: messageId, organizationId }, include: { lead: true } }),
      prisma.autopilotConfig.findUnique({ where: { organizationId } }),
    ]);
    if (!message || (!manualApproval && !config?.enabled) || message.status !== 'SCHEDULED') return { skipped: true };
    if (message.lead.status === 'SUPPRESSED' || (!manualApproval && config?.stopOnReply && message.lead.status === 'REPLIED')) {
      await prisma.outreachMessage.update({ where: { id: message.id }, data: { status: 'STOPPED' } });
      return { stopped: true };
    }

    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: config?.timezone ?? 'UTC' }).format(new Date());
    const rateKey = `outreach:${organizationId}:${dateKey}`;
    const sentToday = await redis.incr(rateKey);
    if (sentToday === 1) await redis.expire(rateKey, 172_800);
    if (sentToday > (config?.dailyLimit ?? 50)) {
      await redis.decr(rateKey);
      throw new Error('Organization daily outreach limit reached');
    }

    await prisma.outreachMessage.update({ where: { id: message.id }, data: { status: 'SENDING' } });

    const deliveryMessage = {
      ...message,
      lead: message.lead ? {
        name: message.lead.name,
        industry: message.lead.industry,
        estimatedValue: message.lead.estimatedValue === null ? null : Number(message.lead.estimatedValue),
        recommendedOffer: message.lead.recommendedOffer,
      } : null,
    };
    let providerId: string;
    try {
      providerId = await deliverOutreach(deliveryMessage);
    } catch (error) {
      // A provider 429 means the attempt was not accepted. Release the local
      // daily counter and let BullMQ retry after its backoff window.
      if (error instanceof Error && /too many requests|rate limit|429/i.test(error.message)) {
        await redis.decr(rateKey);
      }
      throw error;
    }
    await prisma.outreachMessage.update({
      where: { id: message.id },
      data: { status: 'SENT', sentAt: new Date(), providerId },
    });
    console.info(`[outreach] delivered message=${message.id} channel=${message.channel} recipient=${message.recipient} provider=${providerId}`);
    return { sent: true };
  },
  // Stay below the strictest configured provider limit (Resend currently
  // allows ten requests/second) so a burst cannot exhaust all retries.
  { connection: queueRedis, concurrency: 1, limiter: { max: 8, duration: 1_000 } },
);

outreachWorker.on('failed', async (job, error) => {
  const data = job?.data as { messageId?: string } | undefined;
  if (data?.messageId) {
    const retryableRateLimit = /too many requests|rate limit|429/i.test(error.message);
    const retrying = retryableRateLimit && Boolean(job && job.attemptsMade < (job.opts.attempts ?? 1));
    await prisma.outreachMessage.updateMany({
      where: { id: data.messageId, status: { in: ['SCHEDULED', 'SENDING'] } },
      data: retrying
        ? { status: 'SCHEDULED', failureReason: `Provider rate limit reached; retry ${job!.attemptsMade + 1} is scheduled automatically.` }
        : { status: 'FAILED', failureReason: error.message.slice(0, 500) },
    });
    console.error(`[outreach] delivery failed message=${data.messageId}: ${error.message}`);
  }
});

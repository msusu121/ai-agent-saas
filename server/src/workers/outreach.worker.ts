import { Worker } from 'bullmq';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { queueRedis, redis } from '../lib/redis.js';
import { deliverOutreach } from '../modules/autopilot/channel-delivery.service.js';

export const outreachWorker = new Worker(
  'outreach-delivery',
  async (job) => {
    const { messageId, organizationId } = z.object({ messageId: z.string(), organizationId: z.string() }).parse(job.data);
    const [message, config] = await Promise.all([
      prisma.outreachMessage.findFirst({ where: { id: messageId, organizationId }, include: { lead: true } }),
      prisma.autopilotConfig.findUnique({ where: { organizationId } }),
    ]);
    if (!message || !config?.enabled || message.status !== 'SCHEDULED') return { skipped: true };
    if (message.lead.status === 'SUPPRESSED' || (config.stopOnReply && message.lead.status === 'REPLIED')) {
      await prisma.outreachMessage.update({ where: { id: message.id }, data: { status: 'STOPPED' } });
      return { stopped: true };
    }

    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
    const rateKey = `outreach:${organizationId}:${dateKey}`;
    const sentToday = await redis.incr(rateKey);
    if (sentToday === 1) await redis.expire(rateKey, 172_800);
    if (sentToday > config.dailyLimit) {
      await redis.decr(rateKey);
      throw new Error('Organization daily outreach limit reached');
    }

    await prisma.outreachMessage.update({ where: { id: message.id }, data: { status: 'SENDING' } });

    const providerId = await deliverOutreach(message);
    await prisma.outreachMessage.update({
      where: { id: message.id },
      data: { status: 'SENT', sentAt: new Date(), providerId },
    });
    return { sent: true };
  },
  { connection: queueRedis, concurrency: 5, limiter: { max: 20, duration: 1_000 } },
);

outreachWorker.on('failed', async (job, error) => {
  const data = job?.data as { messageId?: string } | undefined;
  if (data?.messageId) {
    await prisma.outreachMessage.updateMany({
      where: { id: data.messageId, status: 'SENDING' },
      data: { status: 'FAILED', failureReason: error.message.slice(0, 500) },
    });
  }
});

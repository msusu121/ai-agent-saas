import { Queue, Worker } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { queueRedis } from '../lib/redis.js';
import { decryptSecret } from '../lib/credentials-crypto.js';
import { publishMeta, PublishUncertain } from '../modules/social/meta.service.js';
import { validatePost } from '../modules/social/social-policy.js';

export const socialQueue = new Queue('social-publishing', { connection: queueRedis });
export const socialWorker = new Worker('social-publishing', async () => {
  // A crashed publish may have reached Meta. Never replay it automatically.
  await prisma.socialPost.updateMany({ where: { status: 'PUBLISHING', updatedAt: { lt: new Date(Date.now() - 15 * 60000) } }, data: { status: 'UNCERTAIN', failureReason: 'Worker interrupted during publishing. Verify the social account before creating a replacement.' } });
  const due = await prisma.socialPost.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 5 });
  for (const item of due) {
    const claim = await prisma.socialPost.updateMany({ where: { id: item.id, status: 'SCHEDULED' }, data: { status: 'PUBLISHING' } });
    if (!claim.count) continue;
    let published = false;
    try {
      const post = await prisma.socialPost.findUniqueOrThrow({ where: { id: item.id }, include: { account: true } });
      if (!post.account.active) throw new Error('Social account is disconnected');
      validatePost(post.account.platform, post.caption, post.imageUrl);
      const result = await publishMeta(post, post.account, decryptSecret(post.account, post.organizationId), async containerId => { await prisma.socialPost.update({ where: { id: post.id }, data: { containerId } }); });
      published = true;
      await prisma.socialPost.update({ where: { id: post.id }, data: { ...result, status: 'PUBLISHED', publishedAt: new Date(), failureReason: null } });
      console.info(`[social] published post=${post.id} provider=${result.providerId}`);
    } catch (error) {
      await prisma.socialPost.update({ where: { id: item.id }, data: { status: published || error instanceof PublishUncertain ? 'UNCERTAIN' : 'FAILED', failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Publishing failed' } });
      console.error(`[social] failed post=${item.id}`);
    }
  }
}, { connection: queueRedis, concurrency: 1 });
socialWorker.on('error', error => console.error('[social] worker error', error.message));
await socialQueue.add('scan-due', {}, { jobId: 'social-scan', repeat: { every: 15000 }, removeOnComplete: 20, removeOnFail: 20 });

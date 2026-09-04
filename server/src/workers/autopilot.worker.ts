import { Worker } from 'bullmq';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { queueRedis } from '../lib/redis.js';
import { completeWithOrganizationModel } from '../modules/ai/ai-provider.service.js';
import { outreachQueue } from '../modules/campaigns/campaign.queue.js';

const draftSchema = z.object({ subject: z.string().max(180).nullable(), body: z.string().min(40).max(6_000) });

export const autopilotWorker = new Worker('autopilot-cycle', async (job) => {
  const { organizationId } = z.object({ organizationId: z.string() }).parse(job.data);
  const config = await prisma.autopilotConfig.findUnique({ where: { organizationId } });
  if (!config?.enabled) return { skipped: 'disabled' };

  const parts = new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.find((part) => part.type === 'weekday')?.value ?? '');
  const time = `${parts.find((part) => part.type === 'hour')?.value}:${parts.find((part) => part.type === 'minute')?.value}`;
  if (!config.workingDays.includes(weekday) || time < config.workdayStart || time > config.workdayEnd) return { skipped: 'outside-working-hours' };

  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const used = await prisma.outreachMessage.count({ where: { organizationId, createdAt: { gte: startOfDay }, status: { in: ['SCHEDULED','SENDING','SENT','DELIVERED','OPENED','REPLIED'] } } });
  const capacity = Math.max(0, Math.min(10, config.dailyLimit - used));
  if (!capacity) return { skipped: 'daily-limit' };

  const channelCredential = await prisma.providerCredential.findFirst({ where: { organizationId, isActive: true, provider: { in: ['RESEND','SENDGRID','WHATSAPP'] } }, orderBy: { updatedAt: 'desc' } });
  if (!channelCredential) return { skipped: 'channel-provider-required' };
  const leads = await prisma.lead.findMany({
    where: { organizationId, score: { gte: config.minimumScore }, status: { notIn: ['REPLIED','MEETING','WON','LOST','SUPPRESSED'] }, outreach: { none: { createdAt: { gte: new Date(Date.now() - config.followUpDays * 86_400_000) }, status: { notIn: ['FAILED','STOPPED'] } } } },
    include: { contacts: { where: { OR: [{ email: { not: null } }, { whatsapp: { not: null } }] }, take: 1 }, signals: { orderBy: { confidence: 'desc' }, take: 5 } },
    orderBy: { score: 'desc' }, take: capacity,
  });
  let created = 0;
  for (const lead of leads) {
    const contact = lead.contacts[0]; if (!contact) continue;
    const useEmail = ['RESEND','SENDGRID'].includes(channelCredential.provider) && Boolean(contact.email);
    const recipient = useEmail ? contact.email : contact.whatsapp;
    if (!recipient) continue;
    const draft = await completeWithOrganizationModel({ organizationId, system: 'Write concise, respectful B2B outreach grounded only in supplied evidence. Return JSON with subject and body. Include an email opt-out.', prompt: JSON.stringify({ business: lead.name, industry: lead.industry, location: lead.location, summary: lead.aiSummary, offer: lead.recommendedOffer, signals: lead.signals }), responseSchema: draftSchema }) as z.infer<typeof draftSchema>;
    const highValue = config.highValueThreshold !== null && lead.estimatedValue !== null && lead.estimatedValue.greaterThanOrEqualTo(config.highValueThreshold);
    const needsReview = config.approvalMode === 'ALL' || (config.approvalMode === 'HIGH_VALUE_ONLY' && highValue);
    const message = await prisma.outreachMessage.create({ data: { organizationId, leadId: lead.id, channel: useEmail ? 'EMAIL' : 'WHATSAPP', recipient, subject: draft.subject, body: draft.body, status: needsReview ? 'NEEDS_REVIEW' : 'SCHEDULED', ...(!needsReview ? { scheduledFor: new Date() } : {}) } });
    if (!needsReview) await outreachQueue.add('deliver', { messageId: message.id, organizationId }, { jobId: `outreach:${message.id}` });
    created += 1;
  }
  return { created };
}, { connection: queueRedis, concurrency: 2 });

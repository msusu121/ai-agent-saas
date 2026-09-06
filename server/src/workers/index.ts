import { autopilotQueue } from '../modules/campaigns/campaign.queue.js';
import { prisma } from '../lib/prisma.js';
import './campaign.worker.js';
import './outreach.worker.js';
import './autopilot.worker.js';
import './social.worker.js';

const configs = await prisma.autopilotConfig.findMany({ where: { enabled: true }, select: { organizationId: true } });
for (const config of configs) {
  await autopilotQueue.add('cycle', { organizationId: config.organizationId }, { jobId: `scheduled:${config.organizationId}`, repeat: { every: 15 * 60_000 } });
}

console.log(`Workers ready: campaign discovery, autopilot, outreach (${configs.length} scheduled organizations)`);

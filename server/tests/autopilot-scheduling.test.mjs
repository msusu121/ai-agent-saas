import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Job } from 'bullmq';
import { z } from 'zod';

// Execute the actual compiled worker processor without opening Redis, invoking AI,
// touching a database, or contacting a recipient. Keep BullMQ job validation real.
async function harness({ approvalMode = 'NONE', queueFailure = false } = {}) {
  const rows = [];
  const jobs = [];
  let processor;
  const context = vm.createContext({ Date, Intl, console });
  const prisma = {
    autopilotConfig: { async findUnique() { return {
      enabled: true, approvalMode, highValueThreshold: null, dailyLimit: 20,
      minimumScore: 80, followUpDays: 3, timezone: 'UTC',
      workingDays: [0, 1, 2, 3, 4, 5, 6], workdayStart: '00:00', workdayEnd: '23:59',
    }; } },
    providerCredential: { async findFirst() { return { provider: 'RESEND' }; } },
    lead: { async findMany() { return [{ id: 'lead-test', name: 'Test business',
      estimatedValue: null, contacts: [{ email: 'nobody@example.invalid' }], signals: [],
    }]; } },
    outreachMessage: {
      async count() { return 0; },
      async create({ data }) { const row = { id: 'message-test', ...data }; rows.push(row); return row; },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of rows) {
          if (Object.entries(where).every(([key, value]) => row[key] === value)) {
            Object.assign(row, data); count++;
          }
        }
        return { count };
      },
    },
  };
  const outreachQueue = { async add(name, data, opts) {
    if (queueFailure) throw new Error('simulated queue outage');
    const fakeJob = {
      opts, name, id: opts.jobId,
      asJSON: () => ({ data: JSON.stringify(data), opts }),
      validateOptions: Job.prototype.validateOptions,
      scripts: { async addJob() { jobs.push({ name, data, opts }); return opts.jobId; } },
    };
    return Job.prototype.addJob.call(fakeJob, {});
  } };
  const dependencies = {
    bullmq: { Worker: class { constructor(_name, handler) { processor = handler; } } },
    zod: { z },
    '../lib/prisma.js': { prisma },
    '../lib/redis.js': { queueRedis: {} },
    '../modules/ai/ai-provider.service.js': { completeWithOrganizationModel: async () => ({
      subject: 'Test draft', body: 'This draft is for a local scheduling test only. No message is sent.',
    }) },
    '../modules/campaigns/campaign.queue.js': { outreachQueue },
  };
  const source = await readFile(new URL('../dist/workers/autopilot.worker.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    const values = dependencies[specifier];
    assert.ok(values, `Unexpected worker dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { run: () => processor({ data: { organizationId: 'organization-test' } }), rows, jobs };
}

test('automatic draft becomes a valid BullMQ delivery job instead of orphaned Scheduled', async () => {
  const h = await harness();
  await h.run();
  assert.equal(h.rows[0].status, 'SCHEDULED');
  assert.equal(h.jobs.length, 1);
  assert.equal(h.jobs[0].data.messageId, h.rows[0].id);
  assert.equal(h.jobs[0].data.organizationId, h.rows[0].organizationId);
});

test('approval-required drafts do not enter the delivery queue', async () => {
  const h = await harness({ approvalMode: 'ALL' });
  await h.run();
  assert.equal(h.rows[0].status, 'NEEDS_REVIEW');
  assert.equal(h.jobs.length, 0);
});

test('enqueue failure preserves the draft for review instead of claiming Scheduled', async () => {
  const h = await harness({ queueFailure: true });
  await assert.rejects(h.run(), /simulated queue outage/);
  assert.equal(h.rows[0].status, 'NEEDS_REVIEW');
  assert.equal(h.rows[0].scheduledFor, null);
  assert.ok(h.rows[0].failureReason);
  assert.equal(h.jobs.length, 0);
});

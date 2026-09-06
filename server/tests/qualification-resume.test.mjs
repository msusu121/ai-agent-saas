import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { z } from 'zod';

test('worker preserves contacts on failure and resumes unfinished leads without rediscovery', async () => {
  let handler, failing = true, discoveries = 0;
  const calls = [], contacts = [];
  const leads = ['one', 'two'].map(id => ({ id, campaignId: 'campaign', organizationId: 'org', name: id, status: 'DISCOVERED', aiSummary: null, rawSignals: { email: `${id}@example.com` } }));
  const campaign = { id: 'campaign', organizationId: 'org', targetCount: 5, offer: 'Attendance software', industries: ['School'], locations: ['Kenya'], discoveryReport: {} };
  const db = {
    campaign: { findFirst: async () => campaign, findUnique: async () => campaign, update: async ({ data }) => Object.assign(campaign, data), updateMany: async () => ({ count: 1 }) },
    lead: { count: async () => leads.length, findMany: async ({ where }) => leads.filter(l => l.status === where.status && l.aiSummary === where.aiSummary), findUnique: async ({ where }) => leads.find(l => l.id === where.id), update: async ({ where, data }) => Object.assign(leads.find(l => l.id === where.id), data) },
    contact: { findFirst: async ({ where }) => contacts.find(c => c.leadId === where.leadId), create: async ({ data }) => { contacts.push(data); return data; } },
    leadSignal: { createMany: async () => ({ count: 1 }) },
    $transaction: async callback => callback(db),
  };
  class Worker { constructor(name, callback) { handler = callback; } on() {} }
  class AppError extends Error {}
  const complete = async input => {
    const payload = JSON.parse(input.prompt);
    assert.ok(payload.requiredOutput.score);
    calls.push(payload.lead.id);
    if (failing && payload.lead.id === 'one') throw new Error('simulated provider failure');
    return { score: 82, summary: 'Evidence supports this school opportunity.', recommendedOffer: 'Attendance software', signals: [] };
  };
  const modules = {
    bullmq: { Worker }, zod: { z }, '../lib/prisma.js': { prisma: db }, '../lib/errors.js': { AppError }, '../lib/redis.js': { queueRedis: {} },
    '../modules/ai/ai-provider.service.js': { completeWithOrganizationModel: complete },
    '../modules/campaigns/discovery.service.js': { discoverCampaignCandidates: async () => { discoveries++; } },
    '../modules/campaigns/web-crawler.service.js': { enrichLeadFromPublicWebsite: async () => ({ enriched: false }) },
  };
  const source = await readFile(new URL('../dist/workers/campaign.worker.js', import.meta.url), 'utf8');
  const module = new SourceTextModule(source);
  await module.link(async specifier => {
    const values = modules[specifier];
    assert.ok(values, `Unexpected dependency ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
  });
  await module.evaluate();
  const job = { data: { campaignId: 'campaign', organizationId: 'org', qualificationOnly: true }, attemptsMade: 0 };
  await assert.rejects(handler(job), /Qualification incomplete/);
  assert.equal(contacts.length, 2);
  assert.equal(leads[0].aiSummary, null);
  assert.equal(leads[1].score, 82);
  assert.equal(campaign.discoveryReport.qualification.failures[0].leadId, 'one');
  failing = false;
  await handler({ ...job, attemptsMade: 1 });
  assert.deepEqual(calls, ['one', 'two', 'one']);
  assert.equal(contacts.length, 2);
  assert.equal(discoveries, 0);
  assert.equal(campaign.status, 'COMPLETED');
  assert.ok(leads.every(l => l.score === 82));
});

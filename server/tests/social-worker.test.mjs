import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

async function fixture({ active = true, uncertain = false } = {}) {
  let handler, calls = 0;
  const row = { id: 'post', organizationId: 'org', status: 'SCHEDULED', caption: 'Useful post', imageUrl: null, account: { active, platform: 'FACEBOOK' } };
  class PublishUncertain extends Error {}
  const prisma = { socialPost: {
    findMany: async () => row.status === 'SCHEDULED' ? [{ id: row.id }] : [],
    updateMany: async ({ where, data }) => { if (where.id && row.status === where.status) { Object.assign(row, data); return { count: 1 }; } return { count: 0 }; },
    findUniqueOrThrow: async () => row,
    update: async ({ data }) => { Object.assign(row, data); return row; },
  } };
  const context = vm.createContext({ console: { info() {}, error() {} }, Date });
  const exports = {
    bullmq: { Queue: class { async add() {} }, Worker: class { constructor(name, fn) { handler = fn; } on() {} } },
    '../lib/prisma.js': { prisma }, '../lib/redis.js': { queueRedis: {} },
    '../lib/credentials-crypto.js': { decryptSecret: () => 'fixture-token' },
    '../modules/social/meta.service.js': { PublishUncertain, publishMeta: async () => { calls++; if (uncertain) throw new PublishUncertain('response lost'); return { providerId: 'meta-post', permalink: 'https://facebook.com/meta-post' }; } },
    '../modules/social/social-policy.js': { validatePost() {} },
  };
  const module = new vm.SourceTextModule(readFileSync(new URL('../dist/workers/social.worker.js', import.meta.url), 'utf8'), { context });
  await module.link(async name => { const values = exports[name]; assert.ok(values, name); return new vm.SyntheticModule(Object.keys(values), function() { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }); });
  await module.evaluate();
  return { run: () => handler(), row, calls: () => calls };
}
test('concurrent scans claim a scheduled post once', async () => {
  const f = await fixture(); await Promise.all([f.run(), f.run()]);
  assert.equal(f.calls(), 1); assert.equal(f.row.status, 'PUBLISHED'); assert.equal(f.row.providerId, 'meta-post');
});
test('uncertain publish is never automatically resent', async () => {
  const f = await fixture({ uncertain: true }); await f.run(); await f.run();
  assert.equal(f.calls(), 1); assert.equal(f.row.status, 'UNCERTAIN');
});
test('disconnected accounts do not publish', async () => {
  const f = await fixture({ active: false }); await f.run();
  assert.equal(f.calls(), 0); assert.equal(f.row.status, 'FAILED');
});

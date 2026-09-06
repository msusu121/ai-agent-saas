import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../../lib/message-delivery.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { deliveryTargets, submitDeliveries } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('selects both channels across contacts, or only the available channel', () => {
  assert.deepEqual(deliveryTargets([{ email: ' test@example.com ', whatsapp: null }, { email: null, whatsapp: '+254700000000' }]).map(t => t.channel), ['EMAIL', 'WHATSAPP']);
  assert.equal(deliveryTargets([{ email: 'test@example.com', whatsapp: null }])[0].channel, 'EMAIL');
  assert.equal(deliveryTargets([{ email: null, whatsapp: '+254700000000' }])[0].channel, 'WHATSAPP');
  assert.deepEqual(deliveryTargets([{ email: ' ', whatsapp: null }]), []);
});
test('partial failure retries only unfinished channel and reuses its draft', async () => {
  const attempts = deliveryTargets([{ email: 'test@example.com', whatsapp: '+254700000000' }]);
  const created = [], approved = [];
  let fail = true;
  const create = async target => { created.push(target.channel); return target.channel; };
  const approve = async id => { approved.push(id); if (id === 'WHATSAPP' && fail) throw new Error('queue unavailable'); };
  assert.equal((await submitDeliveries(attempts, create, approve)).length, 1);
  fail = false;
  assert.deepEqual(await submitDeliveries(attempts, create, approve), []);
  assert.deepEqual(created, ['EMAIL', 'WHATSAPP']);
  assert.deepEqual(approved, ['EMAIL', 'WHATSAPP', 'WHATSAPP']);
});

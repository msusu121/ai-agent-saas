import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePost, parseSocialDraft, trackedLink } from '../dist/modules/social/social-policy.js';
import { publishMeta, PublishUncertain } from '../dist/modules/social/meta.service.js';

test('Instagram requires media, and AI must provide a complete draft', () => {
  assert.throws(() => validatePost('INSTAGRAM', 'A helpful post', null), /JPEG/);
  assert.doesNotThrow(() => validatePost('FACEBOOK', 'A helpful post', null));
  assert.throws(() => validatePost('INSTAGRAM', 'A'.repeat(2201), 'https://example.com/a.jpg'), /long/);
  assert.throws(() => parseSocialDraft('{"caption":"hello"}'));
  const draft = { caption: 'Practical advice for your business', creativeBrief: 'Show the actual product interface', rationale: 'Specific advice for the intended buyer' };
  assert.deepEqual(parseSocialDraft('```json\n' + JSON.stringify(draft) + '\n```'), draft);
});
test('tracked links preserve the product website and existing parameters', () => {
  const url = new URL(trackedLink('https://example.com/demo?lang=en', 'FACEBOOK', 'product-1'));
  assert.equal(url.searchParams.get('utm_source'), 'facebook');
  assert.equal(url.searchParams.get('lang'), 'en');
});
test('Facebook requires a provider ID before reporting success', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(publishMeta({ caption: 'hello', imageUrl: null, containerId: null }, { platform: 'FACEBOOK', externalId: '123' }, 'test', async () => {}), PublishUncertain);
    globalThis.fetch = async () => Response.json({ id: '123_456' });
    const result = await publishMeta({ caption: 'hello', imageUrl: null, containerId: null }, { platform: 'FACEBOOK', externalId: '123' }, 'test', async () => {});
    assert.equal(result.providerId, '123_456');
  } finally { globalThis.fetch = original; }
});
test('Instagram persists the container and publishes only after FINISHED', async () => {
  const original = globalThis.fetch, calls = [], saved = [];
  try {
    const responses = [{ id: 'container' }, { status_code: 'FINISHED' }, { id: 'media' }, { permalink: 'https://instagram.com/p/test' }];
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json(responses.shift()); };
    const result = await publishMeta({ caption: 'hello', imageUrl: 'https://example.com/a.jpg', containerId: null }, { platform: 'INSTAGRAM', externalId: '123' }, 'test', async id => saved.push(id));
    assert.deepEqual(saved, ['container']);
    assert.equal(JSON.parse(calls[2].options.body).creation_id, 'container');
    assert.equal(result.providerId, 'media');
    globalThis.fetch = async () => Response.json({ status_code: 'IN_PROGRESS' });
    await assert.rejects(publishMeta({ caption: 'hello', imageUrl: 'https://example.com/a.jpg', containerId: 'container' }, { platform: 'INSTAGRAM', externalId: '123' }, 'test', async () => assert.fail()), /IN_PROGRESS/);
  } finally { globalThis.fetch = original; }
});
test('a lost publishing response is uncertain, never a safe automatic retry', async () => {
  const original = globalThis.fetch;
  try { globalThis.fetch = async () => { throw new Error('timeout'); }; await assert.rejects(publishMeta({ caption: 'hello', imageUrl: null, containerId: null }, { platform: 'FACEBOOK', externalId: '123' }, 'test', async () => {}), PublishUncertain); }
  finally { globalThis.fetch = original; }
});

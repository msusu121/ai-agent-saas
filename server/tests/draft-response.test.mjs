import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDraftResponse } from '../dist/modules/autopilot/draft-response.js';
const body = 'Could we discuss how the proposed service could help your team?';
test('accepts plain or fenced JSON and optional subject', () => {
  assert.deepEqual(parseDraftResponse(JSON.stringify({ body })), { subject: null, body });
  assert.deepEqual(parseDraftResponse('```json\n' + JSON.stringify({ body, subject: 'Hello' }) + '\n```'), { subject: 'Hello', body });
});
test('rejects malformed and incomplete drafts with an actionable error', () => {
  for (const input of ['not json', '{"body":"short"}', '{"body":42}']) {
    assert.throws(() => parseDraftResponse(input), error => error.code === 'AI_DRAFT_FORMAT' && error.status === 502);
  }
});

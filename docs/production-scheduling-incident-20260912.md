# Production scheduling repair - 2026-09-12

## Result

Fixed the production Autopilot enqueue defect, restarted only `sales-worker`, and verified the real Redis-to-delivery-worker path. Production readiness reports PostgreSQL and Redis healthy. No customer messages were sent during diagnosis, regression tests, smoke testing, or backlog recovery.

Recovered 22 orphaned scheduled drafts: 18 moved to NEEDS_REVIEW; 4 moved to STOPPED because their leads were already at MEETING. Original status metadata was backed up and every recovery transition was audited. Existing SENT (3) and FAILED (1) records were unchanged.

## Confirmed cause

Production runs from `/var/www/ai-agent-saas/server`, with API and workers managed by PM2. Observed repository baseline: `cc48e9f`; installed BullMQ: `5.81.4`. Production has code newer than this OneDrive workspace, including manual approval fixes and social modules. Do not deploy the whole workspace over it.

Manual approval already uses `outreach-${message.id}`. Autopilot still used `outreach:${message.id}`. BullMQ rejected those IDs with `Custom Id cannot contain :` after Autopilot had created SCHEDULED database records. Production failed Autopilot jobs contain the exact error.

Before repair: 22 SCHEDULED records, none with either expected queue ID, no sentAt or providerId; delivery queue had zero active/waiting/delayed jobs and one connected worker. This was an enqueue defect, not a Redis outage.

## Applied change

Only `src/workers/autopilot.worker.ts`, its compiled JS and source map were replaced on production. The production-specific AI instructions were preserved. A regression test was added under `server/tests`.

- Use a valid hyphenated delivery job ID.
- If enqueue fails, preserve the generated draft as NEEDS_REVIEW with a generic failure explanation and clear its scheduled timestamp.
- Guard recovery by organization, message ID and SCHEDULED status so it does not roll back a worker that has already claimed the message.
- Rethrow the original enqueue error so the Autopilot job records failure.

This is a targeted repair, not a complete transactional outbox implementation. Ambiguous queue responses, provider acceptance/retry semantics and durable reconciliation remain part of the upgrade backlog.

## Verification

`node --experimental-vm-modules --test tests/autopilot-scheduling.test.mjs`

The harness loads the actual compiled Autopilot processor and uses BullMQ's actual addJob validation, while replacing database/AI/transport dependencies. No provider calls are possible in this harness.

Before patch, both the local worker and a copy of the deployed worker failed two tests: invalid automatic delivery ID and stale SCHEDULED state after queue failure. The approval-required test passed. After patch, all three passed locally, against the staged production build, and against the installed production build.

Local API TypeScript build and staged production TypeScript build succeeded. All four worker queues had zero active jobs before restarting `sales-worker`.

Live smoke: enqueue a unique nonexistent message ID on the actual outreach-delivery queue, wait for the real worker's `{skipped:true}` response, then remove that diagnostic job. No message row, recipient or provider call was involved. Result: `LIVE_QUEUE_WORKER_PASS`.

Public API readiness: `https://apiagent.akilimatic.com/health/ready` returned `status: ready`, PostgreSQL `ok`, Redis `ok`. One delivery worker remained connected after restart. Final message counts: NEEDS_REVIEW 18, STOPPED 4, FAILED 1, SENT 3, SCHEDULED 0.

This proves scheduling and worker connectivity, not an end-to-end customer delivery. Provider delivery was deliberately not exercised with a real recipient.

## Backups and rollback

Production originals: `/var/backups/bizhunter/20260912-scheduling/`, containing original worker source, compiled JS/map, and `message-statuses.json` (restricted mode; status metadata only).

If application rollback is necessary, restore only the three worker files from that directory and restart only `sales-worker`. That restores the known enqueue defect, so keep Autopilot paused during such a rollback. Do not restore old Scheduled states or replay messages automatically. The recovered drafts need current seller review.

Staged build and test copies: `/tmp/bizhunter-scheduling-20260912/`. No database migrations, credentials, provider settings, frontend files or other applications were changed.

## Other observed issues and upgrade baseline

- Historical Autopilot jobs also failed due to OpenRouter free-model rate limits (429) and invalid structured AI responses. These were not silently changed to another or paid provider.
- One prior delivery failure reports a missing WhatsApp Business connection. This is separate from the queue-ID defect.
- The enabled organization works Monday-Friday, 08:40-20:06 Africa/Nairobi. The repair occurred on Saturday; no forced live Autopilot cycle was run outside those settings.
- The OneDrive workspace is not the deployed source baseline. The earlier upgrade assessment describes that workspace; reconcile it against production before deciding which social/inbox capabilities are still missing.
- Retain the current behavior of manual approvals from production; the older local approval route must not overwrite it.

Next engineering phase: establish the correct source checkout, carry this patch into it, reassess production's existing social modules, and then implement the mobile-first product/knowledge foundation using additive migrations and feature flags.

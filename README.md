# Sales Agent SaaS

A mobile-first, multi-tenant AI sales agent. Organizations describe what they sell; the system discovers businesses, evaluates public evidence of need, enriches appropriate contacts, drafts personalized outreach, and manages safe follow-up.

Akilimatic is the founding organization and one tenant. The product is not hard-wired to Akilimatic: every business record, provider credential, file, campaign, queue item, and outreach rule is scoped to an organization.

## Runtime split

- Frontend: App Router-compatible React application, run locally with npm.
- API: Express 5 + Prisma, run locally with npm from `server/`.
- PostgreSQL, Redis, and MinIO: Docker Compose only.
- Workers: BullMQ processes run locally with npm and use Docker Redis.

Node.js and Express are intentionally not containerized for the local development workflow.

## Start locally

1. Copy `.env.example` to `.env` and replace every `change-me`/`replace-with` value.
2. Generate the two 32-byte secrets with `openssl rand -hex 32`.
3. Run `npm run infra:up`.
4. Run `npm run db:generate`, then `npm run db:migrate`.
5. Run `npm --prefix server run prisma:seed` to load the repeatable multi-tenant demo dataset.
6. Run `npm run api:dev` and, in another terminal, `npm run api:worker`.
7. Run `npm run dev -- --hostname 127.0.0.1 --port 3300` for the standard Next.js frontend.

The checked-in `.env.example` keeps conventional defaults. This local checkout uses conflict-free ports because other Docker projects are active: frontend `http://127.0.0.1:3300`, API `http://127.0.0.1:4400`, PostgreSQL `35432`, Redis `36379`, MinIO API `39000`, and MinIO console `http://127.0.0.1:39001`.

Demo login after seeding: `hasan@akilimatic.demo` / `DemoPass!2026`. The seed creates two organizations so tenant switching and organization isolation can be exercised immediately.

## Security model

- Organization membership is verified server-side from `x-organization-id`; client state is never trusted for tenancy.
- Provider API keys are encrypted with AES-256-GCM. The organization ID and key version are authenticated additional data, preventing ciphertext from being moved between tenants.
- API keys are never returned after creation; the UI receives only provider metadata and the last four characters.
- Passwords use Argon2id. Access tokens are short-lived. Refresh tokens are random, rotated, stored only as SHA-256 hashes, and sent as strict HTTP-only cookies.
- Credential changes and outreach approvals are audit logged.
- CORS is allowlisted, security headers are enabled, JSON bodies are limited, auth routes are rate limited, and sensitive headers are redacted from logs.
- MinIO object keys start with the organization ID, while metadata ownership remains in PostgreSQL.
- Autopilot enforces per-organization daily limits, approval rules, suppression status, and stop-on-reply conditions before delivery jobs run.

The `.env` file and real secrets must never be committed.

## AI and discovery design

Provider credentials are organization-owned and the AI layer selects an active supported provider at runtime. OpenAI, Anthropic, OpenRouter, and Groq reasoning adapters are defined. Google Places, Apollo, Meta, WhatsApp Business, and email providers belong behind official APIs; account scraping is deliberately excluded.

The campaign worker separates discovery from qualification:

`discover → normalize → collect evidence → qualify → score → draft → approve/rules → send → follow up → stop on reply/meeting`

This makes the system easier to test, retry, audit, and extend without coupling the UI to a single model or data vendor.

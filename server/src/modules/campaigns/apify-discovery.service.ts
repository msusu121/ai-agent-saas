import { createHash } from 'node:crypto';
import type { Campaign, ProviderCredential } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { decryptSecret } from '../../lib/credentials-crypto.js';
import { AppError } from '../../lib/errors.js';
import { socialProfile } from './discovery-policy.js';
import type { Candidate } from './discovery.service.js';

type SocialSource = 'INSTAGRAM' | 'FACEBOOK';
const actors = { INSTAGRAM: 'apify~instagram-search-scraper', FACEBOOK: 'apify~facebook-search-scraper' };
const str = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 4000) : '';
const fail = (message: string) => new AppError(502, message, 'APIFY_DISCOVERY_ERROR');

export function apifyInput(campaign: Campaign, source: SocialSource) {
  const limit = Math.max(1, Math.min(campaign.targetCount, 250));
  const queries = campaign.industries.flatMap(industry => campaign.locations.map(location => `${industry} ${location}`.replaceAll(',', ' ')));
  if (queries.length > 20) throw fail('Apify searches support up to 20 industry/location combinations per campaign. Split this search into smaller campaigns.');
  if (!queries.length) throw fail('Provide an industry and location for social discovery.');
  return source === 'INSTAGRAM'
    ? { search: queries.join(','), searchType: 'user', searchLimit: Math.min(250, Math.ceil(limit / queries.length)), enhanceUserSearchWithFacebookPage: false }
    : { categories: campaign.industries, locations: campaign.locations, resultsLimit: limit };
}

export function apifyCandidate(item: Record<string, unknown>, source: SocialSource): Candidate | null {
  if (item.error || item.private === true || item.isPrivate === true) return null;
  const url = source === 'INSTAGRAM' ? str(item.url) || (str(item.username) ? `https://www.instagram.com/${str(item.username)}/` : '') : str(item.facebookUrl) || str(item.pageUrl);
  const website = socialProfile(url, source);
  const name = str(item.fullName) || str(item.title) || str(item.username);
  if (!website || !name) return null;
  const evidence: Record<string, unknown> = {};
  for (const key of ['id', 'pageId', 'username', 'biography', 'intro', 'info', 'externalUrl', 'website', 'categories', 'businessCategoryName', 'isBusinessAccount', 'followersCount', 'followers', 'address']) {
    const value = item[key];
    if (typeof value === 'string') evidence[key] = str(value);
    else if (typeof value === 'number' || typeof value === 'boolean') evidence[key] = value;
    else if (Array.isArray(value)) evidence[key] = value.filter(v => typeof v === 'string').slice(0, 20).map(str);
  }
  return { name, website, location: str(item.address), industry: str(item.businessCategoryName) || (Array.isArray(item.categories) ? item.categories.map(str).filter(Boolean).join(', ') : ''),
    source: `${source === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} via Apify`, rawSignals: { ...evidence, discoverySource: source, evidenceUrl: website, observedAt: new Date().toISOString() } };
}

async function request(token: string, path: string, body?: unknown): Promise<any> {
  let response: Response;
  try { response = await fetch(`https://api.apify.com/v2/${path}`, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(35_000),
  }); } catch { throw fail('Apify request timed out or could not connect. Saved runs are reused; check Apify Console if a start was interrupted.'); }
  if (!response.ok) throw fail(`Apify request failed (${response.status}). Check the token, actor access and account balance in Apify Console.`);
  return response.json();
}

export async function testApifyCredential(credential: ProviderCredential, organizationId: string) {
  if (credential.organizationId !== organizationId || credential.provider !== 'APIFY') throw fail('Invalid Apify credential.');
  await request(decryptSecret(credential, organizationId), 'users/me');
}

export async function searchApify(campaign: Campaign, source: SocialSource, credential: ProviderCredential, db: Pick<typeof prisma, 'apifyDiscoveryRun'> = prisma) {
  if (credential.organizationId !== campaign.organizationId || credential.provider !== 'APIFY') throw fail('Invalid Apify credential.');
  const token = decryptSecret(credential, campaign.organizationId);
  const input = apifyInput(campaign, source);
  const id = createHash('sha256').update(JSON.stringify([campaign.organizationId, campaign.id, source, input])).digest('hex');
  let saved = await db.apifyDiscoveryRun.findUnique({ where: { id } });
  if (!saved) {
    // Persist the claim BEFORE charging. An ambiguous start is never retried automatically.
    saved = await db.apifyDiscoveryRun.create({ data: { id, campaignId: campaign.id, organizationId: campaign.organizationId, source } });
    const run = (await request(token, `acts/${actors[source]}/runs?timeout=300&maxItems=${Math.min(campaign.targetCount, 250)}&maxTotalChargeUsd=2&restartOnError=false`, input)).data;
    if (!run || typeof run.id !== 'string' || !/^[a-zA-Z0-9]+$/.test(run.id)) throw fail('Apify returned an invalid run. Check Apify Console before starting another campaign.');
    saved = await db.apifyDiscoveryRun.update({ where: { id }, data: { runId: run.id } });
  }
  if (!saved.runId) throw fail('An earlier Apify start could not be confirmed. Check Apify Console before creating another campaign; this search will not charge again automatically.');
  let run;
  for (let attempt = 0; attempt < 20; attempt++) {
    run = (await request(token, `actor-runs/${encodeURIComponent(saved.runId)}?waitForFinish=20`)).data;
    if (['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(run?.status)) break;
  }
  if (run?.status !== 'SUCCEEDED') throw fail(`Apify run ${saved.runId} did not succeed. Check its status in Apify Console; retrying reuses this run.`);
  if (typeof run.defaultDatasetId !== 'string' || !/^[a-zA-Z0-9]+$/.test(run.defaultDatasetId)) throw fail('Apify did not return a valid dataset.');
  const candidates: Candidate[] = [];
  const limit = Math.min(campaign.targetCount, 250);
  for (let offset = 0; offset < limit; offset += 100) {
    const size = Math.min(100, limit - offset);
    const items = await request(token, `datasets/${run.defaultDatasetId}/items?format=json&offset=${offset}&limit=${size}`);
    if (!Array.isArray(items)) throw fail('Apify returned an invalid dataset response.');
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const candidate = apifyCandidate(item, source);
      if (candidate) candidates.push({ ...candidate, rawSignals: { ...candidate.rawSignals, apifyRunId: saved.runId, requestedLocation: campaign.locations.join(', '), requestedIndustry: campaign.industries.join(', ') } });
    }
    if (items.length < size) break;
  }
  return candidates;
}

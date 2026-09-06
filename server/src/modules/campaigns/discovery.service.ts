import type { Campaign, Prisma, ProviderCredential } from '@prisma/client';

import { decryptSecret } from '../../lib/credentials-crypto.js';

import { AppError } from '../../lib/errors.js';

import { prisma } from '../../lib/prisma.js';

import { canonicalBusinessUrl, interleave, webProviders } from './discovery-policy.js';

export type Candidate = {

  name: string;

  website: string;

  location: string;

  industry: string;

  source: string;

  rawSignals: Record<string, unknown>;

};

type GooglePlace = {

  id: string;

  displayName?: { text?: string };

  formattedAddress?: string;

  websiteUri?: string;

  googleMapsUri?: string;

  primaryTypeDisplayName?: { text?: string };

};

async function checkedJson(response: Response, provider: string) {

  if (!response.ok)

    throw new AppError(

      502,

      `${provider} discovery failed (${response.status})`,

      'DISCOVERY_PROVIDER_ERROR',

    );

  return response.json() as Promise<Record<string, unknown>>;

}

export async function searchProvider(

  query: string,

  location: string,

  industry: string,

  credential: ProviderCredential,

  organizationId: string,

): Promise<Candidate[]> {

  const secret = decryptSecret(credential, organizationId);

  if (credential.provider === 'GOOGLE_PLACES') {

    const payload = (await checkedJson(

      await fetch('https://places.googleapis.com/v1/places:searchText', {

        method: 'POST',

        headers: {

          'content-type': 'application/json',

          'x-goog-api-key': secret,

          'x-goog-fieldmask':

            'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName',

        },

        body: JSON.stringify({

          textQuery: query,

          pageSize: 20,

          languageCode: 'en',

        }),

        signal: AbortSignal.timeout(30_000),

      }),

      'Google Places',

    )) as { places?: GooglePlace[] };

    return (payload.places ?? []).flatMap((place) => {

      const name = place.displayName?.text?.trim();

      if (!name) return [];

      return [

        {

          name,

          website:

            place.websiteUri ??

            place.googleMapsUri ??

            `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(place.id)}`,

          location: place.formattedAddress ?? location,

          industry: place.primaryTypeDisplayName?.text ?? industry,

          source: 'Google Places API',

          rawSignals: { googlePlaceId: place.id },

        },

      ];

    });

  }

  if (credential.provider === 'SERPER') {

    const payload = (await checkedJson(

      await fetch('https://google.serper.dev/search', {

        method: 'POST',

        headers: { 'content-type': 'application/json', 'x-api-key': secret },

        body: JSON.stringify({ q: query, num: 20 }),

        signal: AbortSignal.timeout(30_000),

      }),

      'Serper',

    )) as {

      organic?: Array<{ title?: string; link?: string; snippet?: string }>;

    };

    return (payload.organic ?? []).flatMap((item) =>

      item.title && item.link

        ? [

            {

              name: item.title.replace(/\s*[|–-].*$/, '').trim(),

              website: item.link,

              location,

              industry,

              source: 'Google Search via Serper',

              rawSignals: { snippet: item.snippet ?? '' },

            },

          ]

        : [],

    );

  }

  if (credential.provider === 'BRAVE_SEARCH') {

    const url = new URL('https://api.search.brave.com/res/v1/web/search');

    url.searchParams.set('q', query);

    url.searchParams.set('count', '20');

    const payload = (await checkedJson(

      await fetch(url, {

        headers: { accept: 'application/json', 'x-subscription-token': secret },

        signal: AbortSignal.timeout(30_000),

      }),

      'Brave Search',

    )) as {

      web?: {

        results?: Array<{ title?: string; url?: string; description?: string }>;

      };

    };

    return (payload.web?.results ?? []).flatMap((item) =>

      item.title && item.url

        ? [

            {

              name: item.title.replace(/\s*[|–-].*$/, '').trim(),

              website: item.url,

              location,

              industry,

              source: 'Brave Search',

              rawSignals: { snippet: item.description ?? '' },

            },

          ]

        : [],

    );

  }

  if (credential.provider === 'GOOGLE_CUSTOM_SEARCH') {

    const configuration = (credential.configuration ?? {}) as Record<

      string,

      unknown

    >;

    const searchEngineId = String(configuration.searchEngineId ?? '');

    if (!searchEngineId)

      throw new AppError(

        422,

        'Google Custom Search requires a Search Engine ID in Settings',

        'DISCOVERY_PROVIDER_CONFIGURATION',

      );

    const url = new URL('https://customsearch.googleapis.com/customsearch/v1');

    url.searchParams.set('key', secret);

    url.searchParams.set('cx', searchEngineId);

    url.searchParams.set('q', query);

    url.searchParams.set('num', '10');

    const payload = (await checkedJson(

      await fetch(url, { signal: AbortSignal.timeout(30_000) }),

      'Google Custom Search',

    )) as {

      items?: Array<{ title?: string; link?: string; snippet?: string }>;

    };

    return (payload.items ?? []).flatMap((item) =>

      item.title && item.link

        ? [

            {

              name: item.title.replace(/\s*[|–-].*$/, '').trim(),

              website: item.link,

              location,

              industry,

              source: 'Google Custom Search',

              rawSignals: { snippet: item.snippet ?? '' },

            },

          ]

        : [],

    );

  }

  return [];

}

import { searchApify } from './apify-discovery.service.js';

type SourceReport = { source: string; status: string; found: number; message?: string };

export async function discoverCampaignCandidates(campaign: Campaign, db: Pick<typeof prisma, 'providerCredential' | 'lead' | 'campaign' | 'apifyDiscoveryRun'> = prisma) {

  const credentials = await db.providerCredential.findMany({

    where: { organizationId: campaign.organizationId, provider: { in: ['GOOGLE_PLACES', 'GOOGLE_CUSTOM_SEARCH', 'SERPER', 'BRAVE_SEARCH', 'APIFY'] }, isActive: true },

    orderBy: { updatedAt: 'desc' },

  });

  const reports: SourceReport[] = [];

  const groups: Candidate[][] = [];

  for (const source of campaign.discoverySources) {

    if (source === 'INSTAGRAM' || source === 'FACEBOOK') {
      const credential = credentials.find(item => item.provider === 'APIFY');
      if (!credential) { reports.push({ source, status: 'unavailable', found: 0, message: 'Connect Apify in Settings for Instagram and Facebook.' }); continue; }
      try {
        const candidates = await searchApify(campaign, source, credential, db);
        groups.push(candidates);
        reports.push({ source, status: 'complete', found: candidates.length });
      } catch (error) {
        reports.push({ source, status: 'failed', found: 0, message: error instanceof AppError ? error.message : 'Apify discovery failed. Check your connection and run in Apify Console.' });
      }
      continue;
    }
    const eligible = credentials.filter(credential => source === 'GOOGLE_PLACES' ? credential.provider === 'GOOGLE_PLACES' : webProviders.some(provider => provider === credential.provider));
    if (!eligible.length) {

      reports.push({ source, status: 'unavailable', found: 0, message: 'Connect the required search provider in Settings.' });

      continue;

    }

    const candidates: Candidate[] = [];

    let succeeded = 0;

    let failures = 0;
    let failureMessage = ''; 

    for (const industry of campaign.industries) {

      for (const location of campaign.locations) {

        if (candidates.length >= campaign.targetCount) break;

        const baseQuery = `${industry} businesses in ${location}`;

        const query = baseQuery;
        // Newest active key first; alternate keys/providers are bounded fallbacks.

        for (const credential of eligible) {

          try {

              const results = await searchProvider(query, location, industry, credential, campaign.organizationId);
              for (const candidate of results) {
                const normalized = canonicalBusinessUrl(candidate.website);
                if (!normalized) continue;
                if (source === 'WEB' && /(^|\.)(instagram|facebook)\.com$/i.test(new URL(normalized).hostname)) continue;
                candidates.push({ ...candidate, ...(source === 'WEB' ? { location: '', industry: '' } : {}),
                  rawSignals: { ...candidate.rawSignals, discoverySource: source, evidenceUrl: candidate.website,
                    requestedLocation: location, requestedIndustry: industry, observedAt: new Date().toISOString() } });
              }
              succeeded++;
            break;

          } catch (error) {

            failures++;
            failureMessage = error instanceof AppError ? error.message : 'A provider request failed. Check the connection in Settings.';

          }

        }

      }

    }

    groups.push(candidates);

    reports.push({ source, status: succeeded ? (failures ? 'partial' : 'complete') : 'failed', found: candidates.length,

      ...(failures ? { message: failureMessage } : {}) });

  }

  let discovered = 0;

  const seen = new Set<string>();

  // Interleave sources before applying the total cap; keep identities separate

  // unless their canonical URLs agree. A shared name is not proof of identity.

  for (const candidate of interleave(groups)) {

    if (discovered >= campaign.targetCount) break;

    const website = canonicalBusinessUrl(candidate.website);

    if (!website || seen.has(website)) continue;

    seen.add(website);

    const lead = await db.lead.upsert({

      where: { organizationId_website: { organizationId: campaign.organizationId, website } },

      update: {}, // Preserve existing CRM ownership, suppression, status and evidence.

      create: { organizationId: campaign.organizationId, campaignId: campaign.id, name: candidate.name,

        website, location: candidate.location || null, industry: candidate.industry || null,

        source: candidate.source, rawSignals: candidate.rawSignals as Prisma.InputJsonValue },

    });

    if (lead.campaignId === campaign.id) discovered++;

  }

  await db.campaign.update({ where: { id: campaign.id }, data: {

    discoveryReport: { sources: reports, discovered, completedAt: new Date().toISOString(),

      coverage: 'Bounded results: Apify searches public Instagram profiles and Facebook pages by campaign keywords (up to 250 results per platform, $2 run cap each). Location and business fit require evidence; discovery does not establish buying intent.' } as Prisma.InputJsonValue,

  } });

  if (!reports.some((report) => ['complete', 'partial'].includes(report.status))) {

    throw new AppError(502, 'No selected discovery source succeeded. Check source status and credentials in Settings.', 'DISCOVERY_PROVIDER_ERROR');

  }

  return discovered;

}


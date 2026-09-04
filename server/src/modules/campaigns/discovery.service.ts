import type { Campaign, Prisma, ProviderCredential } from '@prisma/client';

import { decryptSecret } from '../../lib/credentials-crypto.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

type Candidate = {
  name: string;
  website: string;
  location: string;
  industry: string;
  source: string;
  kind: 'PLACE' | 'WEB';
  quality: number;
  rawSignals: Record<string, unknown>;
};
type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
};

const providerPriority: Record<string, number> = {
  GOOGLE_PLACES: 0,
  GOOGLE_CUSTOM_SEARCH: 1,
  SERPER: 2,
  BRAVE_SEARCH: 3,
};

const blockedWebHosts = [
  'google.com', 'youtube.com', 'wikipedia.org', 'linkedin.com',
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com',
  'pinterest.com', 'researchgate.net', 'academia.edu',
];
const nonBusinessTitle = /\b(article|blog|case study|directory|guide|how to|list of|news|pdf|report|research|study|top \d+|best \d+|behind|a look at|wikipedia)\b/i;
const nonBusinessPath = /\/(blog|blogs|news|article|articles|insights|resources|publications|research|reports?|search|category|tag)\b/i;
const documentPath = /\.(?:pdf|docx?|xlsx?|pptx?)(?:$|[?#])/i;

function hostnameMatches(hostname: string, blocked: string) {
  return hostname === blocked || hostname.endsWith(`.${blocked}`);
}

function cleanResultName(title: string) {
  return title.replace(/\s+[|–—]\s+.*$/, '').replace(/\s+-\s+[^-]+$/, '').trim();
}

function webCandidate(input: {
  title?: string; link?: string; snippet?: string; location: string;
  industry: string; source: string;
}): Candidate | null {
  if (!input.title || !input.link) return null;
  let url: URL;
  try { url = new URL(input.link); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (blockedWebHosts.some((blocked) => hostnameMatches(hostname, blocked)) ||
      documentPath.test(url.pathname) || nonBusinessPath.test(url.pathname) ||
      nonBusinessTitle.test(input.title)) return null;
  const name = cleanResultName(input.title);
  if (name.length < 3 || name.length > 100 || nonBusinessTitle.test(name)) return null;
  return {
    name,
    website: url.origin,
    location: input.location,
    industry: input.industry,
    source: input.source,
    kind: 'WEB',
    quality: url.pathname === '/' ? 45 : 35,
    rawSignals: {
      snippet: input.snippet ?? '',
      discoveryResultUrl: url.toString(),
      discoveryHost: hostname,
    },
  };
}

async function checkedJson(response: Response, provider: string) {
  if (!response.ok)
    throw new AppError(
      502,
      `${provider} discovery failed (${response.status})`,
      'DISCOVERY_PROVIDER_ERROR',
    );
  return response.json() as Promise<Record<string, unknown>>;
}

async function searchProvider(
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
            'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName,places.businessStatus,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.types',
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
      if (!name || place.businessStatus === 'CLOSED_PERMANENTLY') return [];
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
          kind: 'PLACE',
          quality: 100 + (place.websiteUri ? 15 : 0) +
            (place.nationalPhoneNumber ? 10 : 0) +
            (place.userRatingCount ? Math.min(10, Math.log10(place.userRatingCount + 1) * 3) : 0),
          rawSignals: {
            googlePlaceId: place.id,
            address: place.formattedAddress ?? location,
            businessStatus: place.businessStatus ?? 'OPERATIONAL',
            phone: place.nationalPhoneNumber ?? null,
            rating: place.rating ?? null,
            userRatingCount: place.userRatingCount ?? 0,
            placeTypes: place.types ?? [],
            mapsUrl: place.googleMapsUri ?? null,
          },
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
    return (payload.organic ?? []).flatMap((item) => {
      const candidate = webCandidate({ title: item.title, link: item.link,
        snippet: item.snippet, location, industry, source: 'Google Search via Serper' });
      return candidate ? [candidate] : [];
    });
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
    return (payload.web?.results ?? []).flatMap((item) => {
      const candidate = webCandidate({ title: item.title, link: item.url,
        snippet: item.description, location, industry, source: 'Brave Search' });
      return candidate ? [candidate] : [];
    });
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
    return (payload.items ?? []).flatMap((item) => {
      const candidate = webCandidate({ title: item.title, link: item.link,
        snippet: item.snippet, location, industry, source: 'Google Custom Search' });
      return candidate ? [candidate] : [];
    });
  }
  return [];
}

export async function discoverCampaignCandidates(campaign: Campaign) {
  const credentials = await prisma.providerCredential.findMany({
    where: {
      organizationId: campaign.organizationId,
      provider: {
        in: ['GOOGLE_PLACES', 'GOOGLE_CUSTOM_SEARCH', 'SERPER', 'BRAVE_SEARCH'],
      },
      isActive: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!credentials.length)
    throw new AppError(
      409,
      'Connect a search source in Settings before running a campaign',
      'DISCOVERY_PROVIDER_REQUIRED',
    );
  credentials.sort(
    (left, right) =>
      (providerPriority[left.provider] ?? 99) -
      (providerPriority[right.provider] ?? 99),
  );

  const candidates: Candidate[] = [];
  const providerErrors: Error[] = [];
  let successfulProviderCalls = 0;
  for (const industry of campaign.industries) {
    for (const location of campaign.locations) {
      for (const credential of credentials) {
        try {
          candidates.push(...await searchProvider(
            `${industry} in ${location}`,
            location,
            industry,
            credential,
            campaign.organizationId,
          ));
          successfulProviderCalls += 1;
        } catch (error) {
          providerErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }
  if (!successfulProviderCalls && providerErrors.length) throw providerErrors[0];

  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    let normalized: string;
    let key: string;
    try {
      const url = new URL(candidate.website);
      url.hash = '';
      if (candidate.kind === 'WEB') {
        url.pathname = '/';
        url.search = '';
      }
      normalized = url.toString();
      const placeId = candidate.rawSignals.googlePlaceId;
      const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      key = typeof placeId === 'string' && placeId
        ? `place:${placeId}`
        : hostnameMatches(hostname, 'google.com')
          ? `name:${candidate.name.toLowerCase()}:${candidate.location.toLowerCase()}`
          : `host:${hostname}`;
    } catch {
      continue;
    }
    candidate.website = normalized;
    const existing = unique.get(key);
    if (!existing || candidate.quality > existing.quality) unique.set(key, candidate);
  }

  const ordered = [...unique.values()].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'PLACE' ? -1 : 1;
    return right.quality - left.quality;
  });

  let discovered = 0;
  for (const candidate of ordered.slice(0, campaign.targetCount)) {
    await prisma.lead.upsert({
      where: {
        organizationId_website: {
          organizationId: campaign.organizationId,
          website: candidate.website,
        },
      },
      update: {
        campaignId: campaign.id,
        name: candidate.name,
        industry: candidate.industry,
        location: candidate.location,
        source: candidate.source,
        rawSignals: candidate.rawSignals as Prisma.InputJsonValue,
      },
      create: {
        organizationId: campaign.organizationId,
        campaignId: campaign.id,
        name: candidate.name,
        website: candidate.website,
        industry: candidate.industry,
        location: candidate.location,
        source: candidate.source,
        rawSignals: candidate.rawSignals as Prisma.InputJsonValue,
      },
    });
    discovered += 1;
  }
  return discovered;
}

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Lead } from '@prisma/client';

import { prisma } from '../../lib/prisma.js';

const MAX_BYTES = 512_000;

function privateAddress(address: string) {
  if (isIP(address) === 4) {
    const [n1 = 0, n2 = 0] = address.split('.').map(Number);
    return (
      n1 === 10 ||
      n1 === 127 ||
      n1 === 0 ||
      (n1 === 169 && n2 === 254) ||
      (n1 === 172 && n2 >= 16 && n2 <= 31) ||
      (n1 === 192 && n2 === 168)
    );
  }
  const value = address.toLowerCase();
  return (
    value === '::1' ||
    value === '::' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80:') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.')
  );
}

async function safeUrl(input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Unsupported protocol');
  if (url.username || url.password)
    throw new Error('Credentials in URL are forbidden');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some((item) => privateAddress(item.address))
  )
    throw new Error('Private network target blocked');
  return url;
}

async function fetchPage(input: string) {
  let url = await safeUrl(input);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': 'AkilimaticResearchBot/1.0 (+public-business-research)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Invalid redirect');
      url = await safeUrl(new URL(location, url).toString());
      continue;
    }
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('text/html')
    )
      throw new Error(`Page unavailable (${response.status})`);
    const reader = response.body?.getReader();
    if (!reader) return { url: url.toString(), html: '' };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(
      chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { url: url.toString(), html: new TextDecoder().decode(merged) };
  }
  throw new Error('Too many redirects');
}

function readableText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6_000);
}

export async function enrichLeadFromPublicWebsite(
  lead: Pick<Lead, 'id' | 'website' | 'organizationId'>,
) {
  if (!lead.website) return { enriched: false };
  const hostname = new URL(lead.website).hostname.toLowerCase();
  if (
    hostname.endsWith('google.com') ||
    hostname.endsWith('googleusercontent.com')
  )
    return { enriched: false };
  try {
    const page = await fetchPage(lead.website);
    const text = readableText(page.html);
    const links = [...page.html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((match) => match[1])
      .filter(
        (link): link is string =>
          typeof link === 'string' &&
          /facebook\.com|instagram\.com|linkedin\.com|wa\.me|whatsapp\.com/i.test(
            link,
          ),
      )
      .slice(0, 8);
    const hrefs = [...page.html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((match) => match[1] ?? '');
    const email = hrefs
      .map((href) => href.match(/^mailto:([^?]+)/i)?.[1])
      .find((value): value is string => Boolean(value)) ??
      text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
    const telHref = hrefs
      .map((href) => href.match(/^tel:([^?]+)/i)?.[1])
      .find((value): value is string => Boolean(value));
    const whatsappHref = hrefs.find((href) => /(?:wa\.me|api\.whatsapp\.com)/i.test(href));
    const normalizePhone = (value?: string) => value?.replace(/[^\d+]/g, '').slice(0, 20) || undefined;
    const phone = normalizePhone(telHref);
    const whatsapp = normalizePhone(whatsappHref?.match(/(?:wa\.me\/|phone=)(\+?\d+)/i)?.[1]);
    const signals = [
      ...(text
        ? [
            {
              leadId: lead.id,
              source: 'PUBLIC_WEB_CRAWLER',
              type: 'WEBSITE_CONTENT',
              value: text.slice(0, 1_500),
              confidence: 0.75,
              evidenceUrl: page.url,
            },
          ]
        : []),
      ...links.map((link) => ({
        leadId: lead.id,
        source: 'PUBLIC_WEB_CRAWLER',
        type: 'SOCIAL_PROFILE',
        value: `Public profile found: ${link}`,
        confidence: 0.7,
        evidenceUrl: new URL(link, page.url).toString(),
      })),
    ];
    await prisma.$transaction([
      prisma.leadSignal.deleteMany({
        where: { leadId: lead.id, source: 'PUBLIC_WEB_CRAWLER' },
      }),
      prisma.contact.deleteMany({
        where: { leadId: lead.id, source: 'PUBLIC_WEB_CRAWLER' },
      }),
      ...(signals.length
        ? [prisma.leadSignal.createMany({ data: signals })]
        : []),
      ...(email || phone || whatsapp
        ? [prisma.contact.create({
            data: {
              organizationId: lead.organizationId,
              leadId: lead.id,
              name: 'Public business contact',
              email: email?.toLowerCase(),
              phone,
              whatsapp,
              source: 'PUBLIC_WEB_CRAWLER',
            },
          })]
        : []),
    ]);
    return { enriched: Boolean(signals.length) };
  } catch {
    return { enriched: false };
  }
}

export const discoverySources = ['GOOGLE_PLACES', 'WEB', 'INSTAGRAM', 'FACEBOOK'] as const;
export type DiscoverySource = (typeof discoverySources)[number];
export const webProviders = ['SERPER', 'BRAVE_SEARCH', 'GOOGLE_CUSTOM_SEARCH'] as const;

export function sourceReady(source: string, providers: string[]) {
  if (source === 'INSTAGRAM' || source === 'FACEBOOK') return providers.includes('APIFY');
  return source === 'GOOGLE_PLACES'
    ? providers.includes('GOOGLE_PLACES')
    : webProviders.some((provider) => providers.includes(provider));
}

// Only profile URLs are candidates. Posts, groups, login pages and platform roots
// must never become businesses or collapse into one lead per social network.
export function socialProfile(input: string, source: 'INSTAGRAM' | 'FACEBOOK') {
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^(www|m|web)\./, '');
    if (host !== (source === 'INSTAGRAM' ? 'instagram.com' : 'facebook.com')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const first = parts[0]?.toLowerCase();
    if (!first) return null;
    if (source === 'INSTAGRAM') {
      if (parts.length !== 1 || !/^[a-z0-9._]{1,30}$/.test(first) || ['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'about', 'direct'].includes(first)) return null;
      return `https://www.instagram.com/${first}/`;
    }
    if (first === 'profile.php') {
      const id = url.searchParams.get('id');
      return /^\d+$/.test(id ?? '') ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    if (['groups', 'events', 'watch', 'reel', 'reels', 'photo', 'photos', 'posts', 'login', 'login.php', 'share', 'sharer', 'sharer.php', 'marketplace', 'gaming', 'help', 'search', 'ads', 'business', 'dialog', 'story.php', 'permalink.php'].includes(first)) return null;
    if ((first === 'pages' || first === 'people') && parts.length === 3 && /^\d+$/.test(parts[2] ?? '')) {
      return `https://www.facebook.com/${first}/${parts[1]}/${parts[2]}/`;
    }
    if (parts.length !== 1 || !/^[a-z0-9.]+$/.test(first)) return null;
    return `https://www.facebook.com/${first}/`;
  } catch { return null; }
}

export function canonicalBusinessUrl(input: string) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    for (const source of ['INSTAGRAM', 'FACEBOOK'] as const) {
      const profile = socialProfile(input, source);
      if (profile) return profile;
    }
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch { return null; }
}

export function interleave<T>(groups: T[][]): T[] {
  const output: T[] = [];
  for (let row = 0; row < Math.max(0, ...groups.map((group) => group.length)); row++) {
    for (const group of groups) if (group[row] !== undefined) output.push(group[row]!);
  }
  return output;
}

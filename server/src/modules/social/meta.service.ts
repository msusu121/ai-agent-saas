import { AppError } from '../../lib/errors.js';

const version = process.env.META_GRAPH_VERSION ?? 'v23.0';
export class PublishUncertain extends Error {}
export async function meta(path: string, token: string, body?: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
      method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
  } catch { if (body) throw new PublishUncertain('Meta response was not received. Check the account before retrying to avoid a duplicate.'); throw new AppError(502, 'Meta connection timed out', 'META_TIMEOUT'); }
  const data = await response.json().catch(() => null) as any;
  if (!response.ok || data?.error) {
    if (body && response.status >= 500) throw new PublishUncertain('Meta returned a server error. Check the account before retrying.');
    throw new AppError(502, `Meta: ${String(data?.error?.message ?? `HTTP ${response.status}`).slice(0, 400)}`, 'META_ERROR');
  }
  if (!data) throw new PublishUncertain('Meta returned an unreadable response. Check the account before retrying.');
  return data;
}

export async function publishMeta(post: { caption: string; imageUrl: string | null; containerId: string | null }, account: { platform: string; externalId: string }, token: string, saveContainer: (id: string) => Promise<void>) {
  if (account.platform === 'FACEBOOK') {
    const result = await meta(`${account.externalId}/${post.imageUrl ? 'photos' : 'feed'}`, token, post.imageUrl ? { url: post.imageUrl, caption: post.caption, published: 'true' } : { message: post.caption });
    const id = result.post_id ?? result.id;
    if (typeof id !== 'string') throw new PublishUncertain('Meta did not return a post ID. Check the Page before retrying.');
    return { providerId: id, permalink: `https://www.facebook.com/${id}` };
  }
  let containerId = post.containerId;
  if (!containerId) {
    const container = await meta(`${account.externalId}/media`, token, { image_url: post.imageUrl!, caption: post.caption });
    if (typeof container.id !== 'string') throw new Error('Meta did not create an Instagram media container');
    containerId = container.id;
    await saveContainer(containerId!);
  }
  let state = await meta(`${containerId}?fields=status_code`, token);
  for (let attempt = 0; state.status_code === 'IN_PROGRESS' && attempt < 5; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    state = await meta(`${containerId}?fields=status_code`, token);
  }
  if (state.status_code !== 'FINISHED') throw new Error(`Instagram image is ${state.status_code ?? 'processing'}. Wait and retry after checking the account.`);
  const published = await meta(`${account.externalId}/media_publish`, token, { creation_id: containerId! });
  if (typeof published.id !== 'string') throw new PublishUncertain('Meta did not return an Instagram post ID. Check the account before retrying.');
  let permalink: string | null = null;
  try { permalink = (await meta(`${published.id}?fields=permalink`, token)).permalink ?? null; } catch { /* Published ID is authoritative; link can be refreshed later. */ }
  return { providerId: published.id as string, permalink };
}

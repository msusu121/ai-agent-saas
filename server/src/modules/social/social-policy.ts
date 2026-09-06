import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().trim().min(20).max(4000),
  audience: z.string().trim().min(5).max(2000), claims: z.string().trim().min(5).max(4000),
  voice: z.string().trim().min(3).max(500), website: z.url().refine(v => new URL(v).protocol === 'https:', 'Use an HTTPS website'),
  callToAction: z.string().trim().min(5).max(500),
});
export const draftSchema = z.object({ caption: z.string().trim().min(10).max(2000), creativeBrief: z.string().min(10).max(2000), rationale: z.string().min(10).max(2000) });
export function parseSocialDraft(text: string) {
  return draftSchema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')));
}
export function trackedLink(website: string, platform: string, productId: string) {
  const url = new URL(website);
  url.searchParams.set('utm_source', platform.toLowerCase());
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', productId);
  return url.toString();
}
export function validatePost(platform: string, caption: string, imageUrl: string | null) {
  if (!caption.trim() || caption.length > (platform === 'INSTAGRAM' ? 2200 : 60000)) throw new Error('Caption is empty or too long for this platform');
  if (platform === 'INSTAGRAM' && !imageUrl) throw new Error('Instagram requires a public JPEG image URL');
  if (imageUrl && new URL(imageUrl).protocol !== 'https:') throw new Error('Image URL must use HTTPS');
}

import { z } from 'zod';
import { AppError } from '../../lib/errors.js';

export const draftSchema = z.object({ subject: z.string().max(180).nullable().default(null), body: z.string().trim().min(40).max(6000) });

export function parseDraftResponse(text: string) {
  // Some models wrap otherwise valid JSON in a Markdown code fence.
  const content = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
  let value: unknown;
  try { value = JSON.parse(content); }
  catch { throw new AppError(502, 'AI returned an unreadable message draft. Please generate again or choose another model.', 'AI_DRAFT_FORMAT'); }
  const result = draftSchema.safeParse(value);
  if (!result.success) throw new AppError(502, 'AI returned an incomplete message draft. Please generate again or choose another model.', 'AI_DRAFT_FORMAT');
  return result.data;
}

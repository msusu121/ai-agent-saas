import type { CredentialProvider } from '@prisma/client';
import { z } from 'zod';

import { decryptSecret } from '../../lib/credentials-crypto.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

type CompletionInput = {
  organizationId: string;
  system: string;
  prompt: string;
  responseSchema?: z.ZodType;
};

type ProviderConfiguration = {
  endpoint: string;
  model: string;
  format: 'openai' | 'anthropic' | 'google';
};

const providers: Partial<Record<CredentialProvider, ProviderConfiguration>> = {
  OPENAI: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-5-mini',
    format: 'openai',
  },
  OPENROUTER: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openrouter/free',
    format: 'openai',
  },
  GROQ: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    format: 'openai',
  },
  ANTHROPIC: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
    format: 'anthropic',
  },
  GOOGLE: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash',
    format: 'google',
  },
};

export async function completeWithOrganizationModel(
  input: CompletionInput,
): Promise<unknown> {
  const credential = await prisma.providerCredential.findFirst({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      provider: { in: ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'OPENROUTER', 'GROQ'] },
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!credential)
    throw new AppError(
      409,
      'Connect an AI provider in organization settings first',
      'AI_PROVIDER_REQUIRED',
    );

  const config = providers[credential.provider];
  if (!config)
    throw new AppError(
      422,
      'This AI provider is not supported for reasoning yet',
      'UNSUPPORTED_PROVIDER',
    );
  const storedConfiguration = (credential.configuration ?? {}) as Record<
    string,
    unknown
  >;
  const configuredModel =
    typeof storedConfiguration.model === 'string'
      ? storedConfiguration.model.trim()
      : '';
  const model = configuredModel || config.model;
  const apiKey = decryptSecret(credential, input.organizationId);

  const endpoint =
    config.format === 'google'
      ? `${config.endpoint}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
      : config.endpoint;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers:
      config.format === 'anthropic'
        ? {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          }
        : config.format === 'google'
          ? { 'content-type': 'application/json' }
          : {
              'content-type': 'application/json',
              authorization: `Bearer ${apiKey}`,
            },
    body: JSON.stringify(
      config.format === 'anthropic'
        ? {
            model,
            max_tokens: 2_000,
            system: input.system,
            messages: [{ role: 'user', content: input.prompt }],
          }
        : config.format === 'google'
          ? {
              systemInstruction: { parts: [{ text: input.system }] },
              contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
              },
            }
          : {
              model,
              temperature: 0.2,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: input.system },
                { role: 'user', content: input.prompt },
              ],
            },
    ),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok)
    throw new AppError(
      502,
      `${credential.provider} model ${model}: ${response.status === 429 ? 'rate limit reached; retry after the provider limit resets' : response.status === 402 ? 'credits exhausted or payment required' : response.status === 401 || response.status === 403 ? 'credential rejected or model access denied' : response.status === 404 ? 'model or endpoint not found' : 'provider request failed'} (${response.status})`,
      'AI_PROVIDER_ERROR',
    );
  const payload = (await response.json()) as Record<string, unknown>;
  const text =
    config.format === 'anthropic'
      ? (payload.content as Array<{ text?: string }> | undefined)?.[0]?.text
      : config.format === 'google'
        ? (
            payload.candidates as
              | Array<{ content?: { parts?: Array<{ text?: string }> } }>
              | undefined
          )?.[0]?.content?.parts?.[0]?.text
        : (
            payload.choices as
              | Array<{ message?: { content?: string } }>
              | undefined
          )?.[0]?.message?.content;
  if (!text)
    throw new AppError(
      502,
      'AI provider returned no content',
      'AI_PROVIDER_ERROR',
    );

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError(
      502,
      'AI provider returned invalid structured data',
      'AI_PROVIDER_ERROR',
    );
  }
  return input.responseSchema ? input.responseSchema.parse(parsed) : parsed;
}

import type { OutreachMessage } from '@prisma/client';
import { z } from 'zod';

import { decryptSecret } from '../../lib/credentials-crypto.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const emailConfiguration = z.object({
  fromEmail: z.string().email(),
  fromName: z.string().min(1).max(100).default('Sales Agent'),
});

const whatsappConfiguration = z.object({
  businessAccountId: z.string().min(3),
  phoneNumberId: z.string().min(3),
  apiVersion: z.string().regex(/^v\d+\.\d+$/).default('v21.0'),
  accessToken: z.string().min(10),
  templateName: z.string().min(1).max(50).default("sales_agent_outreach"),
  templateLanguage: z.string().default('en'),
});

async function checkedJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof body.message === 'string' ? body.message : `provider returned ${response.status}`;
    throw new AppError(502, `Channel delivery failed: ${detail}`, 'CHANNEL_PROVIDER_ERROR');
  }
  return body;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function emailHtml(message: OutreachMessage, fromName: string) {
  const paragraphs = message.body.split(/\n{2,}/).map((paragraph) =>
    `<p style="margin:0 0 16px;line-height:1.65;color:#29263a">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`,
  ).join('');
  return `<!doctype html><html><body style="margin:0;background:#f7f6fb;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f6fb;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e8e5f0;border-radius:18px"><tr><td style="padding:30px"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6d28d9;margin-bottom:20px">${escapeHtml(fromName)}</div>${paragraphs}<div style="height:4px;width:44px;border-radius:999px;background:#6d28d9;margin-top:24px"></div></td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(message: OutreachMessage): Promise<string> {
  const credential = await prisma.providerCredential.findFirst({
    where: { organizationId: message.organizationId, isActive: true, provider: { in: ['RESEND', 'SENDGRID'] } },
    orderBy: { updatedAt: 'desc' },
  });
  if (!credential) throw new AppError(409, 'Connect Resend or SendGrid before sending email', 'EMAIL_PROVIDER_REQUIRED');
  const config = emailConfiguration.parse(credential.configuration);
  const apiKey = decryptSecret(credential, message.organizationId);
  const html = emailHtml(message, config.fromName);

  if (credential.provider === 'RESEND') {
    const payload = await checkedJson(await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': message.id },
      body: JSON.stringify({ from: `${config.fromName} <${config.fromEmail}>`, to: [message.recipient], subject: message.subject ?? 'A quick introduction', text: message.body, html }),
      signal: AbortSignal.timeout(30_000),
    }));
    return String(payload.id ?? message.id);
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.recipient }], custom_args: { outreach_id: message.id } }],
      from: { email: config.fromEmail, name: config.fromName },
      subject: message.subject ?? 'A quick introduction',
      content: [{ type: 'text/plain', value: message.body }, { type: 'text/html', value: html }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new AppError(502, `SendGrid delivery failed (${response.status})`, 'CHANNEL_PROVIDER_ERROR');
  return response.headers.get('x-message-id') ?? message.id;
}

function splitBodyForTemplate(body: string, maxParams: number = 3): string[] {
  const placeholderRegex = /\{param(\d+)\}/gi;
  const placeholders = body.match(placeholderRegex);

  if (placeholders && placeholders.length <= maxParams) {
    const parts: string[] = [];
    let lastIndex = 0;
    let match;
    const regex = new RegExp(placeholderRegex.source, placeholderRegex.flags);

    while ((match = regex.exec(body)) !== null) {
      const parameter = match[1];
      if (!parameter) continue;
      const index = parseInt(parameter, 10) - 1;
      const beforeText = body.slice(lastIndex, match.index).trim();
      if (parts.length <= index) {
        parts.length = index + 1;
      }
      parts[index] = beforeText || `Part ${index + 1}`;
      lastIndex = regex.lastIndex;
    }
    const afterLast = body.slice(lastIndex).trim();
    if (afterLast) parts.push(afterLast);
    while (parts.length < maxParams) {
      parts.push(`Part ${parts.length + 1}`);
    }
    return parts.slice(0, maxParams);
  }

  const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  const chunkSize = Math.max(1, Math.ceil(sentences.length / maxParams));
  for (let i = 0; i < maxParams && i * chunkSize < sentences.length; i++) {
    chunks.push(sentences.slice(i * chunkSize, (i + 1) * chunkSize).join(' ').trim());
  }
  while (chunks.length < maxParams) chunks.push(`Part ${chunks.length + 1}`);
  return chunks.slice(0, maxParams);
}

async function sendWhatsApp(message: OutreachMessage & { lead?: { name: string; industry: string | null; estimatedValue: number | null; recommendedOffer: string | null } | null }): Promise<string> {
  const credential = await prisma.providerCredential.findFirst({
    where: { organizationId: message.organizationId, isActive: true, provider: 'WHATSAPP' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!credential) throw new AppError(409, 'Connect WhatsApp Business before sending', 'WHATSAPP_PROVIDER_REQUIRED');
  const config = whatsappConfiguration.parse(credential.configuration);
  const accessToken = decryptSecret(credential, message.organizationId);

  const templateName = config.templateName;
  const language = config.templateLanguage;
  const phoneNumberId = config.phoneNumberId;
  const businessAccountId = config.businessAccountId;
  const apiVersion = config.apiVersion;

  const lead = message.lead ?? null;

  let templateParams: string[];
  if (lead) {
    const name = lead.name ?? 'there';
    const industry = lead.industry ?? 'your business';
    const offer = lead.recommendedOffer ?? 'our solution';
    templateParams = [name, industry, offer];
  } else {
    templateParams = splitBodyForTemplate(message.body, 3);
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: message.recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: 'body',
          parameters: templateParams.map((text) => ({ text })),
        },
      ],
    },
  };

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'idempotency-key': message.id,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorBody = await checkedJson(response);
    const providerError = errorBody.error;
    const errorCode = providerError && typeof providerError === 'object' && 'code' in providerError
      ? (providerError.code as number | undefined) : undefined;
    const errorType = providerError && typeof providerError === 'object' && 'error_user_msg' in providerError
      ? (providerError.error_user_msg as string | undefined) : undefined;

    if (errorCode === 341 || errorType?.includes('MESSAGE_TEMPLATE')) {
      throw new AppError(
        409,
        `WhatsApp template "${templateName}" not approved or not synced. Create, submit, and sync the template in Meta Business Console before sending.`,
        'WHATSAPP_TEMPLATE_NOT_APPROVED',
      );
    }

    throw new AppError(502, `WhatsApp delivery failed: ${JSON.stringify(errorBody)}`, 'CHANNEL_PROVIDER_ERROR');
  }

  const result = await checkedJson(response);
  const messages = (result as Record<string, unknown>).messages as Array<{ id: string }> | undefined;
  return messages?.[0]?.id ?? message.id;
}

export async function deliverOutreach(message: OutreachMessage & { lead?: { name: string; industry: string | null; estimatedValue: number | null; recommendedOffer: string | null } | null }): Promise<string> {
  return message.channel === 'EMAIL' ? sendEmail(message) : sendWhatsApp(message);
}

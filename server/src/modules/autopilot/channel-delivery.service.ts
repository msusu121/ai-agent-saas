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

async function sendWhatsApp(message: OutreachMessage): Promise<string> {
  const credential = await prisma.providerCredential.findFirst({
    where: { organizationId: message.organizationId, isActive: true, provider: 'WHATSAPP' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!credential) throw new AppError(409, 'Connect WhatsApp Business before sending', 'WHATSAPP_PROVIDER_REQUIRED');
  whatsappConfiguration.parse(credential.configuration);
  throw new AppError(
    409,
    'Cold WhatsApp outreach requires a Meta-approved message template. Create, submit, and sync an approved template before sending.',
    'WHATSAPP_TEMPLATE_REQUIRED',
  );
}

export async function deliverOutreach(message: OutreachMessage): Promise<string> {
  return message.channel === 'EMAIL' ? sendEmail(message) : sendWhatsApp(message);
}

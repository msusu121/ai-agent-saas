type Channel = 'EMAIL' | 'WHATSAPP';
export type DeliveryAttempt = { channel: Channel; recipient: string; id?: string; queued?: boolean };
export function deliveryTargets(contacts: { email: string | null; whatsapp: string | null }[]): DeliveryAttempt[] {
  const email = contacts.find(contact => contact.email?.trim())?.email?.trim();
  const whatsapp = contacts.find(contact => contact.whatsapp?.trim())?.whatsapp?.trim();
  return [...(email ? [{ channel: 'EMAIL' as const, recipient: email }] : []), ...(whatsapp ? [{ channel: 'WHATSAPP' as const, recipient: whatsapp }] : [])];
}

// Keep successful channel submissions when another channel fails, so retry does not resend them.
export async function submitDeliveries(attempts: DeliveryAttempt[], create: (attempt: DeliveryAttempt) => Promise<string>, approve: (id: string) => Promise<unknown>) {
  const errors: string[] = [];
  for (const attempt of attempts) {
    if (attempt.queued) continue;
    try {
      attempt.id ??= await create(attempt);
      await approve(attempt.id);
      attempt.queued = true;
    } catch (error) { errors.push(`${attempt.channel}: ${error instanceof Error ? error.message : 'Unable to queue delivery'}`); }
  }
  return errors;
}

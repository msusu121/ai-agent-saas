import {
  AuditAction,
  CampaignStatus,
  LeadStatus,
  MembershipRole,
  OutreachChannel,
  OutreachStatus,
  PrismaClient,
} from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const demoLeads = [
  ['ABC Academy', 'abc-academy.demo', 'Private School', 'Nyali, Mombasa', 92, LeadStatus.QUALIFIED, 420000, 'No parent portal detected', 'Digitize attendance and parent notifications'],
  ['Little Angels Academy', 'little-angels.demo', 'Private School', 'Bamburi, Mombasa', 88, LeadStatus.CONTACTED, 350000, 'WhatsApp-first parent communication', 'Automate parent updates through one school platform'],
  ['Ocean Paradise Resort', 'ocean-paradise.demo', 'Hospitality', 'Diani, Kwale', 85, LeadStatus.REPLIED, 680000, 'Growing direct-booking enquiries', 'AI guest enquiry and booking workflow'],
  ['Coast Medical Centre', 'coast-medical.demo', 'Healthcare', 'Nyali, Mombasa', 82, LeadStatus.MEETING, 540000, 'Manual appointment reminders', 'Automated patient scheduling and reminders'],
  ['Bright Future School', 'bright-future.demo', 'Private School', 'Kisauni, Mombasa', 76, LeadStatus.DISCOVERED, 290000, 'Manual admission workflow', 'Digital admissions and fee follow-up'],
  ['Tamu Bites Catering', 'tamu-bites.demo', 'Food & Catering', 'Mombasa CBD', 74, LeadStatus.QUALIFIED, 240000, 'High social engagement but no lead capture', 'WhatsApp sales automation and CRM'],
  ['Bahari Logistics', 'bahari-logistics.demo', 'Logistics', 'Changamwe, Mombasa', 71, LeadStatus.CONTACTED, 760000, 'Quote requests handled across inboxes', 'Centralize quotes and shipment updates'],
  ['Mwangaza Hardware', 'mwangaza-hardware.demo', 'Retail', 'Likoni, Mombasa', 68, LeadStatus.DISCOVERED, 180000, 'No online catalogue detected', 'Launch a searchable ordering catalogue'],
  ['Jirani Properties', 'jirani-properties.demo', 'Real Estate', 'Kilifi Town', 65, LeadStatus.PROPOSAL, 610000, 'Listings updated manually on social channels', 'Automate listing distribution and buyer qualification'],
  ['Pendo Sacco', 'pendo-sacco.demo', 'Financial Services', 'Mtwapa, Kilifi', 61, LeadStatus.SUPPRESSED, 890000, 'Member enquiries rely on branch visits', 'Secure member self-service portal'],
] as const;

async function main() {
  await prisma.organization.deleteMany({
    where: { slug: { in: ['akilimatic-demo', 'coastline-demo'] } },
  });

  const passwordHash = await argon2.hash('DemoPass!2026', { type: argon2.argon2id });
  const owner = await prisma.user.upsert({
    where: { email: 'hasan@akilimatic.demo' },
    update: { name: 'Hasan M.', passwordHash, isActive: true },
    create: { email: 'hasan@akilimatic.demo', name: 'Hasan M.', passwordHash },
  });
  const teammate = await prisma.user.upsert({
    where: { email: 'amani@akilimatic.demo' },
    update: { name: 'Amani N.', passwordHash, isActive: true },
    create: { email: 'amani@akilimatic.demo', name: 'Amani N.', passwordHash },
  });

  const organization = await prisma.organization.create({
    data: {
      name: 'Akilimatic Ltd',
      slug: 'akilimatic-demo',
      plan: 'growth',
      timezone: 'Africa/Nairobi',
      memberships: {
        create: [
          { userId: owner.id, role: MembershipRole.OWNER },
          { userId: teammate.id, role: MembershipRole.MANAGER },
        ],
      },
      autopilot: {
        create: {
          enabled: true,
          minimumScore: 80,
          dailyLimit: 24,
          workingDays: [1, 2, 3, 4, 5],
          workdayStart: '08:30',
          workdayEnd: '17:30',
          timezone: 'Africa/Nairobi',
          approvalMode: 'HIGH_VALUE_ONLY',
          highValueThreshold: 600000,
          followUpDays: 3,
          stopOnReply: true,
          stopOnMeeting: true,
        },
      },
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: organization.id,
      name: 'Coast schools & growing SMEs',
      offer: 'AI-powered customer communication and operations software',
      locations: ['Mombasa', 'Kwale', 'Kilifi'],
      industries: ['Private School', 'Hospitality', 'Healthcare', 'Logistics'],
      targetCount: 100,
      status: CampaignStatus.COMPLETED,
    },
  });

  const sequence = await prisma.sequence.create({
    data: {
      organizationId: organization.id,
      name: 'Warm need-signal outreach',
      steps: {
        create: [
          { position: 1, delayHours: 0, channel: OutreachChannel.EMAIL, subject: 'A practical idea for {{company}}', prompt: 'Lead with the detected operational need and one clear outcome.' },
          { position: 2, delayHours: 48, channel: OutreachChannel.WHATSAPP, prompt: 'Send a concise, respectful follow-up with an opt-out.' },
          { position: 3, delayHours: 96, channel: OutreachChannel.EMAIL, subject: 'Worth exploring this quarter?', prompt: 'Share a short proof point and invite a 15-minute conversation.' },
        ],
      },
    },
  });

  const createdLeads = [];
  for (const [name, website, industry, location, score, status, value, signal, offer] of demoLeads) {
    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        campaignId: campaign.id,
        name,
        website: `https://${website}`,
        industry,
        location,
        source: score > 80 ? 'Google Business + public website' : 'Public business directories',
        status,
        score,
        estimatedValue: value,
        currency: 'KES',
        aiSummary: `${name} shows a credible operational need: ${signal.toLowerCase()}.`,
        recommendedOffer: offer,
        rawSignals: { employeesEstimate: Math.max(12, score - 40), sourceCount: score > 80 ? 4 : 2, verified: score >= 70 },
        signals: {
          create: [
            { source: 'Public website', type: 'operational_need', value: signal, confidence: score / 100, evidenceUrl: `https://${website}/` },
            { source: 'Business directory', type: 'growth_signal', value: 'Recent public activity detected', confidence: Math.max(0.55, (score - 8) / 100) },
          ],
        },
        contacts: {
          create: {
            organizationId: organization.id,
            name: `${name.split(' ')[0]} Decision Maker`,
            title: industry === 'Private School' ? 'School Director' : 'Operations Director',
            email: `hello@${website}`,
            phone: `+2547${String(10000000 + score * 713).slice(0, 8)}`,
            whatsapp: `+2547${String(10000000 + score * 713).slice(0, 8)}`,
            isDecisionMaker: true,
            source: 'Public business contact',
          },
        },
      },
    });
    createdLeads.push(lead);
  }

  const messageStates = [
    OutreachStatus.NEEDS_REVIEW,
    OutreachStatus.SENT,
    OutreachStatus.REPLIED,
    OutreachStatus.DELIVERED,
    OutreachStatus.SCHEDULED,
    OutreachStatus.OPENED,
  ];
  const sentStates = new Set<OutreachStatus>([
    OutreachStatus.SENT,
    OutreachStatus.REPLIED,
    OutreachStatus.DELIVERED,
    OutreachStatus.OPENED,
  ]);
  for (const [index, lead] of createdLeads.slice(0, 8).entries()) {
    const status = messageStates[index % messageStates.length]!;
    await prisma.outreachMessage.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        sequenceId: sequence.id,
        channel: index % 3 === 1 ? OutreachChannel.WHATSAPP : OutreachChannel.EMAIL,
        status,
        recipient: `hello@${demoLeads[index]![1]}`,
        subject: index % 3 === 1 ? null : `A practical growth idea for ${lead.name}`,
        body: `Hi ${lead.name} team, we noticed ${demoLeads[index]![7].toLowerCase()}. Akilimatic can help you ${demoLeads[index]![8].toLowerCase()}. Would a short conversation be useful?`,
        scheduledFor: status === OutreachStatus.SCHEDULED ? new Date(Date.now() + 86_400_000) : null,
        sentAt: sentStates.has(status) ? new Date(Date.now() - index * 3_600_000) : null,
        providerId: sentStates.has(status) ? `demo-${index + 1}` : null,
      },
    });
  }

  await prisma.auditLog.createMany({
    data: [
      { organizationId: organization.id, userId: owner.id, action: AuditAction.CREATE, resourceType: 'Campaign', resourceId: campaign.id, metadata: { name: campaign.name } },
      { organizationId: organization.id, userId: owner.id, action: AuditAction.AUTOPILOT_RESUME, resourceType: 'AutopilotConfig', metadata: { minimumScore: 80, dailyLimit: 24 } },
      { organizationId: organization.id, userId: teammate.id, action: AuditAction.OUTREACH_APPROVE, resourceType: 'OutreachMessage', metadata: { channel: 'EMAIL' } },
    ],
  });

  const secondOrganization = await prisma.organization.create({
    data: {
      name: 'Coastline Growth Studio',
      slug: 'coastline-demo',
      plan: 'starter',
      memberships: { create: { userId: owner.id, role: MembershipRole.ADMIN } },
      autopilot: { create: { enabled: false, minimumScore: 85, dailyLimit: 10 } },
    },
  });
  await prisma.lead.createMany({
    data: [
      { organizationId: secondOrganization.id, name: 'Demo Retail Group', website: 'https://demo-retail.example', industry: 'Retail', location: 'Nairobi', score: 78, status: LeadStatus.QUALIFIED },
      { organizationId: secondOrganization.id, name: 'Demo Wellness Hub', website: 'https://demo-wellness.example', industry: 'Wellness', location: 'Nairobi', score: 72, status: LeadStatus.DISCOVERED },
    ],
  });

  console.log(JSON.stringify({
    login: { email: 'hasan@akilimatic.demo', password: 'DemoPass!2026' },
    organizations: 2,
    primaryOrganizationId: organization.id,
    campaigns: 1,
    leads: createdLeads.length + 2,
    outreachMessages: 8,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

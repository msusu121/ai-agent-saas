import {
  MembershipRole,
  PrismaClient,
} from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

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

  // demoLeads, campaign, sequence, outreachMessages, auditLog,
  // secondOrganization all commented out — not needed for seed

  console.log(JSON.stringify({
    login: { email: 'hasan@akilimatic.demo', password: 'DemoPass!2026' },
    organizations: 1,
    primaryOrganizationId: organization.id,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

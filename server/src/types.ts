import type { MembershipRole } from '@prisma/client';

export type AuthContext = {
  userId: string;
  organizationId?: string;
  role?: MembershipRole;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}

export {};

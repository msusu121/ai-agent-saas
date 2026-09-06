import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { autopilotRouter } from '../modules/autopilot/autopilot.routes.js';
import { outreachRouter } from '../modules/autopilot/outreach.routes.js';
import { campaignRouter } from '../modules/campaigns/campaign.routes.js';
import { credentialRouter } from '../modules/credentials/credential.routes.js';
import { leadRouter } from '../modules/leads/lead.routes.js';
import { organizationRouter } from '../modules/organizations/organization.routes.js';
import { storageRouter } from '../modules/storage/storage.routes.js';
import { sequenceRouter } from '../modules/sequences/sequence.routes.js';
import { socialRouter } from '../modules/social/social.routes.js';
import { socialOAuthRouter } from '../modules/social/social-oauth.js';

export const apiRouter = Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/organizations', organizationRouter);
apiRouter.use('/credentials', requireAuth, credentialRouter);
apiRouter.use('/campaigns', requireAuth, campaignRouter);
apiRouter.use('/leads', requireAuth, leadRouter);
apiRouter.use('/autopilot', requireAuth, autopilotRouter);
apiRouter.use('/outreach', requireAuth, outreachRouter);
apiRouter.use('/storage', requireAuth, storageRouter);
apiRouter.use('/sequences', requireAuth, sequenceRouter);
apiRouter.use('/social/oauth', socialOAuthRouter);
apiRouter.use('/social', requireAuth, socialRouter);

import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler.js';
import { requireOrganization } from '../../middleware/auth.js';
import { createPresignedUpload } from './minio.service.js';

const router = Router();
router.use(requireOrganization);

router.post('/uploads/presign', asyncHandler(async (request, response) => {
  const { filename } = z.object({ filename: z.string().min(1).max(180) }).parse(request.body);
  const upload = await createPresignedUpload(request.auth!.organizationId!, filename);
  response.status(201).json({ upload, expiresInSeconds: 600 });
}));

export { router as storageRouter };

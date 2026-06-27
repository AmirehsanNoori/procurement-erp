import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requireAuth } from '../../middleware/requireAuth';
import { requireSuperAdmin } from '../../middleware/requirePermission';
import { validate } from '../../middleware/validate';
import { listUserTenants } from '../../rbac/access';

const router = Router();
router.use(requireAuth);

// GET /api/tenants — tenants visible to the caller (super admin = all, else memberships).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (req.auth!.isSuperAdmin) {
      const tenants = await prisma.tenant.findMany({ orderBy: { name: 'asc' } });
      return res.json({ tenants });
    }
    res.json({ tenants: await listUserTenants(req.auth!.userId) });
  })
);

const tenantSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  isActive: z.boolean().optional(),
});

// POST /api/tenants — super admin only.
router.post(
  '/',
  requireSuperAdmin,
  validate(tenantSchema),
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.create({ data: req.body });
    res.status(201).json({ tenant });
  })
);

// PATCH /api/tenants/:id — super admin only.
router.patch(
  '/:id',
  requireSuperAdmin,
  validate(tenantSchema.partial()),
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: req.body });
    res.json({ tenant });
  })
);

export default router;

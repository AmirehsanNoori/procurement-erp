import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { hashPassword } from '../../auth/password';
import { revokeAllUserTokens } from '../../auth/tokens';
import { ALL_PERMISSIONS, MODULE_FA } from '../../rbac/permissions';
import { writeAudit, clientIp } from '../../lib/audit';

const router = Router();
router.use(requireAuth);

/**
 * Allowed to manage users if super admin OR holds user_management.manage_users
 * in at least one active tenant (i.e. a Procurement Manager).
 */
async function requireUserAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth!.isSuperAdmin) return next();
  const can = await prisma.userPermissionOverride.findFirst({
    where: { userId: req.auth!.userId, allowed: true, permission: { key: 'user_management.manage_users' } },
  });
  if (can) return next();
  const viaRole = await prisma.tenantUser.findFirst({
    where: {
      userId: req.auth!.userId,
      isActive: true,
      role: { rolePermissions: { some: { permission: { key: 'user_management.manage_users' } } } },
    },
  });
  if (viaRole) return next();
  next(ApiError.forbidden('اجازه مدیریت کاربران را ندارید'));
}

function publicUser(u: {
  id: string; fullName: string; email: string; phone: string | null;
  isActive: boolean; isSuperAdmin: boolean; lastLoginAt: Date | null;
  createdAt: Date; updatedAt: Date;
  tenantUsers?: { tenantId: string; roleId: string; isActive: boolean; tenant: { name: string; code: string }; role: { name: string } }[];
}) {
  return {
    id: u.id, fullName: u.fullName, email: u.email, phone: u.phone,
    isActive: u.isActive, isSuperAdmin: u.isSuperAdmin, lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt, updatedAt: u.updatedAt,
    tenants: (u.tenantUsers ?? []).map((tu) => ({
      tenantId: tu.tenantId, tenantName: tu.tenant.name, tenantCode: tu.tenant.code,
      roleId: tu.roleId, roleName: tu.role.name, isActive: tu.isActive,
    })),
  };
}

const userInclude = { tenantUsers: { include: { tenant: true, role: true } } } as const;

// ---- Reference data ----

// GET /api/users/roles
router.get(
  '/roles',
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    res.json({ roles });
  })
);

// GET /api/users/permissions — catalog grouped by module (for the override editor UI)
router.get(
  '/permissions',
  asyncHandler(async (_req, res) => {
    const grouped = ALL_PERMISSIONS.reduce<Record<string, { module: string; moduleFa: string; items: typeof ALL_PERMISSIONS }>>(
      (acc, p) => {
        acc[p.module] ??= { module: p.module, moduleFa: MODULE_FA[p.module], items: [] };
        acc[p.module].items.push(p);
        return acc;
      },
      {}
    );
    res.json({ modules: Object.values(grouped) });
  })
);

// ---- User CRUD (admin) ----

// GET /api/users
router.get(
  '/',
  requireUserAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ include: userInclude, orderBy: { fullName: 'asc' } });
    res.json({ users: users.map(publicUser) });
  })
);

// GET /api/users/:id
router.get(
  '/:id',
  requireUserAdmin,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: userInclude });
    if (!user) throw ApiError.notFound('کاربر یافت نشد');
    const overrides = await prisma.userPermissionOverride.findMany({
      where: { userId: user.id },
      include: { permission: true },
    });
    res.json({
      user: publicUser(user),
      overrides: overrides.map((o) => ({
        tenantId: o.tenantId, permissionKey: o.permission.key, allowed: o.allowed,
      })),
    });
  })
);

const createSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  tenants: z
    .array(z.object({ tenantId: z.string(), roleId: z.string() }))
    .optional(),
});

// POST /api/users
router.post(
  '/',
  requireUserAdmin,
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        fullName: body.fullName,
        email: body.email.toLowerCase(),
        phone: body.phone,
        isActive: body.isActive ?? true,
        passwordHash,
        tenantUsers: body.tenants?.length
          ? { create: body.tenants.map((t) => ({ tenantId: t.tenantId, roleId: t.roleId })) }
          : undefined,
      },
      include: userInclude,
    });
    await writeAudit({ action: 'users.create', userId: req.auth!.userId, entityType: 'user', entityId: user.id, ip: clientIp(req) });
    res.status(201).json({ user: publicUser(user) });
  })
);

const updateSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/users/:id
router.patch(
  '/:id',
  requireUserAdmin,
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
      include: userInclude,
    });
    if (req.body.isActive === false) await revokeAllUserTokens(user.id);
    await writeAudit({ action: 'users.update', userId: req.auth!.userId, entityType: 'user', entityId: user.id, ip: clientIp(req) });
    res.json({ user: publicUser(user) });
  })
);

// POST /api/users/:id/reset-password
router.post(
  '/:id/reset-password',
  requireUserAdmin,
  validate(z.object({ password: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const passwordHash = await hashPassword(req.body.password);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
    await revokeAllUserTokens(req.params.id);
    await writeAudit({ action: 'users.reset_password', userId: req.auth!.userId, entityType: 'user', entityId: req.params.id, ip: clientIp(req) });
    res.json({ ok: true });
  })
);

// POST /api/users/:id/tenants — assign/upsert membership with a role
router.post(
  '/:id/tenants',
  requireUserAdmin,
  validate(z.object({ tenantId: z.string(), roleId: z.string(), isActive: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const { tenantId, roleId, isActive } = req.body as { tenantId: string; roleId: string; isActive?: boolean };
    const membership = await prisma.tenantUser.upsert({
      where: { tenantId_userId: { tenantId, userId: req.params.id } },
      create: { tenantId, userId: req.params.id, roleId, isActive: isActive ?? true },
      update: { roleId, isActive: isActive ?? true },
      include: { tenant: true, role: true },
    });
    await writeAudit({ action: 'users.assign_tenant', userId: req.auth!.userId, entityType: 'user', entityId: req.params.id, metadata: { tenantId, roleId }, ip: clientIp(req) });
    res.json({ membership });
  })
);

// DELETE /api/users/:id/tenants/:tenantId — remove membership
router.delete(
  '/:id/tenants/:tenantId',
  requireUserAdmin,
  asyncHandler(async (req, res) => {
    await prisma.tenantUser
      .delete({ where: { tenantId_userId: { tenantId: req.params.tenantId, userId: req.params.id } } })
      .catch(() => undefined);
    res.json({ ok: true });
  })
);

// PATCH /api/users/:id/permissions — set per-tenant overrides
// body: { tenantId, overrides: [{ permissionKey, allowed: boolean | null }] }
// allowed=null removes the override (revert to role default).
router.patch(
  '/:id/permissions',
  requireUserAdmin,
  validate(
    z.object({
      tenantId: z.string(),
      overrides: z.array(
        z.object({ permissionKey: z.string(), allowed: z.boolean().nullable() })
      ),
    })
  ),
  asyncHandler(async (req, res) => {
    const { tenantId, overrides } = req.body as {
      tenantId: string;
      overrides: { permissionKey: string; allowed: boolean | null }[];
    };
    const userId = req.params.id;

    for (const ov of overrides) {
      const perm = await prisma.permission.findUnique({ where: { key: ov.permissionKey } });
      if (!perm) continue;
      if (ov.allowed === null) {
        await prisma.userPermissionOverride
          .delete({ where: { tenantId_userId_permissionId: { tenantId, userId, permissionId: perm.id } } })
          .catch(() => undefined);
      } else {
        await prisma.userPermissionOverride.upsert({
          where: { tenantId_userId_permissionId: { tenantId, userId, permissionId: perm.id } },
          create: { tenantId, userId, permissionId: perm.id, allowed: ov.allowed },
          update: { allowed: ov.allowed },
        });
      }
    }
    await writeAudit({ action: 'users.update_permissions', userId: req.auth!.userId, entityType: 'user', entityId: userId, metadata: { tenantId }, ip: clientIp(req) });
    res.json({ ok: true });
  })
);

export default router;

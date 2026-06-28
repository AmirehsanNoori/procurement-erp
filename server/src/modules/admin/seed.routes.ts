import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { ALL_PERMISSIONS, ROLES, ROLE_DEFAULTS, ROLE_DESCRIPTIONS, RoleName } from '../../rbac/permissions';

const router = Router();

// One-time seed endpoint — protected by SEED_SECRET header.
// Call: POST /api/admin/seed  with header  x-seed-secret: <SEED_SECRET>
router.post('/', async (req: Request, res: Response) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.headers['x-seed-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const log: string[] = [];

    // 1) Tenants
    const TENANTS = [
      { name: 'IOID-WPA', code: 'IOID-WPA' },
      { name: 'SOPID-CMK', code: 'SOPID-CMK' },
    ];
    const tenants = [];
    for (const t of TENANTS) {
      tenants.push(
        await prisma.tenant.upsert({ where: { code: t.code }, create: t, update: { name: t.name } })
      );
    }
    log.push(`tenants: ${tenants.map((t) => t.code).join(', ')}`);

    // 2) Permissions
    for (const p of ALL_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, module: p.module, action: p.action, description: p.description },
        update: { module: p.module, action: p.action, description: p.description },
      });
    }
    const allPerms = await prisma.permission.findMany();
    const permByKey = new Map(allPerms.map((p) => [p.key, p]));
    log.push(`permissions: ${allPerms.length}`);

    // 3) Roles + default permissions
    for (const roleName of Object.values(ROLES) as RoleName[]) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        create: { name: roleName, description: ROLE_DESCRIPTIONS[roleName], isSystem: true },
        update: { description: ROLE_DESCRIPTIONS[roleName], isSystem: true },
      });
      const keys = ROLE_DEFAULTS[roleName];
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: keys
          .map((k) => permByKey.get(k))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
      log.push(`role ${roleName}: ${keys.length} perms`);
    }

    const managerRole = await prisma.role.findUniqueOrThrow({
      where: { name: ROLES.PROCUREMENT_MANAGER },
    });

    // 4) Admin user
    const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@procurement.local';
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@12345';
    const adminFullName = process.env.ADMIN_FULL_NAME ?? 'System Administrator';
    const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

    const passwordHash = await bcrypt.hash(adminPassword, bcryptRounds);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      create: { fullName: adminFullName, email: adminEmail.toLowerCase(), passwordHash, isSuperAdmin: true, isActive: true },
      update: { isSuperAdmin: true, isActive: true },
    });

    for (const tenant of tenants) {
      await prisma.tenantUser.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
        create: { tenantId: tenant.id, userId: admin.id, roleId: managerRole.id },
        update: { roleId: managerRole.id, isActive: true },
      });
    }
    log.push(`admin: ${admin.email}`);

    return res.json({ ok: true, log });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

export default router;

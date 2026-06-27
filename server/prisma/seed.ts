import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  ALL_PERMISSIONS,
  ROLES,
  ROLE_DEFAULTS,
  ROLE_DESCRIPTIONS,
  RoleName,
} from '../src/rbac/permissions';
import { env } from '../src/config/env';

const prisma = new PrismaClient();

const TENANTS = [
  { name: 'IOID-WPA', code: 'IOID-WPA' },
  { name: 'SOPID-CMK', code: 'SOPID-CMK' },
];

async function main() {
  console.log('Seeding…');

  // 1) Tenants
  const tenants = [];
  for (const t of TENANTS) {
    tenants.push(
      await prisma.tenant.upsert({ where: { code: t.code }, create: t, update: { name: t.name } })
    );
  }
  console.log(`  tenants: ${tenants.map((t) => t.code).join(', ')}`);

  // 2) Permissions (idempotent)
  for (const p of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, module: p.module, action: p.action, description: p.description },
      update: { module: p.module, action: p.action, description: p.description },
    });
  }
  const allPerms = await prisma.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [p.key, p]));
  console.log(`  permissions: ${allPerms.length}`);

  // 3) Roles + their default permissions
  for (const roleName of Object.values(ROLES) as RoleName[]) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, description: ROLE_DESCRIPTIONS[roleName], isSystem: true },
      update: { description: ROLE_DESCRIPTIONS[roleName], isSystem: true },
    });

    const keys = ROLE_DEFAULTS[roleName];
    // Reset to defaults each seed run so the matrix stays authoritative.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: keys
        .map((k) => permByKey.get(k))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    console.log(`  role ${roleName}: ${keys.length} permissions`);
  }

  const managerRole = await prisma.role.findUniqueOrThrow({
    where: { name: ROLES.PROCUREMENT_MANAGER },
  });

  // 4) Initial admin (super admin, Procurement Manager in both tenants)
  const passwordHash = await bcrypt.hash(env.admin.password, env.bcryptRounds);
  const admin = await prisma.user.upsert({
    where: { email: env.admin.email.toLowerCase() },
    create: {
      fullName: env.admin.fullName,
      email: env.admin.email.toLowerCase(),
      passwordHash,
      isSuperAdmin: true,
      isActive: true,
    },
    update: { isSuperAdmin: true, isActive: true },
  });

  for (const tenant of tenants) {
    await prisma.tenantUser.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
      create: { tenantId: tenant.id, userId: admin.id, roleId: managerRole.id },
      update: { roleId: managerRole.id, isActive: true },
    });
  }
  console.log(`  admin: ${admin.email} (super admin, manager in both tenants)`);

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { prisma } from '../lib/prisma';
import { ROLE_DEFAULTS, RoleName } from './permissions';

export interface TenantAccess {
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  roleId: string;
  roleName: string;
  permissions: string[]; // effective permission keys (role defaults ± overrides)
}

/**
 * Resolve the effective permission set for a user within a single tenant.
 * Effective = role default permissions, then per-user overrides applied
 * (allowed=true adds, allowed=false removes).
 *
 * Super admins implicitly receive every permission for every tenant they belong to.
 */
export async function resolveTenantAccess(
  userId: string,
  tenantId: string
): Promise<TenantAccess | null> {
  const membership = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: { tenant: true, role: true, user: true },
  });

  // Super admins implicitly have full access to every active tenant, even ones
  // they were never enrolled in (e.g. orgs they just created). Synthesize access.
  if (!membership) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.isSuperAdmin) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant || !tenant.isActive) return null;
      const all = await prisma.permission.findMany({ select: { key: true } });
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantCode: tenant.code,
        roleId: '',
        roleName: 'مدیر کل',
        permissions: all.map((p) => p.key),
      };
    }
    return null;
  }

  if (!membership.isActive) return null;
  if (!membership.tenant.isActive) return null;

  const roleName = membership.role.name as RoleName;
  const base = new Set<string>(ROLE_DEFAULTS[roleName] ?? []);

  // Pull permission keys this role is actually granted (DB is the source of truth
  // once seeded; the static defaults are the fallback for freshly created roles).
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId: membership.roleId },
    include: { permission: true },
  });
  for (const rp of rolePerms) base.add(rp.permission.key);

  // Apply per-user overrides for this tenant.
  const overrides = await prisma.userPermissionOverride.findMany({
    where: { tenantId, userId },
    include: { permission: true },
  });
  for (const ov of overrides) {
    if (ov.allowed) base.add(ov.permission.key);
    else base.delete(ov.permission.key);
  }

  let permissions = Array.from(base);

  if (membership.user.isSuperAdmin) {
    const all = await prisma.permission.findMany({ select: { key: true } });
    permissions = all.map((p) => p.key);
  }

  return {
    tenantId,
    tenantName: membership.tenant.name,
    tenantCode: membership.tenant.code,
    roleId: membership.roleId,
    roleName: membership.role.name,
    permissions,
  };
}

/** List the tenants a user can access (active memberships, active tenants).
 *  Super admins see every active tenant, even ones they aren't enrolled in. */
export async function listUserTenants(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (user?.isSuperAdmin) {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return tenants.map((t) => ({
      tenantId: t.id,
      name: t.name,
      code: t.code,
      roleName: 'مدیر کل',
    }));
  }

  const memberships = await prisma.tenantUser.findMany({
    where: { userId, isActive: true, tenant: { isActive: true } },
    include: { tenant: true, role: true },
    orderBy: { tenant: { name: 'asc' } },
  });
  return memberships.map((m) => ({
    tenantId: m.tenantId,
    name: m.tenant.name,
    code: m.tenant.code,
    roleName: m.role.name,
  }));
}

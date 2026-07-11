import { prisma } from '../lib/prisma';

/**
 * Module entitlements (Core, ADR-0004). Default-allow: a module is available to
 * a tenant unless an explicit tenant_modules row disables it. Fail-open if the
 * table isn't present yet (transitional deploys) so the app never breaks — it
 * simply behaves as "all modules enabled" until entitlements are configured.
 */
export async function disabledModuleKeys(tenantId: string): Promise<string[]> {
  try {
    const rows = await prisma.tenantModule.findMany({
      where: { tenantId, enabled: false },
      select: { moduleKey: true },
    });
    return rows.map((r) => r.moduleKey);
  } catch {
    return [];
  }
}

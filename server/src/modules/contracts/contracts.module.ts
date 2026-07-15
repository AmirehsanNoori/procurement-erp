import type { ApiModule } from '@lumentra/core-contracts';
import contractRoutes from './contracts.routes';

/**
 * Contracts — contract lifecycle management (قراردادها): contracts, amendments,
 * guarantees and renewal/expiry tracking. Mounted at /:tenantId/contracts,
 * gated by the `contracts` entitlement + permissions.
 */
export const contractsModule: ApiModule = {
  key: 'contracts',
  title: 'Contracts',
  basePath: 'contracts',
  entitlementRequired: true,
  permissions: {
    contracts: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  },
  register() {
    return { router: contractRoutes };
  },
};

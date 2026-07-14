import type { ApiModule } from '@lumentra/core-contracts';
import financeRoutes from './finance.routes';

/**
 * Finance — independent General Ledger module (Phase F1). Chart of accounts,
 * fiscal years, double-entry journals (draft → posted → void / reversing),
 * ledger and trial-balance reports. Cross-module links to procurement use soft
 * references. Mounted at /:tenantId/finance, gated by the `finance` entitlement.
 */
export const financeModule: ApiModule = {
  key: 'finance',
  title: 'Finance / General Ledger',
  basePath: 'finance',
  entitlementRequired: true,
  permissions: {
    finance: ['view', 'create', 'edit', 'delete', 'post', 'void', 'export'],
  },
  register() {
    return { router: financeRoutes };
  },
};

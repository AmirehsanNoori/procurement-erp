import type { ApiModule } from '@lumentra/core-contracts';
import inventoryRoutes from './inventory.routes';

/**
 * Inventory / Warehouse — the first business module built natively on the Core
 * platform (Phase B). Products, warehouses, stock levels and movements. Mounted
 * at /:tenantId/inventory and gated by the `warehouse` entitlement + permissions.
 */
export const inventoryModule: ApiModule = {
  key: 'inventory',
  title: 'Inventory / Warehouse',
  basePath: 'inventory',
  entitlementRequired: true,
  permissions: {
    warehouse: ['view', 'create', 'edit', 'delete', 'receive', 'issue', 'transfer', 'adjust', 'export'],
  },
  register() {
    return { router: inventoryRoutes };
  },
};

import type { ApiModule } from '@lumentra/core-contracts';
import purchaseOrderRoutes from './purchase-orders.routes';

/** Purchase Orders — the formal P2P commitment document with three-way match. */
export const purchaseOrdersModule: ApiModule = {
  key: 'purchase-orders',
  title: 'Purchase Orders',
  basePath: 'purchase-orders',
  permissions: {
    purchase_orders: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  },
  register() {
    return { router: purchaseOrderRoutes };
  },
};

import type { ApiModule } from '@lumentra/core-contracts';
import paymentRoutes from './payments.routes';

/** Payments — Procurement sub-module (M4). */
export const paymentsModule: ApiModule = {
  key: 'payments',
  title: 'Payments',
  basePath: 'payments',
  permissions: {
    payments: ['view', 'create', 'edit', 'delete', 'register_payment', 'export'],
  },
  register() {
    return { router: paymentRoutes };
  },
};

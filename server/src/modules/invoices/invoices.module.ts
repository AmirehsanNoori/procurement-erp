import type { ApiModule } from '@lumentra/core-contracts';
import invoiceRoutes from './invoices.routes';

/** Invoices — Procurement sub-module (M4). Owns invoices + paid_invoice_archive. */
export const invoicesModule: ApiModule = {
  key: 'invoices',
  title: 'Invoices',
  basePath: 'invoices',
  permissions: {
    invoices: ['view', 'create', 'edit', 'delete', 'archive', 'approve', 'assign_budget', 'export'],
    paid_invoice_archive: ['view', 'export'],
  },
  register() {
    return { router: invoiceRoutes };
  },
};

import type { ApiModule } from '@lumentra/core-contracts';
import quotationRoutes from './quotations.routes';

/** Quotations / RFQ (pre-invoices) — Procurement sub-module (M4).
 *  Owns the quotations + quotation_archive permission surface. */
export const quotationsModule: ApiModule = {
  key: 'quotations',
  title: 'Quotations',
  basePath: 'quotations',
  permissions: {
    quotations: ['view', 'create', 'edit', 'delete', 'archive', 'restore', 'approve', 'export'],
    quotation_archive: ['view', 'restore', 'export'],
  },
  register() {
    return { router: quotationRoutes };
  },
};

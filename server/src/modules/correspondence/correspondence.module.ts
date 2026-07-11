import type { ApiModule } from '@lumentra/core-contracts';
import correspondenceRoutes from './correspondence.routes';

/** Correspondence (official letters) — Procurement sub-module (M4). */
export const correspondenceModule: ApiModule = {
  key: 'correspondence',
  title: 'Correspondence',
  basePath: 'correspondence',
  permissions: {
    correspondence: ['view', 'create', 'edit', 'delete', 'export'],
  },
  register() {
    return { router: correspondenceRoutes };
  },
};

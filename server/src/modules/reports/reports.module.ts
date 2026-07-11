import type { ApiModule } from '@lumentra/core-contracts';
import reportsRoutes from './reports.routes';

/** Reports & KPI — Procurement sub-module (M4). */
export const reportsModule: ApiModule = {
  key: 'reports',
  title: 'Reports',
  basePath: 'reports',
  permissions: {
    reports: ['view', 'export'],
  },
  register() {
    return { router: reportsRoutes };
  },
};

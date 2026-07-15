import type { ApiModule } from '@lumentra/core-contracts';
import hrRoutes from './hr.routes';

/** HR — human resources (منابع انسانی): departments, employees, leave and
 *  attendance. Mounted at /:tenantId/hr, gated by the `hr` entitlement. */
export const hrModule: ApiModule = {
  key: 'hr',
  title: 'Human Resources',
  basePath: 'hr',
  entitlementRequired: true,
  permissions: {
    hr: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  },
  register() {
    return { router: hrRoutes };
  },
};

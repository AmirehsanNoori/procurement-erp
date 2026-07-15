import type { ApiModule } from '@lumentra/core-contracts';
import officeRoutes from './office.routes';

/** Office automation (اتوماسیون اداری): secretariat/correspondence registry and
 *  meetings. Mounted at /:tenantId/office, gated by the `office` entitlement. */
export const officeModule: ApiModule = {
  key: 'office',
  title: 'Office Automation',
  basePath: 'office',
  entitlementRequired: true,
  permissions: {
    office: ['view', 'create', 'edit', 'delete'],
  },
  register() {
    return { router: officeRoutes };
  },
};

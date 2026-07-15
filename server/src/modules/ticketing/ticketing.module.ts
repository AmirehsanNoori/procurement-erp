import type { ApiModule } from '@lumentra/core-contracts';
import ticketingRoutes from './ticketing.routes';

/** Ticketing — support / IT tickets (تیکتینگ). Mounted at /:tenantId/ticketing,
 *  gated by the `ticketing` entitlement. */
export const ticketingModule: ApiModule = {
  key: 'ticketing',
  title: 'Ticketing',
  basePath: 'ticketing',
  entitlementRequired: true,
  permissions: {
    ticketing: ['view', 'create', 'edit', 'delete', 'assign'],
  },
  register() {
    return { router: ticketingRoutes };
  },
};

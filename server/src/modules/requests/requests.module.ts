import type { ApiModule } from '@lumentra/core-contracts';
import requestRoutes from './requests.routes';

/** Requests (PQ) — Procurement sub-module. Owns the requests + request_archive
 *  permission surface; router/behavior/DB unchanged (M4). */
export const requestsModule: ApiModule = {
  key: 'requests',
  title: 'Requests',
  basePath: 'requests',
  permissions: {
    requests: ['view', 'create', 'edit', 'delete', 'archive', 'restore', 'import', 'export'],
    request_archive: ['view', 'restore', 'export'],
  },
  register() {
    return { router: requestRoutes };
  },
};

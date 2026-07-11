import type { ApiModule } from '@lumentra/core-contracts';
import controlCenterRoutes from './control.routes';

/** Control Center (IOID grid) — Procurement sub-module (M4). */
export const controlCenterModule: ApiModule = {
  key: 'control-center',
  title: 'Control Center',
  basePath: 'control-center',
  permissions: {
    control_center: ['view', 'edit', 'import', 'export'],
  },
  register() {
    return { router: controlCenterRoutes };
  },
};

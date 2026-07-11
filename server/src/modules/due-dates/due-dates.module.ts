import type { ApiModule } from '@lumentra/core-contracts';
import dueDatesRoutes from './due-dates.routes';

/** Due-date monitor — Procurement sub-module (M4). */
export const dueDatesModule: ApiModule = {
  key: 'due-dates',
  title: 'Due Dates',
  basePath: 'due-dates',
  permissions: {
    due_dates: ['view', 'export'],
  },
  register() {
    return { router: dueDatesRoutes };
  },
};

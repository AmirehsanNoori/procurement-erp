import type { ApiModule } from '@lumentra/core-contracts';
import budgetRoutes from './budgets.routes';

/** Monthly Budget & control — Procurement sub-module (M4). */
export const budgetsModule: ApiModule = {
  key: 'budgets',
  title: 'Monthly Budget',
  basePath: 'budgets',
  permissions: {
    monthly_budget: ['view', 'create', 'edit', 'delete', 'approve', 'assign_budget', 'export'],
  },
  register() {
    return { router: budgetRoutes };
  },
};

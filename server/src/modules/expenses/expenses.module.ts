import type { ApiModule } from '@lumentra/core-contracts';
import expensesRoutes from './expenses.routes';

/** Expense reports — Procurement sub-module (M4). */
export const expensesModule: ApiModule = {
  key: 'expenses',
  title: 'Expenses',
  basePath: 'expenses',
  permissions: {
    expenses: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  },
  register() {
    return { router: expensesRoutes };
  },
};

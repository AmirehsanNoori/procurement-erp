import { describe, it, expect } from 'vitest';
import { tenantModuleBasePaths } from './index';

// Locks the tenant-scoped mount graph so the Core-registry refactor stays
// behavior-identical to the previous hand-wired mounting.
describe('tenant module mounting (via Core registry)', () => {
  it('mounts exactly these modules, in this order, under /:tenantId', () => {
    expect(tenantModuleBasePaths).toEqual([
      'requests',
      'suppliers',
      'budgets',
      'quotations',
      'purchase-orders',
      'invoices',
      'payments',
      'control-center',
      'documents',
      'dashboard',
      'notifications',
      'audit',
      'import-export',
      'due-dates',
      'tasks',
      'timeline',
      'analytics',
      'reports',
      'search',
      'approvals',
      'correspondence',
      'expenses',
      'inventory',
      'finance',
      'contracts',
      'hr',
      'ticketing',
      'office',
      'billing',
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import { expandModuleActions } from '@lumentra/core-runtime';
import { ALL_PERMISSION_KEYS } from '../rbac/permissions';
import { requestsModule } from './requests/requests.module';
import { suppliersModule } from './suppliers/suppliers.module';
import { budgetsModule } from './budgets/budgets.module';
import { quotationsModule } from './quotations/quotations.module';
import { invoicesModule } from './invoices/invoices.module';
import { paymentsModule } from './payments/payments.module';
import { controlCenterModule } from './control-center/control-center.module';
import { correspondenceModule } from './correspondence/correspondence.module';
import { expensesModule } from './expenses/expenses.module';
import { dueDatesModule } from './due-dates/due-dates.module';
import { reportsModule } from './reports/reports.module';

const procurementModules = [
  requestsModule,
  suppliersModule,
  budgetsModule,
  quotationsModule,
  invoicesModule,
  paymentsModule,
  controlCenterModule,
  correspondenceModule,
  expensesModule,
  dueDatesModule,
  reportsModule,
];

// Permission sub-modules owned by the migrated Procurement modules.
const ownedPermModules = [
  'requests',
  'request_archive',
  'suppliers',
  'monthly_budget',
  'quotations',
  'quotation_archive',
  'invoices',
  'paid_invoice_archive',
  'payments',
  'control_center',
  'correspondence',
  'expenses',
  'due_dates',
  'reports',
];

describe('Procurement modules ↔ legacy permission catalog', () => {
  it('declared permissions exactly cover the legacy keys they own (no drift, no leak)', () => {
    const declared = procurementModules.flatMap((m) => expandModuleActions(m.permissions!)).sort();
    const legacyOwned = ALL_PERMISSION_KEYS.filter((k) => ownedPermModules.includes(k.split('.')[0])).sort();
    expect(declared).toEqual(legacyOwned);
  });

  it('every module has a unique key and basePath', () => {
    expect(new Set(procurementModules.map((m) => m.key)).size).toBe(procurementModules.length);
    expect(new Set(procurementModules.map((m) => m.basePath)).size).toBe(procurementModules.length);
  });
});

import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import tenantRoutes from '../modules/tenants/tenants.routes';
import userRoutes from '../modules/users/users.routes';
import requestRoutes from '../modules/requests/requests.routes';
import supplierRoutes from '../modules/suppliers/suppliers.routes';
import budgetRoutes from '../modules/budgets/budgets.routes';
import quotationRoutes from '../modules/quotations/quotations.routes';
import invoiceRoutes from '../modules/invoices/invoices.routes';
import paymentRoutes from '../modules/payments/payments.routes';
import controlCenterRoutes from '../modules/control-center/control.routes';
import documentRoutes from '../modules/documents/documents.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import notificationRoutes from '../modules/notifications/notifications.routes';
import auditRoutes from '../modules/audit/audit.routes';
import importExportRoutes from '../modules/import-export/import-export.routes';
import dueDatesRoutes from '../modules/due-dates/due-dates.routes';
import taskRoutes from '../modules/tasks/tasks.routes';
import timelineRoutes from '../modules/timeline/timeline.routes';
import analyticsRoutes from '../modules/analytics/analytics.routes';
import reportsRoutes from '../modules/reports/reports.routes';
import searchRoutes from '../modules/search/search.routes';
import approvalRoutes from '../modules/approvals/approvals.routes';
import correspondenceRoutes from '../modules/correspondence/correspondence.routes';
import expensesRoutes from '../modules/expenses/expenses.routes';
import billingRoutes from '../modules/billing/billing.routes';
import { requireAuth } from '../middleware/requireAuth';
import { requireTenant } from '../middleware/requireTenant';
import { DefaultApiModuleRegistry } from '@lumentra/core-runtime';
import type { ApiModule, ApiModuleRegistration } from '@lumentra/core-contracts';
import { coreServices } from '../core/container';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Account-level routes (no tenant gate).
router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/users', userRoutes);

// Tenant-scoped modules are registered with the Core module registry and mounted
// beneath the shared auth + tenant gate. Same paths, same order, same behavior —
// but the mount graph is now data-driven through Core (ADR-0002). These are
// transitional adapters wrapping the existing routers; Procurement becomes a real
// ApiModule (register(core) using Core services) in M4.
const registry = new DefaultApiModuleRegistry();
const legacy = (key: string, title: string, basePath: string, r: Router): ApiModule => ({
  key,
  title,
  basePath,
  register: () => ({ router: r }),
});

registry.register(legacy('requests', 'Requests', 'requests', requestRoutes));
registry.register(legacy('suppliers', 'Suppliers', 'suppliers', supplierRoutes));
registry.register(legacy('budgets', 'Budgets', 'budgets', budgetRoutes));
registry.register(legacy('quotations', 'Quotations', 'quotations', quotationRoutes));
registry.register(legacy('invoices', 'Invoices', 'invoices', invoiceRoutes));
registry.register(legacy('payments', 'Payments', 'payments', paymentRoutes));
registry.register(legacy('control-center', 'Control Center', 'control-center', controlCenterRoutes));
registry.register(legacy('documents', 'Documents', 'documents', documentRoutes));
registry.register(legacy('dashboard', 'Dashboard', 'dashboard', dashboardRoutes));
registry.register(legacy('notifications', 'Notifications', 'notifications', notificationRoutes));
registry.register(legacy('audit', 'Audit', 'audit', auditRoutes));
registry.register(legacy('import-export', 'Import / Export', 'import-export', importExportRoutes));
registry.register(legacy('due-dates', 'Due Dates', 'due-dates', dueDatesRoutes));
registry.register(legacy('tasks', 'Tasks', 'tasks', taskRoutes));
registry.register(legacy('timeline', 'Timeline', 'timeline', timelineRoutes));
registry.register(legacy('analytics', 'Analytics', 'analytics', analyticsRoutes));
registry.register(legacy('reports', 'Reports', 'reports', reportsRoutes));
registry.register(legacy('search', 'Search', 'search', searchRoutes));
registry.register(legacy('approvals', 'Approvals', 'approvals', approvalRoutes));
registry.register(legacy('correspondence', 'Correspondence', 'correspondence', correspondenceRoutes));
registry.register(legacy('expenses', 'Expenses', 'expenses', expensesRoutes));
registry.register(legacy('billing', 'Billing', 'billing', billingRoutes));

const tenantScoped = Router({ mergeParams: true });
tenantScoped.use(requireAuth, requireTenant);
for (const mod of registry.all()) {
  const reg = mod.register(coreServices) as ApiModuleRegistration;
  tenantScoped.use('/' + mod.basePath, reg.router as Router);
}
router.use('/:tenantId', tenantScoped);

/** Exposed for tests: the ordered basePaths mounted under /:tenantId. */
export const tenantModuleBasePaths = registry.all().map((m) => m.basePath);

export default router;

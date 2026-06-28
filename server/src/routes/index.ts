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
import searchRoutes from '../modules/search/search.routes';
import approvalRoutes from '../modules/approvals/approvals.routes';
import correspondenceRoutes from '../modules/correspondence/correspondence.routes';
import expensesRoutes from '../modules/expenses/expenses.routes';
import billingRoutes from '../modules/billing/billing.routes';
import { requireAuth } from '../middleware/requireAuth';
import { requireTenant } from '../middleware/requireTenant';
const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Account-level routes
router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/users', userRoutes);

// Tenant-scoped routes: everything below sits behind auth + tenant isolation.
const tenantScoped = Router({ mergeParams: true });
tenantScoped.use(requireAuth, requireTenant);
tenantScoped.use('/requests', requestRoutes);
tenantScoped.use('/suppliers', supplierRoutes);
tenantScoped.use('/budgets', budgetRoutes);
tenantScoped.use('/quotations', quotationRoutes);
tenantScoped.use('/invoices', invoiceRoutes);
tenantScoped.use('/payments', paymentRoutes);
tenantScoped.use('/control-center', controlCenterRoutes);
tenantScoped.use('/documents', documentRoutes);
tenantScoped.use('/dashboard', dashboardRoutes);
tenantScoped.use('/notifications', notificationRoutes);
tenantScoped.use('/audit', auditRoutes);
tenantScoped.use('/import-export', importExportRoutes);
tenantScoped.use('/due-dates', dueDatesRoutes);
tenantScoped.use('/tasks', taskRoutes);
tenantScoped.use('/timeline', timelineRoutes);
tenantScoped.use('/analytics', analyticsRoutes);
tenantScoped.use('/search', searchRoutes);
tenantScoped.use('/approvals', approvalRoutes);
tenantScoped.use('/correspondence', correspondenceRoutes);
tenantScoped.use('/expenses', expensesRoutes);
tenantScoped.use('/billing', billingRoutes);
router.use('/:tenantId', tenantScoped);

export default router;

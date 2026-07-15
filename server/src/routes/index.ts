import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import tenantRoutes from '../modules/tenants/tenants.routes';
import userRoutes from '../modules/users/users.routes';
import { requestsModule } from '../modules/requests/requests.module';
import { suppliersModule } from '../modules/suppliers/suppliers.module';
import { budgetsModule } from '../modules/budgets/budgets.module';
import { quotationsModule } from '../modules/quotations/quotations.module';
import { invoicesModule } from '../modules/invoices/invoices.module';
import { paymentsModule } from '../modules/payments/payments.module';
import { controlCenterModule } from '../modules/control-center/control-center.module';
import documentRoutes from '../modules/documents/documents.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import notificationRoutes from '../modules/notifications/notifications.routes';
import auditRoutes from '../modules/audit/audit.routes';
import importExportRoutes from '../modules/import-export/import-export.routes';
import { dueDatesModule } from '../modules/due-dates/due-dates.module';
import taskRoutes from '../modules/tasks/tasks.routes';
import timelineRoutes from '../modules/timeline/timeline.routes';
import analyticsRoutes from '../modules/analytics/analytics.routes';
import { reportsModule } from '../modules/reports/reports.module';
import searchRoutes from '../modules/search/search.routes';
import approvalRoutes from '../modules/approvals/approvals.routes';
import { correspondenceModule } from '../modules/correspondence/correspondence.module';
import { expensesModule } from '../modules/expenses/expenses.module';
import { inventoryModule } from '../modules/inventory/inventory.module';
import { financeModule } from '../modules/finance/finance.module';
import billingRoutes from '../modules/billing/billing.routes';
import { requireAuth } from '../middleware/requireAuth';
import { requireTenant } from '../middleware/requireTenant';
import { DefaultApiModuleRegistry } from '@lumentra/core-runtime';
import type { ApiModule, ApiModuleRegistration } from '@lumentra/core-contracts';
import { coreServices } from '../core/container';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// TEMPORARY: stocktake tables (W4) on the build-unreachable Supabase DB via app
// runtime. Super-admin only; idempotent. Remove after use.
router.post('/admin/db-init', requireAuth, asyncHandler(async (req, res) => {
  if (!req.auth?.isSuperAdmin) return res.status(403).json({ error: 'forbidden' });
  const stmts = [
    `CREATE TABLE IF NOT EXISTS "stocktakes" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "warehouseId" TEXT NOT NULL,
      "number" INTEGER NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "note" TEXT,
      "createdById" TEXT,
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "stocktakes_tenantId_number_key" ON "stocktakes" ("tenantId", "number");`,
    `CREATE INDEX IF NOT EXISTS "stocktakes_tenantId_idx" ON "stocktakes" ("tenantId");`,
    `CREATE TABLE IF NOT EXISTS "stocktake_items" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "stocktakeId" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "systemQty" DECIMAL(18,3) NOT NULL,
      "countedQty" DECIMAL(18,3),
      "unitCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
      "note" TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS "stocktake_items_stocktakeId_idx" ON "stocktake_items" ("stocktakeId");`,
    `DO $$ BEGIN
      ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "stocktakes"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  ];
  for (const sql of stmts) await prisma.$executeRawUnsafe(sql);
  res.json({ ok: true, applied: 'stocktakes + stocktake_items' });
}));

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

// Procurement procure-to-pay sub-modules are real ApiModules (M4). Remaining
// tenant modules are still legacy adapters until their own migration.
registry.register(requestsModule);
registry.register(suppliersModule);
registry.register(budgetsModule);
registry.register(quotationsModule);
registry.register(invoicesModule);
registry.register(paymentsModule);
registry.register(controlCenterModule);
registry.register(legacy('documents', 'Documents', 'documents', documentRoutes));
registry.register(legacy('dashboard', 'Dashboard', 'dashboard', dashboardRoutes));
registry.register(legacy('notifications', 'Notifications', 'notifications', notificationRoutes));
registry.register(legacy('audit', 'Audit', 'audit', auditRoutes));
registry.register(legacy('import-export', 'Import / Export', 'import-export', importExportRoutes));
registry.register(dueDatesModule);
registry.register(legacy('tasks', 'Tasks', 'tasks', taskRoutes));
registry.register(legacy('timeline', 'Timeline', 'timeline', timelineRoutes));
registry.register(legacy('analytics', 'Analytics', 'analytics', analyticsRoutes));
registry.register(reportsModule);
registry.register(legacy('search', 'Search', 'search', searchRoutes));
registry.register(legacy('approvals', 'Approvals', 'approvals', approvalRoutes));
registry.register(correspondenceModule);
registry.register(expensesModule);
registry.register(inventoryModule);
registry.register(financeModule);
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

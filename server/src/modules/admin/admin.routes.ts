import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requireAuth } from '../../middleware/requireAuth';
import { requireSuperAdmin } from '../../middleware/requirePermission';

/**
 * TEMPORARY super-admin DDL bootstrap. Build-time `prisma migrate deploy` can't
 * reach the DB on this deploy, and the direct host is unreachable from local, so
 * this applies the specific, idempotent DDL for tables added after the last
 * applied migration — from inside the running app (which reaches the DB via the
 * pooled connection). Runs only hardcoded, IF-NOT-EXISTS statements. Remove once
 * a proper migration pipeline exists.
 */
const router = Router();

const STATEMENTS: string[] = [
  `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "requestingUnit" TEXT`,
  `CREATE TABLE IF NOT EXISTS "request_items" (
     "id" TEXT PRIMARY KEY,
     "tenantId" TEXT NOT NULL,
     "requestId" TEXT NOT NULL REFERENCES "requests"("id") ON DELETE CASCADE,
     "category" TEXT,
     "description" TEXT NOT NULL,
     "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
     "unit" TEXT,
     "unitPrice" DECIMAL(18,2),
     "lineTotal" DECIMAL(18,2),
     "taxAmount" DECIMAL(18,2),
     "notes" TEXT,
     "sortOrder" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "request_items_requestId_idx" ON "request_items"("requestId")`,
  `CREATE INDEX IF NOT EXISTS "request_items_tenantId_idx" ON "request_items"("tenantId")`,
  `CREATE TABLE IF NOT EXISTS "tenant_modules" (
     "id" TEXT PRIMARY KEY,
     "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
     "moduleKey" TEXT NOT NULL,
     "enabled" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "tenant_modules_tenantId_moduleKey_key" ON "tenant_modules"("tenantId","moduleKey")`,
  `CREATE INDEX IF NOT EXISTS "tenant_modules_tenantId_idx" ON "tenant_modules"("tenantId")`,
];

router.post(
  '/db-init',
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const results: { sql: string; ok: boolean; error?: string }[] = [];
    for (const sql of STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push({ sql: sql.replace(/\s+/g, ' ').slice(0, 70), ok: true });
      } catch (e) {
        results.push({ sql: sql.replace(/\s+/g, ' ').slice(0, 70), ok: false, error: (e as Error).message.slice(0, 200) });
      }
    }
    res.json({ ok: results.every((r) => r.ok), results });
  })
);

export default router;

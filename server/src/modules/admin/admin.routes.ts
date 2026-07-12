import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requireAuth } from '../../middleware/requireAuth';
import { requireSuperAdmin } from '../../middleware/requirePermission';

/**
 * TEMPORARY super-admin DDL bootstrap (idempotent). Applies tables added since
 * the last DB sync, from inside the running app (which reaches the DB), because
 * build-time migrate can't. Hardcoded IF-NOT-EXISTS statements only. Removed
 * once applied.
 */
const router = Router();

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "products" (
     "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
     "code" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT, "unit" TEXT, "barcode" TEXT,
     "minStock" DECIMAL(18,3), "isActive" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT, "createdById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "products_tenantId_code_key" ON "products"("tenantId","code")`,
  `CREATE INDEX IF NOT EXISTS "products_tenantId_idx" ON "products"("tenantId")`,
  `CREATE TABLE IF NOT EXISTS "warehouses" (
     "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
     "code" TEXT NOT NULL, "name" TEXT NOT NULL, "location" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_tenantId_code_key" ON "warehouses"("tenantId","code")`,
  `CREATE INDEX IF NOT EXISTS "warehouses_tenantId_idx" ON "warehouses"("tenantId")`,
  `CREATE TABLE IF NOT EXISTS "stock_movements" (
     "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
     "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
     "warehouseId" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE CASCADE,
     "type" TEXT NOT NULL, "quantity" DECIMAL(18,3) NOT NULL, "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "refModule" TEXT, "refType" TEXT, "refId" TEXT, "note" TEXT, "createdById" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "stock_movements_tenantId_idx" ON "stock_movements"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "stock_movements_productId_idx" ON "stock_movements"("productId")`,
  `CREATE INDEX IF NOT EXISTS "stock_movements_warehouseId_idx" ON "stock_movements"("warehouseId")`,
  `CREATE TABLE IF NOT EXISTS "stock_levels" (
     "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
     "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
     "warehouseId" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE CASCADE,
     "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "stock_levels_productId_warehouseId_key" ON "stock_levels"("productId","warehouseId")`,
  `CREATE INDEX IF NOT EXISTS "stock_levels_tenantId_idx" ON "stock_levels"("tenantId")`,
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
        results.push({ sql: sql.replace(/\s+/g, ' ').slice(0, 60), ok: true });
      } catch (e) {
        results.push({ sql: sql.replace(/\s+/g, ' ').slice(0, 60), ok: false, error: (e as Error).message.slice(0, 200) });
      }
    }
    res.json({ ok: results.every((r) => r.ok), results });
  })
);

export default router;

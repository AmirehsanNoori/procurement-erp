import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requireAuth } from '../../middleware/requireAuth';
import { requireSuperAdmin } from '../../middleware/requirePermission';

/** TEMPORARY super-admin idempotent DDL bootstrap. Removed after use. */
const router = Router();

const STATEMENTS: string[] = [
  `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "source" TEXT`,
  `CREATE TABLE IF NOT EXISTS "goods_receipts" (
     "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
     "warehouseId" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE CASCADE,
     "refModule" TEXT, "refType" TEXT, "refId" TEXT, "requestRefId" TEXT, "note" TEXT, "receivedById" TEXT,
     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "goods_receipts_tenantId_idx" ON "goods_receipts"("tenantId")`,
  `CREATE INDEX IF NOT EXISTS "goods_receipts_refId_idx" ON "goods_receipts"("refId")`,
  `CREATE TABLE IF NOT EXISTS "goods_receipt_items" (
     "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL,
     "receiptId" TEXT NOT NULL REFERENCES "goods_receipts"("id") ON DELETE CASCADE,
     "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
     "quantity" DECIMAL(18,3) NOT NULL, "note" TEXT)`,
  `CREATE INDEX IF NOT EXISTS "goods_receipt_items_receiptId_idx" ON "goods_receipt_items"("receiptId")`,
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

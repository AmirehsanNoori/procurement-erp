import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requireAuth } from '../../middleware/requireAuth';
import { requireSuperAdmin } from '../../middleware/requirePermission';

/** TEMPORARY super-admin idempotent DDL bootstrap. Removed after use. */
const router = Router();

const STATEMENTS: string[] = [
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sentToWarehouseAt" TIMESTAMP(3)`,
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3)`,
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "sentToFinanceAt" TIMESTAMP(3)`,
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
        results.push({ sql: sql.slice(0, 70), ok: true });
      } catch (e) {
        results.push({ sql: sql.slice(0, 70), ok: false, error: (e as Error).message.slice(0, 200) });
      }
    }
    res.json({ ok: results.every((r) => r.ok), results });
  })
);

export default router;

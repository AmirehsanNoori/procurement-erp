import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { MIGRATION_STATEMENTS } from './migration-sql';

const router = Router();

// One-time migration endpoint — protected by SEED_SECRET header.
// Runs the bundled Prisma migration SQL cloud-side (Vercel → Supabase pooler).
// Call: POST /api/admin/migrate  with header  x-seed-secret: <SEED_SECRET>
router.post('/', async (req: Request, res: Response) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.headers['x-seed-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: { sql: string; error: string }[] = [];

  for (const { sql } of MIGRATION_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      applied.push(sql.slice(0, 60));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already exists|does not exist/i.test(message)) {
        skipped.push(sql.slice(0, 60));
      } else {
        errors.push({ sql: sql.slice(0, 120), error: message });
      }
    }
  }

  return res.json({
    ok: errors.length === 0,
    total: MIGRATION_STATEMENTS.length,
    applied: applied.length,
    skipped: skipped.length,
    errors,
  });
});

export default router;

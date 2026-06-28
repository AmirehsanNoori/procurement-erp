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

  // Drop empty tables left over from a previous app that conflict with the ERP schema.
  // (User confirmed these are empty and unneeded.)
  // GUARD: only do this when the ERP schema has NOT been created yet, so a re-run
  // after the ERP is live can never drop real data.
  const tenantsExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants') AS exists`
  );
  const erpAlreadySetUp = Array.isArray(tenantsExists) && tenantsExists[0]?.exists === true;

  if (!erpAlreadySetUp) {
    const conflicting = ['bookings', 'leads', 'newsletter_subscribers', 'session_types', 'payments', 'profiles'];
    for (const t of conflicting) {
      try {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`);
      } catch {
        /* ignore */
      }
    }
  }

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

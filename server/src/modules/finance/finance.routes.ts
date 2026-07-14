import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { IRANIAN_COA, levelOfCode, AccountType } from './coa-seed';
import { createInvoiceJournal } from './invoice-posting';

// Mounted at /api/:tenantId/finance behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });

const tid = (req: { tenant?: { tenantId: string } }) => req.tenant!.tenantId;
const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

// ── Chart of accounts ────────────────────────────────────────────────────────
const accountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES),
  parentId: z.string().optional().nullable(),
  isPostable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

router.get('/accounts', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const accounts = await prisma.finAccount.findMany({
    where: { tenantId: tid(req) },
    orderBy: { code: 'asc' },
  });
  res.json({ accounts });
}));

/** Seed the default Iranian chart of accounts. Idempotent: only runs when the
 *  tenant has no accounts yet. Safe to call from the UI ("بارگذاری کدینگ پیش‌فرض"). */
router.post('/accounts/seed-defaults', requirePermission('finance.create'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finAccount.count({ where: { tenantId } });
  if (existing > 0) throw ApiError.conflict('کدینگ حساب‌ها قبلاً وجود دارد؛ بارگذاری پیش‌فرض فقط برای سازمان بدون حساب ممکن است');
  const codeToId = new Map<string, string>();
  await prisma.$transaction(async (tx) => {
    for (const node of IRANIAN_COA) {
      const created = await tx.finAccount.create({
        data: {
          tenantId,
          code: node.code,
          name: node.name,
          type: node.type,
          parentId: node.parentCode ? codeToId.get(node.parentCode) ?? null : null,
          level: levelOfCode(node.code),
          isPostable: node.isPostable,
        },
      });
      codeToId.set(node.code, created.id);
    }
  });
  const accounts = await prisma.finAccount.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  res.status(201).json({ accounts, seeded: accounts.length });
}));

router.post('/accounts', requirePermission('finance.create'), validate(accountSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const body = req.body as z.infer<typeof accountSchema>;
  const code = body.code.trim();
  const dup = await prisma.finAccount.findFirst({ where: { tenantId, code } });
  if (dup) throw ApiError.conflict(`حساب با کد «${code}» قبلاً ثبت شده است`);
  let level = levelOfCode(code);
  if (body.parentId) {
    const parent = await prisma.finAccount.findFirst({ where: { tenantId, id: body.parentId } });
    if (!parent) throw ApiError.badRequest('حساب والد نامعتبر است');
    level = parent.level + 1;
  }
  const account = await prisma.finAccount.create({
    data: { tenantId, code, name: body.name.trim(), type: body.type, parentId: body.parentId ?? null, level, isPostable: body.isPostable ?? true, isActive: body.isActive ?? true },
  });
  res.status(201).json({ account });
}));

router.patch('/accounts/:id', requirePermission('finance.edit'), validate(accountSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finAccount.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('حساب یافت نشد');
  const body = req.body as Partial<z.infer<typeof accountSchema>>;
  // Guard: a postable account with journal lines cannot be made non-postable.
  if (body.isPostable === false) {
    const used = await prisma.finJournalLine.count({ where: { tenantId, accountId: existing.id } });
    if (used > 0) throw ApiError.badRequest('این حساب در اسناد استفاده شده و قابل تبدیل به غیرقابل‌ثبت نیست');
  }
  const account = await prisma.finAccount.update({
    where: { id: existing.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.isPostable !== undefined ? { isPostable: body.isPostable } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  res.json({ account });
}));

router.delete('/accounts/:id', requirePermission('finance.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finAccount.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('حساب یافت نشد');
  const used = await prisma.finJournalLine.count({ where: { tenantId, accountId: existing.id } });
  if (used > 0) throw ApiError.badRequest('این حساب در اسناد استفاده شده و قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید');
  const kids = await prisma.finAccount.count({ where: { tenantId, parentId: existing.id } });
  if (kids > 0) throw ApiError.badRequest('این حساب دارای زیرحساب است و قابل حذف نیست');
  await prisma.finAccount.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ── Fiscal years ───────────────────────────────────────────────────────────
const fiscalSchema = z.object({
  title: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(['open', 'closed']).optional(),
});

router.get('/fiscal-years', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const fiscalYears = await prisma.finFiscalYear.findMany({ where: { tenantId: tid(req) }, orderBy: { startDate: 'desc' } });
  res.json({ fiscalYears });
}));

router.post('/fiscal-years', requirePermission('finance.create'), validate(fiscalSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof fiscalSchema>;
  if (body.endDate <= body.startDate) throw ApiError.badRequest('تاریخ پایان باید بعد از تاریخ شروع باشد');
  const fiscalYear = await prisma.finFiscalYear.create({
    data: { tenantId: tid(req), title: body.title.trim(), startDate: body.startDate, endDate: body.endDate, status: body.status ?? 'open' },
  });
  res.status(201).json({ fiscalYear });
}));

router.patch('/fiscal-years/:id', requirePermission('finance.edit'), validate(fiscalSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finFiscalYear.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('سال مالی یافت نشد');
  const body = req.body as Partial<z.infer<typeof fiscalSchema>>;
  const fiscalYear = await prisma.finFiscalYear.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
  });
  res.json({ fiscalYear });
}));

// ── Journals (accounting documents) ──────────────────────────────────────────
const lineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.coerce.number().min(0).optional(),
  credit: z.coerce.number().min(0).optional(),
  description: z.string().optional().nullable(),
});
const journalSchema = z.object({
  date: z.coerce.date(),
  description: z.string().optional().nullable(),
  fiscalYearId: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(2),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Validate double-entry rules and resolve postable accounts. Throws ApiError. */
async function validateLines(tenantId: string, lines: z.infer<typeof lineSchema>[]) {
  const clean = lines.map((l, i) => {
    const debit = round2(l.debit ?? 0);
    const credit = round2(l.credit ?? 0);
    if (debit > 0 && credit > 0) throw ApiError.badRequest(`سطر ${i + 1}: هر سطر فقط بدهکار یا بستانکار می‌تواند باشد`);
    if (debit === 0 && credit === 0) throw ApiError.badRequest(`سطر ${i + 1}: مبلغ بدهکار یا بستانکار الزامی است`);
    return { accountId: l.accountId, debit, credit, description: l.description ?? null, sortOrder: i };
  });
  const totalDebit = round2(clean.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(clean.reduce((s, l) => s + l.credit, 0));
  if (totalDebit !== totalCredit) throw ApiError.badRequest(`سند تراز نیست: بدهکار ${totalDebit} ≠ بستانکار ${totalCredit}`);
  // Every account must exist, belong to the tenant, be active and postable.
  const ids = [...new Set(clean.map((l) => l.accountId))];
  const accounts = await prisma.finAccount.findMany({ where: { tenantId, id: { in: ids } } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const l of clean) {
    const acc = byId.get(l.accountId);
    if (!acc) throw ApiError.badRequest('یکی از حساب‌های انتخاب‌شده نامعتبر است');
    if (!acc.isActive) throw ApiError.badRequest(`حساب «${acc.name}» غیرفعال است`);
    if (!acc.isPostable) throw ApiError.badRequest(`حساب «${acc.name}» قابل ثبت سند نیست (فقط حساب‌های معین)`);
  }
  return { clean, totalDebit };
}

async function nextJournalNumber(tenantId: string): Promise<number> {
  const last = await prisma.finJournal.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

const journalInclude = { lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { sortOrder: 'asc' as const } } };

router.get('/journals', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const where: Prisma.FinJournalWhereInput = {
    tenantId: tid(req),
    ...(status && ['draft', 'posted', 'void'].includes(status) ? { status } : {}),
  };
  const journals = await prisma.finJournal.findMany({ where, include: journalInclude, orderBy: { number: 'desc' }, take: 300 });
  res.json({ journals: await attachInvoiceNumbers(tid(req), journals) });
}));

/** Attach the linked invoice number to invoice-sourced journals (soft ref). */
async function attachInvoiceNumbers<T extends { refType: string | null; refId: string | null }>(tenantId: string, journals: T[]) {
  const invIds = [...new Set(journals.filter((j) => j.refType === 'invoice' && j.refId).map((j) => j.refId as string))];
  if (invIds.length === 0) return journals.map((j) => ({ ...j, invoiceNumber: null as string | null }));
  const invoices = await prisma.invoice.findMany({ where: { tenantId, id: { in: invIds } }, select: { id: true, invoiceNumber: true } });
  const map = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
  return journals.map((j) => ({ ...j, invoiceNumber: j.refType === 'invoice' && j.refId ? map.get(j.refId) ?? null : null }));
}

router.get('/journals/:id', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const journal = await prisma.finJournal.findFirst({ where: { tenantId: tid(req), id: req.params.id }, include: journalInclude });
  if (!journal) throw ApiError.notFound('سند یافت نشد');
  res.json({ journal });
}));

/** Generate a draft voucher from a procurement invoice (manual trigger / retry).
 *  Used when the auto-posting at send-to-finance was skipped (e.g. chart of
 *  accounts not ready). Idempotent — returns the existing voucher if present. */
const fromInvoiceSchema = z.object({
  inventoryCode: z.string().optional(),
  inputVatCode: z.string().optional(),
  payableCode: z.string().optional(),
}).optional();
router.post('/journals/from-invoice/:invoiceId', requirePermission('finance.create'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const invoice = await prisma.invoice.findFirst({ where: { tenantId, id: req.params.invoiceId }, include: { supplier: true } });
  if (!invoice) throw ApiError.notFound('فاکتور یافت نشد');
  const overrides = fromInvoiceSchema.parse(req.body ?? {});
  const posting = await createInvoiceJournal(tenantId, invoice, req.auth!.userId, overrides);
  if (posting.status === 'skipped') throw ApiError.badRequest(posting.reason ?? 'ایجاد سند ممکن نشد');
  const journal = posting.journalId ? await prisma.finJournal.findUnique({ where: { id: posting.journalId }, include: journalInclude }) : null;
  res.status(posting.status === 'created' ? 201 : 200).json({ posting, journal });
}));

router.post('/journals', requirePermission('finance.create'), validate(journalSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const body = req.body as z.infer<typeof journalSchema>;
  const { clean } = await validateLines(tenantId, body.lines);
  const number = await nextJournalNumber(tenantId);
  const journal = await prisma.finJournal.create({
    data: {
      tenantId, number, date: body.date, description: body.description ?? null,
      fiscalYearId: body.fiscalYearId ?? null, status: 'draft', createdById: req.auth!.userId,
      lines: { create: clean.map((l) => ({ tenantId, accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, sortOrder: l.sortOrder })) },
    },
    include: journalInclude,
  });
  res.status(201).json({ journal });
}));

router.patch('/journals/:id', requirePermission('finance.edit'), validate(journalSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finJournal.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('سند یافت نشد');
  if (existing.status !== 'draft') throw ApiError.badRequest('فقط اسناد پیش‌نویس قابل ویرایش هستند؛ برای اصلاح سند قطعی از ابطال یا سند معکوس استفاده کنید');
  const body = req.body as Partial<z.infer<typeof journalSchema>>;
  const journal = await prisma.$transaction(async (tx) => {
    if (body.lines) {
      const { clean } = await validateLines(tenantId, body.lines);
      await tx.finJournalLine.deleteMany({ where: { journalId: existing.id } });
      await tx.finJournalLine.createMany({ data: clean.map((l) => ({ tenantId, journalId: existing.id, accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, sortOrder: l.sortOrder })) });
    }
    return tx.finJournal.update({
      where: { id: existing.id },
      data: {
        ...(body.date !== undefined ? { date: body.date } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.fiscalYearId !== undefined ? { fiscalYearId: body.fiscalYearId } : {}),
      },
      include: journalInclude,
    });
  });
  res.json({ journal });
}));

/** Post a draft: makes it immutable and effective in the ledger. */
router.post('/journals/:id/post', requirePermission('finance.post'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finJournal.findFirst({ where: { tenantId, id: req.params.id }, include: { lines: true } });
  if (!existing) throw ApiError.notFound('سند یافت نشد');
  if (existing.status === 'posted') throw ApiError.badRequest('سند قبلاً قطعی شده است');
  if (existing.status === 'void') throw ApiError.badRequest('سند باطل‌شده قابل قطعی‌سازی نیست');
  // Re-validate balance at post time (defence in depth).
  await validateLines(tenantId, existing.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit), description: l.description })));
  const journal = await prisma.finJournal.update({ where: { id: existing.id }, data: { status: 'posted', postedAt: new Date() }, include: journalInclude });
  res.json({ journal });
}));

/** Void a posted document (soft): keeps the record, marks it void. */
router.post('/journals/:id/void', requirePermission('finance.void'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finJournal.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('سند یافت نشد');
  if (existing.status === 'void') throw ApiError.badRequest('سند قبلاً باطل شده است');
  const journal = await prisma.finJournal.update({ where: { id: existing.id }, data: { status: 'void' }, include: journalInclude });
  res.json({ journal });
}));

/** Create a reversing entry (draft) that mirrors a posted document. */
router.post('/journals/:id/reverse', requirePermission('finance.create'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const src = await prisma.finJournal.findFirst({ where: { tenantId, id: req.params.id }, include: { lines: true } });
  if (!src) throw ApiError.notFound('سند یافت نشد');
  if (src.status !== 'posted') throw ApiError.badRequest('فقط اسناد قطعی قابل معکوس‌سازی هستند');
  const number = await nextJournalNumber(tenantId);
  const journal = await prisma.finJournal.create({
    data: {
      tenantId, number, date: new Date(), status: 'draft', reversalOfId: src.id, createdById: req.auth!.userId,
      description: `برگشت سند شماره ${src.number}${src.description ? ` — ${src.description}` : ''}`,
      fiscalYearId: src.fiscalYearId,
      lines: { create: src.lines.map((l, i) => ({ tenantId, accountId: l.accountId, debit: l.credit, credit: l.debit, description: l.description, sortOrder: i })) },
    },
    include: journalInclude,
  });
  res.status(201).json({ journal });
}));

// ── Reports ────────────────────────────────────────────────────────────────

/** General ledger for one account: opening balance + movements, running balance. */
router.get('/ledger/:accountId', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const account = await prisma.finAccount.findFirst({ where: { tenantId, id: req.params.accountId } });
  if (!account) throw ApiError.notFound('حساب یافت نشد');
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to = req.query.to ? new Date(req.query.to as string) : null;

  // Opening balance = sum of posted lines strictly before `from`.
  let opening = 0;
  if (from) {
    const prior = await prisma.finJournalLine.findMany({
      where: { tenantId, accountId: account.id, journal: { status: 'posted', date: { lt: from } } },
      select: { debit: true, credit: true },
    });
    opening = prior.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
  }
  const lines = await prisma.finJournalLine.findMany({
    where: {
      tenantId, accountId: account.id,
      journal: { status: 'posted', ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    },
    include: { journal: { select: { number: true, date: true, description: true } } },
    orderBy: [{ journal: { date: 'asc' } }, { journal: { number: 'asc' } }],
  });
  let running = round2(opening);
  const rows = lines.map((l) => {
    running = round2(running + Number(l.debit) - Number(l.credit));
    return { journalNumber: l.journal.number, date: l.journal.date, description: l.description ?? l.journal.description, debit: Number(l.debit), credit: Number(l.credit), balance: running };
  });
  res.json({ account, opening: round2(opening), rows, closing: running });
}));

/** Trial balance: per-account debit/credit totals over posted documents. */
router.get('/trial-balance', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to = req.query.to ? new Date(req.query.to as string) : null;
  const grouped = await prisma.finJournalLine.groupBy({
    by: ['accountId'],
    where: { tenantId, journal: { status: 'posted', ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) } },
    _sum: { debit: true, credit: true },
  });
  const accounts = await prisma.finAccount.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  const sums = new Map(grouped.map((g) => [g.accountId, g]));
  const rows = accounts
    .filter((a) => sums.has(a.id))
    .map((a) => {
      const g = sums.get(a.id)!;
      const debit = round2(Number(g._sum.debit ?? 0));
      const credit = round2(Number(g._sum.credit ?? 0));
      const net = round2(debit - credit);
      return { accountId: a.id, code: a.code, name: a.name, type: a.type as AccountType, debit, credit, balanceDebit: net > 0 ? net : 0, balanceCredit: net < 0 ? -net : 0 };
    });
  const totals = rows.reduce((t, r) => ({ debit: round2(t.debit + r.debit), credit: round2(t.credit + r.credit) }), { debit: 0, credit: 0 });
  res.json({ rows, totals });
}));

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { IRANIAN_COA, levelOfCode, AccountType } from './coa-seed';
import { createInvoiceJournal } from './invoice-posting';
import { createPaymentJournal } from './payment-posting';

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

// ── Cost centres (analytical dimension, F6) ──────────────────────────────────
const costCenterSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});

router.get('/cost-centers', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const costCenters = await prisma.finCostCenter.findMany({ where: { tenantId: tid(req) }, orderBy: { code: 'asc' } });
  res.json({ costCenters });
}));

router.post('/cost-centers', requirePermission('finance.create'), validate(costCenterSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const body = req.body as z.infer<typeof costCenterSchema>;
  const code = body.code.trim();
  const dup = await prisma.finCostCenter.findFirst({ where: { tenantId, code } });
  if (dup) throw ApiError.conflict(`مرکز هزینه با کد «${code}» قبلاً ثبت شده است`);
  const costCenter = await prisma.finCostCenter.create({ data: { tenantId, code, name: body.name.trim(), isActive: body.isActive ?? true } });
  res.status(201).json({ costCenter });
}));

router.patch('/cost-centers/:id', requirePermission('finance.edit'), validate(costCenterSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finCostCenter.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('مرکز هزینه یافت نشد');
  const body = req.body as Partial<z.infer<typeof costCenterSchema>>;
  const costCenter = await prisma.finCostCenter.update({
    where: { id: existing.id },
    data: { ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) },
  });
  res.json({ costCenter });
}));

router.delete('/cost-centers/:id', requirePermission('finance.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finCostCenter.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('مرکز هزینه یافت نشد');
  const used = await prisma.finJournalLine.count({ where: { tenantId, costCenterId: existing.id } });
  if (used > 0) throw ApiError.badRequest('این مرکز هزینه در اسناد استفاده شده و قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید');
  await prisma.finCostCenter.delete({ where: { id: existing.id } });
  res.json({ ok: true });
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
  costCenterId: z.string().optional().nullable(),
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
    return { accountId: l.accountId, debit, credit, description: l.description ?? null, costCenterId: l.costCenterId ?? null, sortOrder: i };
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
  // Validate optional cost centres belong to the tenant.
  const ccIds = [...new Set(clean.map((l) => l.costCenterId).filter(Boolean) as string[])];
  if (ccIds.length) {
    const found = await prisma.finCostCenter.count({ where: { tenantId, id: { in: ccIds } } });
    if (found !== ccIds.length) throw ApiError.badRequest('یکی از مراکز هزینهٔ انتخاب‌شده نامعتبر است');
  }
  return { clean, totalDebit };
}

async function nextJournalNumber(tenantId: string): Promise<number> {
  const last = await prisma.finJournal.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

const journalInclude = { lines: { include: { account: { select: { code: true, name: true } }, costCenter: { select: { code: true, name: true } } }, orderBy: { sortOrder: 'asc' as const } } };

router.get('/journals', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const where: Prisma.FinJournalWhereInput = {
    tenantId: tid(req),
    ...(status && ['draft', 'posted', 'void'].includes(status) ? { status } : {}),
  };
  const journals = await prisma.finJournal.findMany({ where, include: journalInclude, orderBy: { number: 'desc' }, take: 300 });
  res.json({ journals: await attachInvoiceNumbers(tid(req), journals) });
}));

/** Attach the linked invoice number to invoice/payment-sourced journals (soft ref). */
async function attachInvoiceNumbers<T extends { refType: string | null; refId: string | null }>(tenantId: string, journals: T[]) {
  const invIds = journals.filter((j) => j.refType === 'invoice' && j.refId).map((j) => j.refId as string);
  const payIds = journals.filter((j) => j.refType === 'payment' && j.refId).map((j) => j.refId as string);
  if (invIds.length === 0 && payIds.length === 0) return journals.map((j) => ({ ...j, invoiceNumber: null as string | null }));
  const [invoices, payments] = await Promise.all([
    invIds.length ? prisma.invoice.findMany({ where: { tenantId, id: { in: [...new Set(invIds)] } }, select: { id: true, invoiceNumber: true } }) : Promise.resolve([]),
    payIds.length ? prisma.payment.findMany({ where: { tenantId, id: { in: [...new Set(payIds)] } }, select: { id: true, invoice: { select: { invoiceNumber: true } } } }) : Promise.resolve([]),
  ]);
  const invMap = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
  const payMap = new Map(payments.map((p) => [p.id, p.invoice?.invoiceNumber ?? null]));
  return journals.map((j) => ({
    ...j,
    invoiceNumber: j.refType === 'invoice' && j.refId ? invMap.get(j.refId) ?? null
      : j.refType === 'payment' && j.refId ? payMap.get(j.refId) ?? null : null,
  }));
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

/** Generate a draft payment voucher from a payment (manual trigger / retry). */
const fromPaymentSchema = z.object({ payableCode: z.string().optional(), cashCode: z.string().optional() }).optional();
router.post('/journals/from-payment/:paymentId', requirePermission('finance.create'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const payment = await prisma.payment.findFirst({ where: { tenantId, id: req.params.paymentId }, include: { invoice: { include: { supplier: true } } } });
  if (!payment) throw ApiError.notFound('پرداخت یافت نشد');
  const overrides = fromPaymentSchema.parse(req.body ?? {});
  const posting = await createPaymentJournal(tenantId, { id: payment.id, amount: payment.amount, paymentDate: payment.paymentDate, invoiceNumber: payment.invoice?.invoiceNumber ?? null, supplierName: payment.invoice?.supplier?.name ?? null }, req.auth!.userId, overrides);
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
      lines: { create: clean.map((l) => ({ tenantId, accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, costCenterId: l.costCenterId, sortOrder: l.sortOrder })) },
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
      await tx.finJournalLine.createMany({ data: clean.map((l) => ({ tenantId, journalId: existing.id, accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, costCenterId: l.costCenterId, sortOrder: l.sortOrder })) });
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

/** Delete a draft journal. Only drafts can be deleted; posted/void are kept for
 *  the audit trail (correct a posted doc via void or a reversing entry). */
router.delete('/journals/:id', requirePermission('finance.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finJournal.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('سند یافت نشد');
  if (existing.status !== 'draft') throw ApiError.badRequest('فقط اسناد پیش‌نویس قابل حذف هستند؛ سند قطعی را باطل کنید');
  await prisma.finJournal.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

/** Post a draft: makes it immutable and effective in the ledger. */
router.post('/journals/:id/post', requirePermission('finance.post'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finJournal.findFirst({ where: { tenantId, id: req.params.id }, include: { lines: true } });
  if (!existing) throw ApiError.notFound('سند یافت نشد');
  if (existing.status === 'posted') throw ApiError.badRequest('سند قبلاً قطعی شده است');
  if (existing.status === 'void') throw ApiError.badRequest('سند باطل‌شده قابل قطعی‌سازی نیست');
  // Cannot post into a closed fiscal year.
  const closed = await prisma.finFiscalYear.findFirst({ where: { tenantId, status: 'closed', startDate: { lte: existing.date }, endDate: { gte: existing.date } } });
  if (closed) throw ApiError.badRequest(`سال مالی «${closed.title}» بسته شده و امکان ثبت سند در این بازه وجود ندارد`);
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

// ── Accounts Payable subledger (AP) ──────────────────────────────────────────
/** Per-supplier payable position derived from procurement invoices vs payments
 *  (soft cross-module read). Gives Finance an AP aging/statement view without
 *  putting supplier identity on the GL. */
router.get('/payables', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { tenantId }, select: { id: true, supplierId: true, totalAmount: true, dueDate: true, supplier: { select: { name: true } } } }),
    prisma.payment.findMany({ where: { tenantId }, select: { amount: true, invoice: { select: { supplierId: true } } } }),
  ]);
  type Row = { supplierId: string; supplierName: string; invoiced: number; paid: number; outstanding: number; invoiceCount: number; overdue: number };
  const bySupplier = new Map<string, Row>();
  const now = new Date();
  const keyOf = (sid: string | null) => sid ?? '—';
  for (const inv of invoices) {
    const k = keyOf(inv.supplierId);
    const r = bySupplier.get(k) ?? { supplierId: k, supplierName: inv.supplier?.name ?? 'بدون تأمین‌کننده', invoiced: 0, paid: 0, outstanding: 0, invoiceCount: 0, overdue: 0 };
    r.invoiced += Number(inv.totalAmount);
    r.invoiceCount += 1;
    bySupplier.set(k, r);
  }
  for (const p of payments) {
    const k = keyOf(p.invoice?.supplierId ?? null);
    const r = bySupplier.get(k);
    if (r) r.paid += Number(p.amount);
  }
  // Overdue outstanding: unpaid portion on invoices past due (approximate at supplier level).
  const paidBySupplier = new Map<string, number>();
  for (const [k, r] of bySupplier) paidBySupplier.set(k, r.paid);
  for (const inv of invoices) {
    if (inv.dueDate && inv.dueDate < now) {
      const k = keyOf(inv.supplierId);
      const r = bySupplier.get(k);
      if (r) {
        // consume remaining paid credit against this overdue invoice
        const remainingPaid = paidBySupplier.get(k) ?? 0;
        const total = Number(inv.totalAmount);
        const applied = Math.min(remainingPaid, total);
        paidBySupplier.set(k, remainingPaid - applied);
        r.overdue += Math.max(0, total - applied);
      }
    }
  }
  const rows = [...bySupplier.values()].map((r) => ({ ...r, outstanding: Math.max(0, r.invoiced - r.paid) })).filter((r) => r.invoiced > 0).sort((a, b) => b.outstanding - a.outstanding);
  const totals = rows.reduce((t, r) => ({ invoiced: t.invoiced + r.invoiced, paid: t.paid + r.paid, outstanding: t.outstanding + r.outstanding }), { invoiced: 0, paid: 0, outstanding: 0 });
  res.json({ rows, totals });
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

// ── Financial statements (F4) ────────────────────────────────────────────────
/** Sum debit/credit per account over posted journals (optional date window). */
async function postedSums(tenantId: string, from: Date | null, to: Date | null) {
  const grouped = await prisma.finJournalLine.groupBy({
    by: ['accountId'],
    where: { tenantId, journal: { status: 'posted', ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) } },
    _sum: { debit: true, credit: true },
  });
  return new Map(grouped.map((g) => [g.accountId, { debit: Number(g._sum.debit ?? 0), credit: Number(g._sum.credit ?? 0) }]));
}

/** Income statement (سود و زیان) for a period: revenue − expenses = net income. */
router.get('/income-statement', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to = req.query.to ? new Date(req.query.to as string) : null;
  const sums = await postedSums(tenantId, from, to);
  const accounts = await prisma.finAccount.findMany({ where: { tenantId, type: { in: ['income', 'expense'] } }, orderBy: { code: 'asc' } });
  const income: { code: string; name: string; amount: number }[] = [];
  const expense: { code: string; name: string; amount: number }[] = [];
  for (const a of accounts) {
    const s = sums.get(a.id);
    if (!s) continue;
    if (a.type === 'income') { const bal = round2(s.credit - s.debit); if (bal !== 0) income.push({ code: a.code, name: a.name, amount: bal }); }
    else { const bal = round2(s.debit - s.credit); if (bal !== 0) expense.push({ code: a.code, name: a.name, amount: bal }); }
  }
  const totalIncome = round2(income.reduce((s, r) => s + r.amount, 0));
  const totalExpense = round2(expense.reduce((s, r) => s + r.amount, 0));
  res.json({ income, expense, totalIncome, totalExpense, netIncome: round2(totalIncome - totalExpense) });
}));

/** Balance sheet (ترازنامه) as of a date: assets = liabilities + equity. */
router.get('/balance-sheet', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const asOf = req.query.asOf ? new Date(req.query.asOf as string) : null;
  const sums = await postedSums(tenantId, null, asOf);
  const accounts = await prisma.finAccount.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  const assets: { code: string; name: string; amount: number }[] = [];
  const liabilities: { code: string; name: string; amount: number }[] = [];
  const equity: { code: string; name: string; amount: number }[] = [];
  let incomeTotal = 0, expenseTotal = 0;
  for (const a of accounts) {
    const s = sums.get(a.id);
    if (!s) continue;
    if (a.type === 'asset') { const bal = round2(s.debit - s.credit); if (bal !== 0) assets.push({ code: a.code, name: a.name, amount: bal }); }
    else if (a.type === 'liability') { const bal = round2(s.credit - s.debit); if (bal !== 0) liabilities.push({ code: a.code, name: a.name, amount: bal }); }
    else if (a.type === 'equity') { const bal = round2(s.credit - s.debit); if (bal !== 0) equity.push({ code: a.code, name: a.name, amount: bal }); }
    else if (a.type === 'income') incomeTotal += s.credit - s.debit;
    else if (a.type === 'expense') expenseTotal += s.debit - s.credit;
  }
  // Un-closed current-period net income folds into equity (retained earnings).
  const retainedEarnings = round2(incomeTotal - expenseTotal);
  const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0));
  const totalEquity = round2(equity.reduce((s, r) => s + r.amount, 0) + retainedEarnings);
  res.json({ assets, liabilities, equity, retainedEarnings, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 });
}));

/** Cash position (نقدینگی): balance of each cash/bank account (codes under 1001). */
router.get('/cash-position', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const sums = await postedSums(tenantId, null, null);
  const accounts = await prisma.finAccount.findMany({ where: { tenantId, isPostable: true, code: { startsWith: '1001' } }, orderBy: { code: 'asc' } });
  const rows = accounts.map((a) => { const s = sums.get(a.id) ?? { debit: 0, credit: 0 }; return { code: a.code, name: a.name, balance: round2(s.debit - s.credit) }; });
  res.json({ rows, total: round2(rows.reduce((s, r) => s + r.balance, 0)) });
}));

/** Close a fiscal year: post a closing entry that zeroes income/expense accounts
 *  into retained earnings, then mark the year closed. */
router.post('/fiscal-years/:id/close', requirePermission('finance.post'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const fy = await prisma.finFiscalYear.findFirst({ where: { tenantId, id: req.params.id } });
  if (!fy) throw ApiError.notFound('سال مالی یافت نشد');
  if (fy.status !== 'open') throw ApiError.badRequest('این سال مالی باز نیست');
  const retained = await prisma.finAccount.findFirst({ where: { tenantId, code: '300201', isActive: true, isPostable: true } });
  if (!retained) throw ApiError.badRequest('حساب «سود (زیان) انباشته» با کد ۳۰۰۲۰۱ در کدینگ یافت نشد');
  const sums = await postedSums(tenantId, fy.startDate, fy.endDate);
  const accounts = await prisma.finAccount.findMany({ where: { tenantId, type: { in: ['income', 'expense'] } }, orderBy: { code: 'asc' } });
  const lines: { accountId: string; debit: number; credit: number; description: string; sortOrder: number }[] = [];
  let sort = 0, incomeTotal = 0, expenseTotal = 0;
  for (const a of accounts) {
    const s = sums.get(a.id);
    if (!s) continue;
    if (a.type === 'income') {
      const bal = round2(s.credit - s.debit); // credit-normal
      if (bal > 0) { lines.push({ accountId: a.id, debit: bal, credit: 0, description: 'بستن حساب درآمد', sortOrder: sort++ }); incomeTotal += bal; }
      else if (bal < 0) { lines.push({ accountId: a.id, debit: 0, credit: -bal, description: 'بستن حساب درآمد', sortOrder: sort++ }); incomeTotal += bal; }
    } else {
      const bal = round2(s.debit - s.credit); // debit-normal
      if (bal > 0) { lines.push({ accountId: a.id, debit: 0, credit: bal, description: 'بستن حساب هزینه', sortOrder: sort++ }); expenseTotal += bal; }
      else if (bal < 0) { lines.push({ accountId: a.id, debit: -bal, credit: 0, description: 'بستن حساب هزینه', sortOrder: sort++ }); expenseTotal += bal; }
    }
  }
  if (lines.length === 0) throw ApiError.badRequest('گردشی برای بستن در این سال مالی وجود ندارد');
  const net = round2(incomeTotal - expenseTotal);
  if (net > 0) lines.push({ accountId: retained.id, debit: 0, credit: net, description: 'انتقال سود دوره به انباشته', sortOrder: sort++ });
  else if (net < 0) lines.push({ accountId: retained.id, debit: -net, credit: 0, description: 'انتقال زیان دوره به انباشته', sortOrder: sort++ });
  const number = await nextJournalNumber(tenantId);
  const journal = await prisma.$transaction(async (tx) => {
    const j = await tx.finJournal.create({
      data: {
        tenantId, number, date: fy.endDate, status: 'posted', postedAt: new Date(),
        description: `سند اختتامیه ${fy.title}`, fiscalYearId: fy.id,
        refModule: 'finance', refType: 'fiscal_close', refId: fy.id, createdById: req.auth!.userId,
        lines: { create: lines.map((l) => ({ tenantId, accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, sortOrder: l.sortOrder })) },
      },
      include: journalInclude,
    });
    await tx.finFiscalYear.update({ where: { id: fy.id }, data: { status: 'closed' } });
    return j;
  });
  res.status(201).json({ journal, netIncome: net });
}));

/** Reopen a closed fiscal year: void its closing entry and set status back to
 *  open (for corrections). The closing entry stays as a void record. */
router.post('/fiscal-years/:id/reopen', requirePermission('finance.post'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const fy = await prisma.finFiscalYear.findFirst({ where: { tenantId, id: req.params.id } });
  if (!fy) throw ApiError.notFound('سال مالی یافت نشد');
  if (fy.status !== 'closed') throw ApiError.badRequest('این سال مالی بسته نیست');
  await prisma.$transaction(async (tx) => {
    await tx.finJournal.updateMany({ where: { tenantId, refModule: 'finance', refType: 'fiscal_close', refId: fy.id, status: 'posted' }, data: { status: 'void' } });
    await tx.finFiscalYear.update({ where: { id: fy.id }, data: { status: 'open' } });
  });
  const fiscalYear = await prisma.finFiscalYear.findUnique({ where: { id: fy.id } });
  res.json({ fiscalYear });
}));

// ── Budgeting: budget vs actual (F5) ─────────────────────────────────────────
const budgetSchema = z.object({
  accountId: z.string().min(1),
  fiscalYearId: z.string().min(1),
  amount: z.coerce.number().min(0),
  note: z.string().optional().nullable(),
});

router.get('/budgets', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const fiscalYearId = req.query.fiscalYearId as string | undefined;
  const budgets = await prisma.finBudget.findMany({
    where: { tenantId, ...(fiscalYearId ? { fiscalYearId } : {}) },
    include: { account: { select: { code: true, name: true, type: true } } },
    orderBy: { account: { code: 'asc' } },
  });
  res.json({ budgets });
}));

/** Upsert a budget line for an account within a fiscal year. */
router.post('/budgets', requirePermission('finance.create'), validate(budgetSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const body = req.body as z.infer<typeof budgetSchema>;
  const account = await prisma.finAccount.findFirst({ where: { tenantId, id: body.accountId } });
  if (!account) throw ApiError.badRequest('حساب نامعتبر است');
  if (!account.isPostable) throw ApiError.badRequest('بودجه فقط برای حساب‌های معین قابل تعریف است');
  const fy = await prisma.finFiscalYear.findFirst({ where: { tenantId, id: body.fiscalYearId } });
  if (!fy) throw ApiError.badRequest('سال مالی نامعتبر است');
  const budget = await prisma.finBudget.upsert({
    where: { tenantId_accountId_fiscalYearId: { tenantId, accountId: body.accountId, fiscalYearId: body.fiscalYearId } },
    create: { tenantId, accountId: body.accountId, fiscalYearId: body.fiscalYearId, amount: body.amount, note: body.note ?? null },
    update: { amount: body.amount, note: body.note ?? null },
    include: { account: { select: { code: true, name: true, type: true } } },
  });
  res.status(201).json({ budget });
}));

router.delete('/budgets/:id', requirePermission('finance.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.finBudget.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('بودجه یافت نشد');
  await prisma.finBudget.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

/** Budget vs actual for a fiscal year: budgeted amount vs posted actuals,
 *  with variance and utilisation per account. */
router.get('/budget-vs-actual', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const fiscalYearId = req.query.fiscalYearId as string | undefined;
  if (!fiscalYearId) throw ApiError.badRequest('سال مالی الزامی است');
  const fy = await prisma.finFiscalYear.findFirst({ where: { tenantId, id: fiscalYearId } });
  if (!fy) throw ApiError.notFound('سال مالی یافت نشد');
  const [budgets, sums] = await Promise.all([
    prisma.finBudget.findMany({ where: { tenantId, fiscalYearId }, include: { account: { select: { code: true, name: true, type: true } } }, orderBy: { account: { code: 'asc' } } }),
    postedSums(tenantId, fy.startDate, fy.endDate),
  ]);
  const rows = budgets.map((b) => {
    const s = sums.get(b.accountId) ?? { debit: 0, credit: 0 };
    // Actual in the account's natural direction (expense/asset debit-normal, income/liability credit-normal).
    const actual = b.account.type === 'income' || b.account.type === 'liability' || b.account.type === 'equity'
      ? round2(s.credit - s.debit)
      : round2(s.debit - s.credit);
    const budget = round2(Number(b.amount));
    const variance = round2(budget - actual);
    const usedPct = budget > 0 ? Math.round((actual / budget) * 100) : (actual > 0 ? 100 : 0);
    return { id: b.id, accountId: b.accountId, code: b.account.code, name: b.account.name, type: b.account.type as AccountType, budget, actual, variance, usedPct };
  });
  const totals = rows.reduce((t, r) => ({ budget: round2(t.budget + r.budget), actual: round2(t.actual + r.actual), variance: round2(t.variance + r.variance) }), { budget: 0, actual: 0, variance: 0 });
  res.json({ fiscalYear: fy, rows, totals });
}));

/** Cost-centre report: income/expense grouped by cost centre over a period,
 *  from posted journal lines (unassigned lines bucket under «بدون مرکز هزینه»). */
router.get('/cost-center-report', requirePermission('finance.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to = req.query.to ? new Date(req.query.to as string) : null;
  const grouped = await prisma.finJournalLine.groupBy({
    by: ['costCenterId', 'accountId'],
    where: { tenantId, journal: { status: 'posted', ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) } },
    _sum: { debit: true, credit: true },
  });
  const [accounts, centers] = await Promise.all([
    prisma.finAccount.findMany({ where: { tenantId, type: { in: ['income', 'expense'] } }, select: { id: true, type: true } }),
    prisma.finCostCenter.findMany({ where: { tenantId }, select: { id: true, code: true, name: true } }),
  ]);
  const accType = new Map(accounts.map((a) => [a.id, a.type]));
  const centerInfo = new Map(centers.map((c) => [c.id, c]));
  type Row = { costCenterId: string; code: string; name: string; income: number; expense: number; net: number };
  const byCenter = new Map<string, Row>();
  for (const g of grouped) {
    const type = accType.get(g.accountId);
    if (!type) continue; // only income/expense flow through cost-centre P&L
    const key = g.costCenterId ?? '—';
    const info = g.costCenterId ? centerInfo.get(g.costCenterId) : undefined;
    const r = byCenter.get(key) ?? { costCenterId: key, code: info?.code ?? '—', name: info?.name ?? 'بدون مرکز هزینه', income: 0, expense: 0, net: 0 };
    const debit = Number(g._sum.debit ?? 0), credit = Number(g._sum.credit ?? 0);
    if (type === 'income') r.income += credit - debit;
    else r.expense += debit - credit;
    byCenter.set(key, r);
  }
  const rows = [...byCenter.values()].map((r) => ({ ...r, income: round2(r.income), expense: round2(r.expense), net: round2(r.income - r.expense) })).sort((a, b) => b.expense - a.expense);
  const totals = rows.reduce((t, r) => ({ income: round2(t.income + r.income), expense: round2(t.expense + r.expense), net: round2(t.net + r.net) }), { income: 0, expense: 0, net: 0 });
  res.json({ rows, totals });
}));

export default router;

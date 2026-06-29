import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { loadFinance, num, requiredBudget } from '../finance/calc';
import { dateToJalali, jalaliMonthName } from '../../lib/jalali';

const router = Router({ mergeParams: true });

// GET /api/:tenantId/budgets/payment-plan — payable amounts grouped by Jalali month
// (invoices + quotation advances), mirroring the prototype's monthly payment plan.
function jalaliMonthKey(d: Date): string {
  const [jy, jm] = dateToJalali(d);
  return `${jy}-${String(jm).padStart(2, '0')}`;
}

const allocationSchema = z.object({
  yearJalali: z.coerce.number().int(),
  monthJalali: z.coerce.number().int().min(1).max(12),
  percentage: z.coerce.number().min(0).max(100),
  amount: z.coerce.number().min(0).optional(),
});

const schema = z.object({
  name: z.string().optional().nullable(),
  yearJalali: z.coerce.number().int(),
  monthJalali: z.coerce.number().int().min(1).max(12),
  estimatedCost: z.coerce.number().min(0),
  contingencyPercent: z.coerce.number().min(0).default(0),
  approvedBudget: z.coerce.number().min(0).optional(),
  manualActual: z.coerce.number().optional().nullable(),
  varianceReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  allocations: z.array(allocationSchema).optional(),
});

function computeFields(body: z.infer<typeof schema>) {
  const required = Math.ceil(body.estimatedCost * (1 + body.contingencyPercent / 100));
  const approved = body.approvedBudget && body.approvedBudget > 0 ? body.approvedBudget : required;
  return { required, approved };
}

// GET /api/:tenantId/budgets — list with computed summary per budget
router.get(
  '/',
  requirePermission('monthly_budget.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const fin = await loadFinance(prisma, tenantId);
    const allocations = await prisma.budgetAllocation.findMany({ where: { tenantId } });
    const budgets = [...fin.budgets]
      .sort((a, b) => a.yearJalali * 100 + a.monthJalali - (b.yearJalali * 100 + b.monthJalali))
      .map((b) => ({
        ...b,
        allocations: allocations.filter((a) => a.budgetId === b.id),
        summary: fin.budgetSummary(b),
      }));

    const totals = budgets.reduce(
      (acc, b) => {
        acc.estimated += b.summary.estimated;
        acc.required += b.summary.required;
        acc.approved += b.summary.approved;
        acc.reserved += b.summary.reserved;
        acc.actual += b.summary.actual;
        acc.remaining += b.summary.remaining;
        return acc;
      },
      { estimated: 0, required: 0, approved: 0, reserved: 0, actual: 0, remaining: 0 }
    );

    res.json({ budgets, totals });
  })
);

// GET /api/:tenantId/budgets/unbudgeted — invoices with no budget, not fully paid
router.get(
  '/unbudgeted',
  requirePermission('monthly_budget.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, budgetId: null, archived: false },
      include: { supplier: true, request: true },
      orderBy: { dueDate: 'asc' },
    });
    const fin = await loadFinance(prisma, tenantId);
    const enriched = invoices
      .map((inv) => {
        const paid = fin.supplierInvoicePaid(inv);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          supplier: inv.supplier?.name ?? '—',
          requestNumber: inv.request?.requestNumber ?? '',
          totalAmount: Number(inv.totalAmount),
          paidAmount: paid,
          remainingAmount: Math.max(0, Number(inv.totalAmount) - paid),
          status: fin.invoiceAutoStatus(inv),
          dueDate: inv.dueDate,
          invoiceDate: inv.invoiceDate,
        };
      })
      .filter((inv) => inv.status !== 'پرداخت کامل');
    res.json({ invoices: enriched, total: enriched.length });
  })
);

router.get(
  '/payment-plan',
  requirePermission('monthly_budget.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const fin = await loadFinance(prisma, tenantId);
    const [invoices, quotations, installments] = await Promise.all([
      prisma.invoice.findMany({ where: { tenantId, archived: false }, include: { supplier: true, request: true } }),
      prisma.quotation.findMany({ where: { tenantId, archived: false, advancePaymentAmount: { gt: 0 } }, include: { supplier: true, request: true } }),
      prisma.installment.findMany({ where: { tenantId } }),
    ]);
    const budgetById = new Map(fin.budgets.map((b) => [b.id, b]));
    const instByInvoice = new Map<string, typeof installments>();
    for (const ins of installments) {
      const arr = instByInvoice.get(ins.invoiceId) ?? [];
      arr.push(ins);
      instByInvoice.set(ins.invoiceId, arr);
    }

    interface PlanRow { type: string; number: string; request: string; supplier: string; amount: number; paid: number; remaining: number; date: Date | null; status: string }
    const monthRows = new Map<string, PlanRow[]>();
    const add = (key: string, row: PlanRow) => {
      if (!key) return;
      const arr = monthRows.get(key) ?? [];
      arr.push(row);
      monthRows.set(key, arr);
    };

    for (const inv of invoices) {
      const total = num(inv.totalAmount);
      const paid = fin.supplierInvoicePaid(inv);
      const row: PlanRow = {
        type: 'فاکتور', number: inv.invoiceNumber, request: inv.request?.requestNumber ?? '',
        supplier: inv.supplier?.name ?? '—', amount: total, paid, remaining: Math.max(0, total - paid),
        date: inv.dueDate, status: fin.invoiceAutoStatus(inv),
      };
      const keys = new Set<string>();
      const bud = inv.budgetId ? budgetById.get(inv.budgetId) : null;
      if (bud) keys.add(`${bud.yearJalali}-${String(bud.monthJalali).padStart(2, '0')}`);
      if (inv.dueDate) keys.add(jalaliMonthKey(inv.dueDate));
      for (const ins of instByInvoice.get(inv.id) ?? []) if (ins.monthKey) keys.add(ins.monthKey);
      keys.forEach((k) => add(k, row));
    }

    for (const q of quotations) {
      const amount = num(q.amount);
      const adv = num(q.advancePaymentAmount);
      const row: PlanRow = {
        type: 'پیش‌فاکتور', number: q.quotationNumber ?? '—', request: q.request?.requestNumber ?? '',
        supplier: q.supplier?.name ?? '—', amount, paid: adv, remaining: Math.max(0, amount - adv),
        date: q.advancePaymentDate ?? q.date, status: q.status,
      };
      const keys = new Set<string>();
      const bud = q.budgetId ? budgetById.get(q.budgetId) : null;
      if (bud) keys.add(`${bud.yearJalali}-${String(bud.monthJalali).padStart(2, '0')}`);
      if (q.advancePaymentDate) keys.add(jalaliMonthKey(q.advancePaymentDate));
      keys.forEach((k) => add(k, row));
    }

    const months = [...monthRows.keys()].sort().map((key) => {
      const [y, m] = key.split('-').map(Number);
      const rows = (monthRows.get(key) ?? []).sort((a, b) => (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0));
      return {
        key,
        label: `${jalaliMonthName(m)} ${y}`,
        total: rows.reduce((s, r) => s + r.remaining, 0),
        rows,
      };
    });
    res.json({ months });
  })
);

router.get(
  '/:id',
  requirePermission('monthly_budget.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const budget = await prisma.budget.findFirst({
      where: { id: req.params.id, tenantId },
      include: { allocations: true },
    });
    if (!budget) throw ApiError.notFound('بودجه یافت نشد');
    const fin = await loadFinance(prisma, tenantId);
    res.json({ budget: { ...budget, summary: fin.budgetSummary(budget) } });
  })
);

// GET /api/:tenantId/budgets/:id/invoices — invoices linked to this budget with computed status
router.get(
  '/:id/invoices',
  requirePermission('monthly_budget.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const budget = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId } });
    if (!budget) throw ApiError.notFound('بودجه یافت نشد');
    const invoices = await prisma.invoice.findMany({
      where: { budgetId: req.params.id, tenantId },
      include: { supplier: true, request: true },
      orderBy: { createdAt: 'desc' },
    });
    const fin = await loadFinance(prisma, tenantId);
    const enriched = invoices.map((inv) => {
      const paid = fin.supplierInvoicePaid(inv);
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplier: inv.supplier?.name ?? '—',
        requestNumber: inv.request?.requestNumber ?? '',
        totalAmount: Number(inv.totalAmount),
        paidAmount: paid,
        remainingAmount: Math.max(0, Number(inv.totalAmount) - paid),
        status: fin.invoiceAutoStatus(inv),
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        sentToAccounting: inv.sentToAccounting,
      };
    });
    res.json({ invoices: enriched, total: enriched.length });
  })
);

router.post(
  '/',
  requirePermission('monthly_budget.create'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const body = req.body as z.infer<typeof schema>;
    const { required, approved } = computeFields(body);
    const budget = await prisma.budget.create({
      data: {
        tenantId,
        name: body.name ?? null,
        yearJalali: body.yearJalali,
        monthJalali: body.monthJalali,
        estimatedCost: body.estimatedCost,
        contingencyPercent: body.contingencyPercent,
        requiredBudget: required,
        approvedBudget: approved,
        manualActual: body.manualActual ?? null,
        varianceReason: body.varianceReason ?? null,
        notes: body.notes ?? null,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
        allocations: body.allocations?.length
          ? {
              create: body.allocations.map((a) => ({
                tenantId,
                yearJalali: a.yearJalali,
                monthJalali: a.monthJalali,
                percentage: a.percentage,
                amount: a.amount ?? Math.round((required * a.percentage) / 100),
              })),
            }
          : undefined,
      },
      include: { allocations: true },
    });
    res.status(201).json({ budget });
  })
);

router.patch(
  '/:id',
  requirePermission('monthly_budget.edit'),
  validate(schema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('بودجه یافت نشد');

    const merged = {
      estimatedCost: req.body.estimatedCost ?? num(existing.estimatedCost),
      contingencyPercent: req.body.contingencyPercent ?? num(existing.contingencyPercent),
      approvedBudget: req.body.approvedBudget ?? num(existing.approvedBudget),
    } as z.infer<typeof schema>;
    const required = Math.ceil(merged.estimatedCost * (1 + merged.contingencyPercent / 100));
    const approved = merged.approvedBudget && merged.approvedBudget > 0 ? merged.approvedBudget : required;

    const budget = await prisma.$transaction(async (tx) => {
      if (req.body.allocations) {
        await tx.budgetAllocation.deleteMany({ where: { budgetId: existing.id } });
        if (req.body.allocations.length) {
          await tx.budgetAllocation.createMany({
            data: req.body.allocations.map((a: z.infer<typeof allocationSchema>) => ({
              tenantId,
              budgetId: existing.id,
              yearJalali: a.yearJalali,
              monthJalali: a.monthJalali,
              percentage: a.percentage,
              amount: a.amount ?? Math.round((required * a.percentage) / 100),
            })),
          });
        }
      }
      return tx.budget.update({
        where: { id: existing.id },
        data: {
          name: req.body.name ?? existing.name,
          yearJalali: req.body.yearJalali ?? existing.yearJalali,
          monthJalali: req.body.monthJalali ?? existing.monthJalali,
          estimatedCost: merged.estimatedCost,
          contingencyPercent: merged.contingencyPercent,
          requiredBudget: required,
          approvedBudget: approved,
          manualActual: req.body.manualActual ?? existing.manualActual,
          varianceReason: req.body.varianceReason ?? existing.varianceReason,
          notes: req.body.notes ?? existing.notes,
          updatedById: req.auth!.userId,
        },
        include: { allocations: true },
      });
    });
    res.json({ budget });
  })
);

router.delete(
  '/:id',
  requirePermission('monthly_budget.delete'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('بودجه یافت نشد');
    await prisma.budget.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

export default router;

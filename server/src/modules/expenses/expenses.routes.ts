import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

const reportSchema = z.object({
  reportNumber: z.string().optional().nullable(),
  title: z.string().min(1),
  submittedBy: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  periodStart: z.coerce.date().optional().nullable(),
  periodEnd: z.coerce.date().optional().nullable(),
  currency: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
});

const itemSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().min(0),
  expenseDate: z.coerce.date().optional().nullable(),
  receiptRef: z.string().optional().nullable(),
});

const include = { items: { orderBy: { expenseDate: 'asc' as const } } } as const;

router.get('/', requirePermission('expenses.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const status = req.query.status as string | undefined;
    const reports = await prisma.expenseReport.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ reports });
  })
);

router.post('/', requirePermission('expenses.create'),
  validate(reportSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const report = await prisma.expenseReport.create({
      data: { ...req.body, tenantId, createdById: req.auth!.userId },
      include,
    });
    res.status(201).json({ report });
  })
);

router.get('/:id', requirePermission('expenses.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const report = await prisma.expenseReport.findFirst({ where: { id: req.params.id, tenantId }, include });
    if (!report) throw ApiError.notFound('گزارش هزینه یافت نشد');
    res.json({ report });
  })
);

router.patch('/:id', requirePermission('expenses.edit'),
  validate(reportSchema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.expenseReport.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('گزارش هزینه یافت نشد');
    const report = await prisma.expenseReport.update({ where: { id: existing.id }, data: req.body, include });
    res.json({ report });
  })
);

router.delete('/:id', requirePermission('expenses.delete'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.expenseReport.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('گزارش هزینه یافت نشد');
    await prisma.expenseReport.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

// Items
router.post('/:id/items', requirePermission('expenses.edit'),
  validate(itemSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const report = await prisma.expenseReport.findFirst({ where: { id: req.params.id, tenantId } });
    if (!report) throw ApiError.notFound('گزارش هزینه یافت نشد');
    const item = await prisma.expenseItem.create({ data: { ...req.body, reportId: report.id } });
    // Recalc total
    const items = await prisma.expenseItem.findMany({ where: { reportId: report.id } });
    const total = items.reduce((s, i) => s + Number(i.amount), 0);
    await prisma.expenseReport.update({ where: { id: report.id }, data: { totalAmount: total } });
    res.status(201).json({ item });
  })
);

router.delete('/:id/items/:itemId', requirePermission('expenses.edit'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const report = await prisma.expenseReport.findFirst({ where: { id: req.params.id, tenantId } });
    if (!report) throw ApiError.notFound('گزارش هزینه یافت نشد');
    await prisma.expenseItem.delete({ where: { id: req.params.itemId } });
    const items = await prisma.expenseItem.findMany({ where: { reportId: report.id } });
    const total = items.reduce((s, i) => s + Number(i.amount), 0);
    await prisma.expenseReport.update({ where: { id: report.id }, data: { totalAmount: total } });
    res.json({ ok: true });
  })
);

export default router;

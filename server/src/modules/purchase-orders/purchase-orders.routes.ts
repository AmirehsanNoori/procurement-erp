import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { searchTerms } from '../../lib/search';

// Mounted at /api/:tenantId/purchase-orders behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });

const tid = (req: { tenant?: { tenantId: string } }) => req.tenant!.tenantId;
const round2 = (n: number) => Math.round(n * 100) / 100;

const itemSchema = z.object({
  productId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().optional().nullable(),
  unitPrice: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
});
const poSchema = z.object({
  poNumber: z.string().min(1),
  supplierId: z.string().optional().nullable(),
  requestId: z.string().optional().nullable(),
  quotationId: z.string().optional().nullable(),
  orderDate: z.coerce.date().optional(),
  expectedDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

const include = { supplier: { select: { name: true } }, items: { orderBy: { sortOrder: 'asc' as const } } };

function totals(items: z.infer<typeof itemSchema>[]) {
  let net = 0, tax = 0;
  const lines = items.map((it, i) => {
    const lineTotal = round2(it.quantity * it.unitPrice);
    net += lineTotal; tax += it.taxAmount ?? 0;
    return { productId: it.productId ?? null, description: it.description, quantity: it.quantity, unit: it.unit ?? null, unitPrice: it.unitPrice, taxAmount: it.taxAmount ?? 0, lineTotal, sortOrder: i };
  });
  return { lines, net: round2(net), tax: round2(tax), total: round2(net + tax) };
}

router.get('/', requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const terms = searchTerms(req.query.search as string | undefined);
  const where: Prisma.PurchaseOrderWhereInput = {
    tenantId,
    ...(req.query.status ? { status: req.query.status as string } : {}),
    ...(terms.length ? { OR: terms.flatMap((v) => [
      { poNumber: { contains: v, mode: 'insensitive' as const } },
      { supplier: { name: { contains: v, mode: 'insensitive' as const } } },
    ]) } : {}),
  };
  const orders = await prisma.purchaseOrder.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json({ orders });
}));

router.get('/:id', requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const order = await prisma.purchaseOrder.findFirst({ where: { tenantId: tid(req), id: req.params.id }, include });
  if (!order) throw ApiError.notFound('سفارش خرید یافت نشد');
  res.json({ order });
}));

/** Three-way match: ordered (PO) vs received (goods receipts) vs invoiced. */
router.get('/:id/match', requirePermission('purchase_orders.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const order = await prisma.purchaseOrder.findFirst({ where: { tenantId, id: req.params.id }, include });
  if (!order) throw ApiError.notFound('سفارش خرید یافت نشد');
  const invoices = await prisma.invoice.findMany({ where: { tenantId, poId: order.id }, select: { id: true, invoiceNumber: true, totalAmount: true, receivedAt: true } });
  const invIds = invoices.map((i) => i.id);
  const receipts = invIds.length
    ? await prisma.goodsReceipt.findMany({ where: { tenantId, refType: 'invoice', refId: { in: invIds } }, include: { items: true } })
    : [];
  const ordered = round2(Number(order.totalAmount));
  const invoiced = round2(invoices.reduce((s, i) => s + Number(i.totalAmount), 0));
  const receivedQty = round2(receipts.reduce((s, r) => s + r.items.reduce((a, it) => a + Number(it.quantity), 0), 0));
  const receivedValue = round2(receipts.reduce((s, r) => s + r.items.reduce((a, it) => a + Number(it.quantity) * Number(it.unitCost ?? 0), 0), 0));
  const orderedQty = round2(order.items.reduce((s, it) => s + Number(it.quantity), 0));
  const tol = 1;
  const matched = Math.abs(ordered - invoiced) <= tol && Math.abs(orderedQty - receivedQty) <= tol;
  res.json({
    ordered, orderedQty, invoiced, receivedQty, receivedValue,
    invoices, receiptsCount: receipts.length,
    matchStatus: invoices.length === 0 ? 'no_invoice' : receipts.length === 0 ? 'no_receipt' : matched ? 'matched' : 'variance',
  });
}));

router.post('/', requirePermission('purchase_orders.create'), validate(poSchema), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const b = req.body as z.infer<typeof poSchema>;
  const dup = await prisma.purchaseOrder.findFirst({ where: { tenantId, poNumber: b.poNumber.trim() } });
  if (dup) throw ApiError.conflict(`سفارش خرید با شماره «${b.poNumber.trim()}» قبلاً ثبت شده است`);
  const t = totals(b.items);
  const order = await prisma.purchaseOrder.create({
    data: {
      tenantId, poNumber: b.poNumber.trim(), supplierId: b.supplierId ?? null, requestId: b.requestId ?? null, quotationId: b.quotationId ?? null,
      orderDate: b.orderDate ?? new Date(), expectedDate: b.expectedDate ?? null, notes: b.notes ?? null,
      netAmount: t.net, taxAmount: t.tax, totalAmount: t.total, createdById: req.auth!.userId,
      items: { create: t.lines.map((l) => ({ tenantId, ...l })) },
    },
    include,
  });
  res.status(201).json({ order });
}));

router.patch('/:id', requirePermission('purchase_orders.edit'), validate(poSchema.partial()), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.purchaseOrder.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('سفارش خرید یافت نشد');
  if (existing.status !== 'draft') throw ApiError.badRequest('فقط سفارش پیش‌نویس قابل ویرایش است');
  const b = req.body as Partial<z.infer<typeof poSchema>>;
  const order = await prisma.$transaction(async (tx) => {
    let amounts = {};
    if (b.items) {
      const t = totals(b.items);
      await tx.purchaseOrderItem.deleteMany({ where: { poId: existing.id } });
      await tx.purchaseOrderItem.createMany({ data: t.lines.map((l) => ({ tenantId, poId: existing.id, ...l })) });
      amounts = { netAmount: t.net, taxAmount: t.tax, totalAmount: t.total };
    }
    return tx.purchaseOrder.update({
      where: { id: existing.id },
      data: {
        ...amounts,
        ...(b.supplierId !== undefined ? { supplierId: b.supplierId } : {}),
        ...(b.expectedDate !== undefined ? { expectedDate: b.expectedDate } : {}),
        ...(b.orderDate !== undefined ? { orderDate: b.orderDate } : {}),
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
      },
      include,
    });
  });
  res.json({ order });
}));

const STATUSES = ['draft', 'approved', 'sent', 'received', 'closed', 'cancelled'];
router.post('/:id/status', requirePermission('purchase_orders.approve'), validate(z.object({ status: z.enum(STATUSES as [string, ...string[]]) })), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.purchaseOrder.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('سفارش خرید یافت نشد');
  const status = (req.body as { status: string }).status;
  const order = await prisma.purchaseOrder.update({
    where: { id: existing.id },
    data: { status, ...(status === 'approved' && !existing.approvedAt ? { approvedById: req.auth!.userId, approvedAt: new Date() } : {}) },
    include,
  });
  res.json({ order });
}));

router.delete('/:id', requirePermission('purchase_orders.delete'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const existing = await prisma.purchaseOrder.findFirst({ where: { tenantId, id: req.params.id } });
  if (!existing) throw ApiError.notFound('سفارش خرید یافت نشد');
  if (!['draft', 'cancelled'].includes(existing.status)) throw ApiError.badRequest('فقط سفارش پیش‌نویس یا لغوشده قابل حذف است');
  await prisma.purchaseOrder.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

export default router;

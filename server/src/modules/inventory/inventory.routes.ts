import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { searchTerms } from '../../lib/search';
import { createReceiptJournal, createIssueJournal } from '../finance/inventory-posting';

// Mounted at /api/:tenantId/inventory behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });

const tid = (req: { tenant?: { tenantId: string } }) => req.tenant!.tenantId;

// ── Products ─────────────────────────────────────────────────────────────────
const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  minStock: z.coerce.number().optional().nullable(),
  isActive: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

router.get('/products', requirePermission('warehouse.view'), asyncHandler(async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  const variants = searchTerms(search);
  const where: Prisma.ProductWhereInput = {
    tenantId: tid(req),
    ...(variants.length
      ? { OR: variants.flatMap((v) => [
          { code: { contains: v, mode: 'insensitive' as const } },
          { name: { contains: v, mode: 'insensitive' as const } },
          { barcode: { contains: v, mode: 'insensitive' as const } },
          { category: { contains: v, mode: 'insensitive' as const } },
        ]) }
      : {}),
  };
  const products = await prisma.product.findMany({ where, orderBy: { name: 'asc' }, take: 500 });
  res.json({ products });
}));

router.post('/products', requirePermission('warehouse.create'), validate(productSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof productSchema>;
  const dup = await prisma.product.findFirst({ where: { tenantId: tid(req), code: body.code.trim() } });
  if (dup) throw ApiError.conflict(`کالا با کد «${body.code.trim()}» قبلاً ثبت شده است`);
  const product = await prisma.product.create({
    data: { ...body, code: body.code.trim(), tenantId: tid(req), createdById: req.auth!.userId },
  });
  res.status(201).json({ product });
}));

router.patch('/products/:id', requirePermission('warehouse.edit'), validate(productSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: tid(req) } });
  if (!existing) throw ApiError.notFound('کالا یافت نشد');
  const product = await prisma.product.update({ where: { id: existing.id }, data: req.body });
  res.json({ product });
}));

router.delete('/products/:id', requirePermission('warehouse.delete'), asyncHandler(async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: tid(req) } });
  if (!existing) throw ApiError.notFound('کالا یافت نشد');
  await prisma.product.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ── Warehouses ───────────────────────────────────────────────────────────────
const warehouseSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  location: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

router.get('/warehouses', requirePermission('warehouse.view'), asyncHandler(async (req, res) => {
  const warehouses = await prisma.warehouse.findMany({ where: { tenantId: tid(req) }, orderBy: { name: 'asc' } });
  res.json({ warehouses });
}));

router.post('/warehouses', requirePermission('warehouse.create'), validate(warehouseSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof warehouseSchema>;
  const dup = await prisma.warehouse.findFirst({ where: { tenantId: tid(req), code: body.code.trim() } });
  if (dup) throw ApiError.conflict(`انبار با کد «${body.code.trim()}» قبلاً ثبت شده است`);
  const warehouse = await prisma.warehouse.create({ data: { ...body, code: body.code.trim(), tenantId: tid(req) } });
  res.status(201).json({ warehouse });
}));

router.patch('/warehouses/:id', requirePermission('warehouse.edit'), validate(warehouseSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await prisma.warehouse.findFirst({ where: { id: req.params.id, tenantId: tid(req) } });
  if (!existing) throw ApiError.notFound('انبار یافت نشد');
  const warehouse = await prisma.warehouse.update({ where: { id: existing.id }, data: req.body });
  res.json({ warehouse });
}));

router.delete('/warehouses/:id', requirePermission('warehouse.delete'), asyncHandler(async (req, res) => {
  const existing = await prisma.warehouse.findFirst({ where: { id: req.params.id, tenantId: tid(req) } });
  if (!existing) throw ApiError.notFound('انبار یافت نشد');
  await prisma.warehouse.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ── Stock levels & movements ─────────────────────────────────────────────────
router.get('/stock', requirePermission('warehouse.view'), asyncHandler(async (req, res) => {
  const where: Prisma.StockLevelWhereInput = {
    tenantId: tid(req),
    ...(req.query.productId ? { productId: req.query.productId as string } : {}),
    ...(req.query.warehouseId ? { warehouseId: req.query.warehouseId as string } : {}),
  };
  const rows = await prisma.stockLevel.findMany({
    where,
    include: { product: { select: { code: true, name: true, unit: true, minStock: true } }, warehouse: { select: { code: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 1000,
  });
  const levels = rows.map((l) => ({ ...l, value: round2(Number(l.quantity) * Number(l.avgCost)) }));
  res.json({ levels });
}));

/** Inventory valuation: quantity, average cost and value per product (all
 *  warehouses combined) plus the grand total on-hand value. */
router.get('/valuation', requirePermission('warehouse.view'), asyncHandler(async (req, res) => {
  const tenantId = tid(req);
  const levels = await prisma.stockLevel.findMany({
    where: { tenantId, ...(req.query.warehouseId ? { warehouseId: req.query.warehouseId as string } : {}) },
    include: { product: { select: { code: true, name: true, unit: true } } },
  });
  const byProduct = new Map<string, { code: string; name: string; unit: string | null; quantity: number; value: number }>();
  for (const l of levels) {
    const q = Number(l.quantity), v = round2(q * Number(l.avgCost));
    const r = byProduct.get(l.productId) ?? { code: l.product.code, name: l.product.name, unit: l.product.unit, quantity: 0, value: 0 };
    r.quantity = round2(r.quantity + q); r.value = round2(r.value + v);
    byProduct.set(l.productId, r);
  }
  const rows = [...byProduct.entries()].map(([productId, r]) => ({ productId, ...r, avgCost: r.quantity > 0 ? round2(r.value / r.quantity) : 0 }))
    .filter((r) => r.quantity !== 0 || r.value !== 0)
    .sort((a, b) => b.value - a.value);
  res.json({ rows, totalValue: round2(rows.reduce((s, r) => s + r.value, 0)) });
}));

router.get('/movements', requirePermission('warehouse.view'), asyncHandler(async (req, res) => {
  const where: Prisma.StockMovementWhereInput = {
    tenantId: tid(req),
    ...(req.query.productId ? { productId: req.query.productId as string } : {}),
    ...(req.query.warehouseId ? { warehouseId: req.query.warehouseId as string } : {}),
  };
  const movements = await prisma.stockMovement.findMany({
    where,
    include: { product: { select: { code: true, name: true, unit: true } }, warehouse: { select: { code: true, name: true } } },
    orderBy: { date: 'desc' },
    take: 500,
  });
  res.json({ movements });
}));

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Apply a stock movement with moving-average valuation and return the unit cost
 * and value to record on the movement.
 * - inflow: unitCost = provided cost (else current average); recompute average.
 * - outflow: unitCost = current average (COGS); average unchanged.
 */
async function applyValuedMovement(
  tx: Prisma.TransactionClient, tenantId: string, productId: string, warehouseId: string,
  flow: 'in' | 'out', qty: number, providedUnitCost?: number | null,
): Promise<{ unitCost: number; value: number; newQty: number }> {
  const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
  const curQty = level ? Number(level.quantity) : 0;
  const curAvg = level ? Number(level.avgCost) : 0;
  let unitCost: number, newQty: number, newAvg: number;
  if (flow === 'in') {
    unitCost = round2(providedUnitCost != null ? providedUnitCost : curAvg);
    newQty = round2(curQty + qty);
    newAvg = newQty > 0 ? round2((curQty * curAvg + qty * unitCost) / newQty) : unitCost;
  } else {
    unitCost = round2(curAvg); // moving-average cost out
    newQty = round2(curQty - qty);
    newAvg = curAvg;
  }
  await tx.stockLevel.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    create: { tenantId, productId, warehouseId, quantity: newQty, avgCost: newAvg },
    update: { quantity: newQty, avgCost: newAvg },
  });
  return { unitCost, value: round2(qty * unitCost), newQty };
}

const movementSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  type: z.enum(['receipt', 'issue', 'adjustment']),
  quantity: z.coerce.number(),
  unitCost: z.coerce.number().min(0).optional().nullable(), // for inflows (receipt / positive adjustment)
  note: z.string().optional().nullable(),
  refModule: z.string().optional().nullable(),
  refType: z.string().optional().nullable(),
  refId: z.string().optional().nullable(),
});

// receipt (+), issue (−), adjustment (signed). Guarded by the matching permission.
router.post('/movements', validate(movementSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof movementSchema>;
  const perm = b.type === 'receipt' ? 'warehouse.receive' : b.type === 'issue' ? 'warehouse.issue' : 'warehouse.adjust';
  if (!req.tenant!.permissions.includes(perm)) throw ApiError.forbidden();

  const tenantId = tid(req);
  const [product, warehouse] = await Promise.all([
    prisma.product.findFirst({ where: { id: b.productId, tenantId } }),
    prisma.warehouse.findFirst({ where: { id: b.warehouseId, tenantId } }),
  ]);
  if (!product || !warehouse) throw ApiError.badRequest('کالا یا انبار نامعتبر است');

  const qty = Math.abs(b.quantity);
  // receipt = inflow; issue = outflow; adjustment inflow/outflow by sign.
  const flow: 'in' | 'out' = b.type === 'receipt' ? 'in' : b.type === 'issue' ? 'out' : (b.quantity >= 0 ? 'in' : 'out');
  if (flow === 'out') {
    const level = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: b.productId, warehouseId: b.warehouseId } } });
    if ((level ? Number(level.quantity) : 0) < qty) throw ApiError.badRequest('موجودی کافی نیست');
  }

  const movement = await prisma.$transaction(async (tx) => {
    const val = await applyValuedMovement(tx, tenantId, b.productId, b.warehouseId, flow, qty, flow === 'in' ? b.unitCost : undefined);
    return tx.stockMovement.create({
      data: {
        tenantId, productId: b.productId, warehouseId: b.warehouseId,
        type: b.type, quantity: qty, unitCost: val.unitCost, value: val.value,
        refModule: b.refModule ?? null, refType: b.refType ?? null, refId: b.refId ?? null,
        note: b.note ?? null, createdById: req.auth!.userId,
      },
    });
  });
  // W2: an issue relieves inventory → post COGS (Dr COGS, Cr inventory). Fail-open.
  let posting;
  if (b.type === 'issue' && Number(movement.value) > 0) {
    posting = await createIssueJournal(tenantId, movement.id, Number(movement.value), product.name, req.auth!.userId).catch(() => undefined);
  }
  res.status(201).json({ movement, posting });
}));

// transfer between two warehouses (transfer_out + transfer_in)
const transferSchema = z.object({
  productId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  note: z.string().optional().nullable(),
});
router.post('/movements/transfer', requirePermission('warehouse.transfer'), validate(transferSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof transferSchema>;
  if (b.fromWarehouseId === b.toWarehouseId) throw ApiError.badRequest('انبار مبدأ و مقصد یکسان است');
  const tenantId = tid(req);
  const level = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: b.productId, warehouseId: b.fromWarehouseId } } });
  if ((level ? Number(level.quantity) : 0) < b.quantity) throw ApiError.badRequest('موجودی انبار مبدأ کافی نیست');

  await prisma.$transaction(async (tx) => {
    // Ship out at the source's moving-average cost, receive in at that same cost.
    const out = await applyValuedMovement(tx, tenantId, b.productId, b.fromWarehouseId, 'out', b.quantity);
    await tx.stockMovement.create({ data: { tenantId, productId: b.productId, warehouseId: b.fromWarehouseId, type: 'transfer_out', quantity: b.quantity, unitCost: out.unitCost, value: out.value, note: b.note ?? null, createdById: req.auth!.userId } });
    const inn = await applyValuedMovement(tx, tenantId, b.productId, b.toWarehouseId, 'in', b.quantity, out.unitCost);
    await tx.stockMovement.create({ data: { tenantId, productId: b.productId, warehouseId: b.toWarehouseId, type: 'transfer_in', quantity: b.quantity, unitCost: inn.unitCost, value: inn.value, note: b.note ?? null, createdById: req.auth!.userId } });
  });
  res.status(201).json({ ok: true });
}));

// ── Procurement handoff: goods receipt against an invoice (Phase C) ───────────
// Invoices procurement sent to the warehouse, awaiting a system receipt.
router.get('/pending-receipts', requirePermission('warehouse.receive'), asyncHandler(async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: tid(req), sentToWarehouseAt: { not: null }, receivedAt: null, archived: false },
    include: {
      supplier: { select: { name: true } },
      // Include the originating request's line items so the warehouse receives
      // against what was actually requested (Part 1).
      request: { select: { id: true, requestNumber: true, items: { select: { productId: true, category: true, description: true, quantity: true, unit: true, unitPrice: true }, orderBy: { sortOrder: 'asc' } } } },
    },
    orderBy: { sentToWarehouseAt: 'asc' },
  });
  res.json({ invoices });
}));

// Goods-receipt history.
router.get('/receipts', requirePermission('warehouse.view'), asyncHandler(async (req, res) => {
  const receipts = await prisma.goodsReceipt.findMany({
    where: { tenantId: tid(req) },
    include: {
      warehouse: { select: { name: true } },
      items: { include: { product: { select: { code: true, name: true, unit: true } } } },
    },
    orderBy: { receivedAt: 'desc' },
    take: 300,
  });
  // Attach the linked invoice number (soft cross-module reference).
  const invIds = [...new Set(receipts.map((r) => r.refId).filter(Boolean) as string[])];
  const invoices = invIds.length ? await prisma.invoice.findMany({ where: { tenantId: tid(req), id: { in: invIds } }, select: { id: true, invoiceNumber: true } }) : [];
  const invMap = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
  res.json({ receipts: receipts.map((r) => ({ ...r, invoiceNumber: r.refId ? invMap.get(r.refId) ?? null : null })) });
}));

const receiveSchema = z.object({
  invoiceId: z.string().min(1),
  warehouseId: z.string().min(1),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().positive(), unitCost: z.coerce.number().min(0).optional().nullable(), note: z.string().optional().nullable() })).min(1),
});
// Register the receipt: stock-in each line (soft-ref to the invoice) and mark the
// invoice received so procurement can forward it to finance.
router.post('/receive', requirePermission('warehouse.receive'), validate(receiveSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof receiveSchema>;
  const tenantId = tid(req);
  const invoice = await prisma.invoice.findFirst({ where: { id: b.invoiceId, tenantId } });
  if (!invoice) throw ApiError.notFound('فاکتور یافت نشد');
  if (!invoice.sentToWarehouseAt) throw ApiError.badRequest('این فاکتور به انبار ارسال نشده است');
  const warehouse = await prisma.warehouse.findFirst({ where: { id: b.warehouseId, tenantId } });
  if (!warehouse) throw ApiError.badRequest('انبار نامعتبر است');
  const productIds = [...new Set(b.lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true } });
  if (products.length !== productIds.length) throw ApiError.badRequest('کالای نامعتبر در اقلام');

  const { receiptId, totalValue } = await prisma.$transaction(async (tx) => {
    // Formal goods-receipt document (Part 1).
    const receipt = await tx.goodsReceipt.create({
      data: {
        tenantId, warehouseId: b.warehouseId,
        refModule: 'procurement', refType: 'invoice', refId: invoice.id,
        requestRefId: invoice.requestId ?? null, receivedById: req.auth!.userId,
      },
    });
    let total = 0;
    for (const line of b.lines) {
      const val = await applyValuedMovement(tx, tenantId, line.productId, b.warehouseId, 'in', line.quantity, line.unitCost);
      total += val.value;
      await tx.goodsReceiptItem.create({ data: { tenantId, receiptId: receipt.id, productId: line.productId, quantity: line.quantity, unitCost: val.unitCost, note: line.note ?? null } });
      await tx.stockMovement.create({
        data: {
          tenantId, productId: line.productId, warehouseId: b.warehouseId,
          type: 'receipt', quantity: line.quantity, unitCost: val.unitCost, value: val.value,
          refModule: 'procurement', refType: 'invoice', refId: invoice.id,
          note: line.note ?? null, createdById: req.auth!.userId,
        },
      });
    }
    await tx.invoice.update({ where: { id: invoice.id }, data: { receivedAt: new Date() } });
    return { receiptId: receipt.id, totalValue: round2(total) };
  });
  // W2: post the goods-receipt voucher (Dr inventory, Cr GR/IR). Fail-open.
  const posting = await createReceiptJournal(tenantId, receiptId, totalValue, `فاکتور ${invoice.invoiceNumber}`, req.auth!.userId).catch(() => undefined);
  // Notify procurement that the goods were received.
  await prisma.notification.create({
    data: { tenantId, type: 'invoice', level: 'important', title: `رسید فاکتور ${invoice.invoiceNumber} در انبار ثبت شد`, entityType: 'invoice', entityId: invoice.id },
  }).catch(() => undefined);
  res.json({ ok: true, posting });
}));

export default router;

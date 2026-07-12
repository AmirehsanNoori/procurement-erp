import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { searchTerms } from '../../lib/search';

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
  const levels = await prisma.stockLevel.findMany({
    where,
    include: { product: { select: { code: true, name: true, unit: true, minStock: true } }, warehouse: { select: { code: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 1000,
  });
  res.json({ levels });
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

/** Apply a signed quantity delta to a product/warehouse stock level. */
async function applyDelta(tx: Prisma.TransactionClient, tenantId: string, productId: string, warehouseId: string, delta: number) {
  const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
  const current = level ? Number(level.quantity) : 0;
  const next = current + delta;
  await tx.stockLevel.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    create: { tenantId, productId, warehouseId, quantity: next },
    update: { quantity: next },
  });
  return next;
}

const movementSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  type: z.enum(['receipt', 'issue', 'adjustment']),
  quantity: z.coerce.number(),
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
  const delta = b.type === 'receipt' ? qty : b.type === 'issue' ? -qty : b.quantity; // adjustment keeps sign
  if (b.type === 'issue') {
    const level = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: b.productId, warehouseId: b.warehouseId } } });
    if ((level ? Number(level.quantity) : 0) < qty) throw ApiError.badRequest('موجودی کافی نیست');
  }

  const movement = await prisma.$transaction(async (tx) => {
    const m = await tx.stockMovement.create({
      data: {
        tenantId, productId: b.productId, warehouseId: b.warehouseId,
        type: b.type, quantity: Math.abs(b.quantity),
        refModule: b.refModule ?? null, refType: b.refType ?? null, refId: b.refId ?? null,
        note: b.note ?? null, createdById: req.auth!.userId,
      },
    });
    await applyDelta(tx, tenantId, b.productId, b.warehouseId, delta);
    return m;
  });
  res.status(201).json({ movement });
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
    await tx.stockMovement.create({ data: { tenantId, productId: b.productId, warehouseId: b.fromWarehouseId, type: 'transfer_out', quantity: b.quantity, note: b.note ?? null, createdById: req.auth!.userId } });
    await tx.stockMovement.create({ data: { tenantId, productId: b.productId, warehouseId: b.toWarehouseId, type: 'transfer_in', quantity: b.quantity, note: b.note ?? null, createdById: req.auth!.userId } });
    await applyDelta(tx, tenantId, b.productId, b.fromWarehouseId, -b.quantity);
    await applyDelta(tx, tenantId, b.productId, b.toWarehouseId, b.quantity);
  });
  res.status(201).json({ ok: true });
}));

export default router;

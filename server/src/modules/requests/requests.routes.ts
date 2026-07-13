import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { parsePagination, paginationSkipTake, buildMeta } from '../../lib/paginate';
import { searchTerms } from '../../lib/search';

// Mounted at /api/:tenantId/requests behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });

const dateField = z.coerce.date().optional().nullable();
const numField = z.coerce.number().optional().nullable();

const itemSchema = z.object({
  category: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().default(1),
  unit: z.string().optional().nullable(),
  unitPrice: numField,
  lineTotal: numField,
  taxAmount: numField,
  notes: z.string().optional().nullable(),
});
type ItemInput = z.infer<typeof itemSchema>;

/**
 * Replace a request's line items (warehouse intake detail). Fail-open: if the
 * request_items table isn't present yet (pre-migration), items are skipped so
 * request create/edit never breaks.
 */
async function replaceRequestItems(tenantId: string, requestId: string, items: ItemInput[]) {
  try {
    await prisma.$transaction([
      prisma.requestItem.deleteMany({ where: { requestId, tenantId } }),
      ...(items.length
        ? [
            prisma.requestItem.createMany({
              data: items.map((it, i) => ({
                tenantId,
                requestId,
                category: it.category ?? null,
                description: it.description,
                quantity: it.quantity ?? 1,
                unit: it.unit ?? null,
                unitPrice: it.unitPrice ?? null,
                lineTotal: it.lineTotal ?? (it.unitPrice != null ? (it.quantity ?? 1) * it.unitPrice : null),
                taxAmount: it.taxAmount ?? null,
                notes: it.notes ?? null,
                sortOrder: i,
              })),
            }),
          ]
        : []),
    ]);
  } catch {
    // request_items table not migrated yet — skip silently.
  }
}

const upsertSchema = z.object({
  requestNumber: z.string().min(1),
  requestingUnit: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  items: z.array(itemSchema).optional(),
  orderNo: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  requestDate: dateField,
  documentDate: dateField,
  receivedDate: dateField,
  weeklySegmentation: z.string().optional().nullable(),
  receivedPercentage: numField,
  estimatedAmount: numField,
  cost: numField,
  supplierId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  status: z.string().optional(),
  followUpDate: dateField,
  deliveryDate: dateField,
  serviceDate: dateField,
  driver: z.string().optional().nullable(),
  serviceProvider: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  ioidRow: z.coerce.number().int().optional().nullable(),
  ioidRemark: z.string().optional().nullable(),
});

// GET /api/:tenantId/requests?search=&status=&archived=&page=&limit=
router.get(
  '/',
  requirePermission('requests.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const search = (req.query.search as string | undefined)?.trim();
    const status = req.query.status as string | undefined;
    // archived: 'true' → only archived, 'all' → both (used by the quotation
    // picker so additional quotes can target an already-archived request),
    // anything else → only active.
    const archivedParam = req.query.archived as string | undefined;
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);

    const terms = searchTerms(search);
    const where: Prisma.RequestWhereInput = {
      tenantId,
      ...(archivedParam === 'all' ? {} : { archived: archivedParam === 'true' }),
      ...(status ? { status } : {}),
      ...(terms.length
        ? {
            // Match any digit-script variant so Latin/Persian/Arabic numbers all find each other.
            OR: terms.flatMap((v) => [
              { requestNumber: { contains: v, mode: 'insensitive' } },
              { orderNo: { contains: v, mode: 'insensitive' } },
              { title: { contains: v, mode: 'insensitive' } },
              { description: { contains: v, mode: 'insensitive' } },
              { category: { contains: v, mode: 'insensitive' } },
            ] as Prisma.RequestWhereInput[]),
          }
        : {}),
    };

    const { skip, take } = paginationSkipTake({ page, limit });
    const [requests, total] = await Promise.all([
      prisma.request.findMany({
        where,
        include: {
          supplier: true,
          assignee: { select: { id: true, fullName: true } },
          _count: { select: { quotations: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.request.count({ where }),
    ]);
    res.json({ requests, ...buildMeta(total, page, limit) });
  })
);

// GET /api/:tenantId/requests/gantt — full data for Gantt chart (no pagination)
router.get(
  '/gantt',
  requirePermission('requests.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const archived = req.query.archived === 'true';
    const requests = await prisma.request.findMany({
      where: { tenantId, archived },
      include: {
        supplier: { select: { name: true } },
        quotations: { select: { date: true } },
        invoices: { select: { invoiceDate: true, payments: { select: { paymentDate: true } } } },
      },
      orderBy: { requestDate: 'desc' },
      take: 300,
    });
    res.json({ requests });
  })
);

// GET /api/:tenantId/requests/assignable-users — active members of this tenant
// (used to populate the "assign to" dropdown). Defined before /:id so it isn't
// captured by the param route.
router.get(
  '/assignable-users',
  requirePermission('requests.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const members = await prisma.tenantUser.findMany({
      where: { tenantId, isActive: true, user: { isActive: true } },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });
    const users = members.map((m) => m.user);
    res.json({ users });
  })
);

// GET /api/:tenantId/requests/:id
router.get(
  '/:id',
  requirePermission('requests.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const request = await prisma.request.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        supplier: true,
        assignee: { select: { id: true, fullName: true } },
        quotations: true,
        invoices: true,
      },
    });
    if (!request) throw ApiError.notFound('درخواست یافت نشد');
    // Line items — fail-open if the table isn't migrated yet.
    let items: unknown[] = [];
    try {
      items = await prisma.requestItem.findMany({ where: { requestId: request.id, tenantId }, orderBy: { sortOrder: 'asc' } });
    } catch { /* not migrated yet */ }
    res.json({ request: { ...request, items } });
  })
);

// GET /api/:tenantId/requests/:id/quotations — full quotation list for comparison
router.get(
  '/:id/quotations',
  requirePermission('quotations.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const request = await prisma.request.findFirst({ where: { id: req.params.id, tenantId } });
    if (!request) throw ApiError.notFound('درخواست یافت نشد');
    const quotations = await prisma.quotation.findMany({
      where: { requestId: req.params.id, tenantId, archived: false },
      include: { supplier: true, budget: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ quotations });
  })
);

// POST /api/:tenantId/requests/:id/invite-suppliers
// Record which suppliers an RFQ was sent to. Each invited supplier becomes a
// placeholder quotation (status 'دعوت شده', no amount yet) so we can later track
// who quoted, enter prices, compare and pick a winner — all on the existing
// Quotation model (no schema change). Does NOT archive the request.
router.post(
  '/:id/invite-suppliers',
  requirePermission('quotations.create'),
  validate(z.object({ supplierIds: z.array(z.string().min(1)).min(1) })),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const request = await prisma.request.findFirst({ where: { id: req.params.id, tenantId } });
    if (!request) throw ApiError.notFound('درخواست یافت نشد');

    const { supplierIds } = req.body as { supplierIds: string[] };
    // Skip suppliers that already have a quotation (invited or real) for this request.
    const existing = await prisma.quotation.findMany({
      where: { tenantId, requestId: request.id },
      select: { supplierId: true },
    });
    const already = new Set(existing.map((q) => q.supplierId).filter(Boolean) as string[]);
    const toAdd = [...new Set(supplierIds)].filter((sid) => !already.has(sid));

    if (toAdd.length) {
      await prisma.quotation.createMany({
        data: toAdd.map((supplierId) => ({
          tenantId,
          requestId: request.id,
          supplierId,
          status: 'دعوت شده',
          currency: 'ریال',
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        })),
      });
    }
    res.status(201).json({ created: toAdd.length, skipped: supplierIds.length - toAdd.length });
  })
);

// POST /api/:tenantId/requests
router.post(
  '/',
  requirePermission('requests.create'),
  validate(upsertSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const data = req.body as z.infer<typeof upsertSchema>;
    const requestNumber = data.requestNumber.trim();
    // Request numbers must be unique per tenant — block duplicate registrations
    // up front with a clear message (the DB constraint is the final guard).
    const dup = await prisma.request.findFirst({ where: { tenantId, requestNumber } });
    if (dup) throw ApiError.conflict(`درخواست با شماره «${requestNumber}» قبلاً ثبت شده است`);
    const { items, ...rest } = data;
    const request = await prisma.request.create({
      data: {
        ...rest,
        requestNumber,
        tenantId,
        status: data.status ?? 'جدید',
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      },
    });
    if (items?.length) await replaceRequestItems(tenantId, request.id, items);
    res.status(201).json({ request });
  })
);

// PATCH /api/:tenantId/requests/:id
router.patch(
  '/:id',
  requirePermission('requests.edit'),
  validate(upsertSchema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    // Ensure the record belongs to this tenant before mutating.
    const existing = await prisma.request.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('درخواست یافت نشد');

    const body = { ...req.body } as Partial<z.infer<typeof upsertSchema>>;
    if (typeof body.requestNumber === 'string') {
      const requestNumber = body.requestNumber.trim();
      // Reject renaming onto a number already used by another request.
      const dup = await prisma.request.findFirst({
        where: { tenantId, requestNumber, NOT: { id: existing.id } },
      });
      if (dup) throw ApiError.conflict(`درخواست با شماره «${requestNumber}» قبلاً ثبت شده است`);
      body.requestNumber = requestNumber;
    }

    const { items, ...bodyRest } = body;
    const request = await prisma.request.update({
      where: { id: existing.id },
      data: { ...bodyRest, updatedById: req.auth!.userId },
    });
    if (items !== undefined) await replaceRequestItems(tenantId, request.id, items);
    res.json({ request });
  })
);

// POST /api/:tenantId/requests/:id/archive  &  /restore
router.post(
  '/:id/archive',
  requirePermission('requests.archive'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.request.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('درخواست یافت نشد');
    const request = await prisma.request.update({ where: { id: existing.id }, data: { archived: true } });
    res.json({ request });
  })
);

router.post(
  '/:id/restore',
  requirePermission('requests.restore'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.request.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('درخواست یافت نشد');
    const request = await prisma.request.update({ where: { id: existing.id }, data: { archived: false } });
    res.json({ request });
  })
);

// DELETE /api/:tenantId/requests/:id
router.delete(
  '/:id',
  requirePermission('requests.delete'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.request.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('درخواست یافت نشد');
    await prisma.request.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

export default router;

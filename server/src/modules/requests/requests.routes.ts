import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { parsePagination, paginationSkipTake, buildMeta } from '../../lib/paginate';

// Mounted at /api/:tenantId/requests behind requireAuth + requireTenant.
const router = Router({ mergeParams: true });

const dateField = z.coerce.date().optional().nullable();
const numField = z.coerce.number().optional().nullable();

const upsertSchema = z.object({
  requestNumber: z.string().min(1),
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
    const archived = req.query.archived === 'true';
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);

    const where: Prisma.RequestWhereInput = {
      tenantId,
      archived,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { requestNumber: { contains: search, mode: 'insensitive' } },
              { orderNo: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
            ],
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
    const request = await prisma.request.findFirst({
      where: { id: req.params.id, tenantId: req.tenant!.tenantId },
      include: {
        supplier: true,
        assignee: { select: { id: true, fullName: true } },
        quotations: true,
        invoices: true,
      },
    });
    if (!request) throw ApiError.notFound('درخواست یافت نشد');
    res.json({ request });
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

// POST /api/:tenantId/requests
router.post(
  '/',
  requirePermission('requests.create'),
  validate(upsertSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const data = req.body as z.infer<typeof upsertSchema>;
    const request = await prisma.request.create({
      data: {
        ...data,
        tenantId,
        status: data.status ?? 'جدید',
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
      },
    });
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

    const request = await prisma.request.update({
      where: { id: existing.id },
      data: { ...req.body, updatedById: req.auth!.userId },
    });
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

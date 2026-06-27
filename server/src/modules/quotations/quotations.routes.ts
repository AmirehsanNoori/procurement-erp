import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { INVOICE_STATUS } from '../finance/calc';
import { recalcInvoiceStatus } from '../invoices/service';

const router = Router({ mergeParams: true });

const dateField = z.coerce.date().optional().nullable();
const numField = z.coerce.number().optional().nullable();

const schema = z.object({
  quotationNumber: z.string().optional().nullable(),
  requestId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  date: dateField,
  amount: z.coerce.number().min(0),
  currency: z.string().optional(),
  status: z.string().optional(),
  budgetId: z.string().optional().nullable(),
  followUpDate: dateField,
  deliveryDate: dateField,
  serviceDate: dateField,
  driver: z.string().optional().nullable(),
  serviceProvider: z.string().optional().nullable(),
  deliveryNotes: z.string().optional().nullable(),
  advancePaymentAmount: numField,
  advancePaymentDate: dateField,
  paymentBatchNumber: z.string().optional().nullable(),
  accountingReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const include = { request: true, supplier: true, budget: true } as const;

router.get(
  '/',
  requirePermission('quotations.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const archived = req.query.archived === 'true';
    const search = (req.query.search as string | undefined)?.trim();
    const where: Prisma.QuotationWhereInput = {
      tenantId,
      archived,
      ...(req.query.status ? { status: req.query.status as string } : {}),
      ...(search
        ? {
            OR: [
              { quotationNumber: { contains: search, mode: 'insensitive' } },
              { supplier: { name: { contains: search, mode: 'insensitive' } } },
              { request: { requestNumber: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const quotations = await prisma.quotation.findMany({ where, include, orderBy: { createdAt: 'desc' } });
    res.json({ quotations });
  })
);

function validateAdvance(amount: number, advance: number | null | undefined) {
  if ((advance ?? 0) > amount) throw ApiError.badRequest('پیش‌پرداخت نمی‌تواند بیشتر از مبلغ پیش‌فاکتور باشد');
}

router.post(
  '/',
  requirePermission('quotations.create'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const body = req.body as z.infer<typeof schema>;
    validateAdvance(body.amount, body.advancePaymentAmount);

    const quotation = await prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          ...body,
          tenantId,
          status: body.status ?? 'در انتظار سفارش',
          currency: body.currency ?? 'ریال',
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        },
        include,
      });
      // Linking a request moves it out of the active requests list (prototype behaviour).
      if (created.requestId) {
        await tx.request.updateMany({
          where: { id: created.requestId, tenantId, archived: false },
          data: { archived: true },
        });
      }
      return created;
    });
    res.status(201).json({ quotation });
  })
);

router.patch(
  '/:id',
  requirePermission('quotations.edit'),
  validate(schema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('پیش‌فاکتور یافت نشد');
    const amount = req.body.amount ?? Number(existing.amount);
    validateAdvance(amount, req.body.advancePaymentAmount ?? Number(existing.advancePaymentAmount));
    const quotation = await prisma.quotation.update({
      where: { id: existing.id },
      data: { ...req.body, updatedById: req.auth!.userId },
      include,
    });
    res.json({ quotation });
  })
);

router.post(
  '/:id/archive',
  requirePermission('quotations.archive'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('پیش‌فاکتور یافت نشد');
    const quotation = await prisma.quotation.update({ where: { id: existing.id }, data: { archived: true } });
    res.json({ quotation });
  })
);

router.delete(
  '/:id',
  requirePermission('quotations.delete'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('پیش‌فاکتور یافت نشد');
    await prisma.quotation.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

// POST /:id/convert-to-invoice — create an invoice from a quotation, archive the quotation.
const convertSchema = z.object({
  invoiceNumber: z.string().min(1),
  invoiceDate: dateField,
  dueDate: z.coerce.date(),
  budgetId: z.string().optional().nullable(),
  netAmount: z.coerce.number().min(0).optional(),
  vatAmount: z.coerce.number().min(0).optional(),
  batch: z.string().optional().nullable(),
  accountingReference: z.string().optional().nullable(),
  sentToAccounting: z.boolean().optional(),
  accountingSubmissionDate: dateField,
  followUpDate: dateField,
  notes: z.string().optional().nullable(),
  installments: z
    .array(z.object({ amount: z.coerce.number().min(0), percent: z.coerce.number().optional(), monthKey: z.string().optional(), dueDate: dateField }))
    .optional(),
});

router.post(
  '/:id/convert-to-invoice',
  requirePermission('invoices.create'),
  validate(convertSchema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const body = req.body as z.infer<typeof convertSchema>;
    const q = await prisma.quotation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!q) throw ApiError.notFound('پیش‌فاکتور یافت نشد');

    const net = body.netAmount ?? Number(q.amount);
    const vat = body.vatAmount ?? 0;
    const total = net + vat;
    const budgetId = body.budgetId ?? q.budgetId ?? null;

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId,
          invoiceNumber: body.invoiceNumber,
          requestId: q.requestId,
          quotationId: q.id,
          supplierId: q.supplierId,
          invoiceDate: body.invoiceDate ?? new Date(),
          dueDate: body.dueDate,
          netAmount: net,
          vatAmount: vat,
          totalAmount: total,
          status: INVOICE_STATUS.WAIT_APPROVE,
          budgetId,
          batch: body.batch ?? null,
          accountingReference: body.accountingReference ?? null,
          sentToAccounting: body.sentToAccounting ?? false,
          accountingSubmissionDate: body.accountingSubmissionDate ?? null,
          followUpDate: body.followUpDate ?? q.followUpDate,
          notes: body.notes ?? q.notes,
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
          installments: body.installments?.length
            ? {
                create: body.installments.map((i) => ({
                  tenantId,
                  amount: i.amount,
                  percent: i.percent ?? null,
                  monthKey: i.monthKey ?? null,
                  dueDate: i.dueDate ?? null,
                })),
              }
            : undefined,
        },
        include: { installments: true },
      });
      await tx.quotation.update({ where: { id: q.id }, data: { archived: true, status: 'تبدیل شده' } });
      return created;
    });
    // Reflect any quotation advance in the new invoice's status immediately.
    await recalcInvoiceStatus(tenantId, invoice.id);
    const fresh = await prisma.invoice.findUnique({ where: { id: invoice.id }, include: { installments: true } });
    res.status(201).json({ invoice: fresh });
  })
);

// GET /compare?requestId=xxx — returns all quotations for a request, side-by-side for RFQ comparison
router.get(
  '/compare',
  requirePermission('quotations.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const requestId = req.query.requestId as string | undefined;
    if (!requestId) throw ApiError.badRequest('requestId الزامی است');

    const request = await prisma.request.findFirst({ where: { id: requestId, tenantId } });
    if (!request) throw ApiError.notFound('درخواست یافت نشد');

    const quotations = await prisma.quotation.findMany({
      where: { tenantId, requestId },
      include: { supplier: true, budget: true },
      orderBy: { amount: 'asc' },
    });

    // Annotate the winner (lowest amount quotation that isn't rejected/cancelled)
    const active = quotations.filter((q) => !['رد شده', 'آرشیو'].includes(q.status));
    const lowestId = active.length > 0 ? active[0].id : null;

    const result = quotations.map((q) => ({
      id: q.id,
      quotationNumber: q.quotationNumber,
      supplier: q.supplier?.name ?? '—',
      supplierId: q.supplierId,
      date: q.date,
      amount: Number(q.amount),
      currency: q.currency,
      status: q.status,
      deliveryDate: q.deliveryDate,
      notes: q.notes,
      advancePaymentAmount: q.advancePaymentAmount ? Number(q.advancePaymentAmount) : null,
      paymentBatchNumber: q.paymentBatchNumber,
      archived: q.archived,
      isLowest: q.id === lowestId,
    }));

    res.json({ request: { id: request.id, requestNumber: request.requestNumber, description: request.description }, quotations: result });
  })
);

export default router;

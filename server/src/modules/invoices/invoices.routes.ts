import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import { INVOICE_STATUS, loadFinance } from '../finance/calc';
import { recalcInvoiceStatus } from './service';
import { parsePagination, buildMeta } from '../../lib/paginate';

const router = Router({ mergeParams: true });

const dateField = z.coerce.date().optional().nullable();

const installmentSchema = z.object({
  amount: z.coerce.number().min(0),
  percent: z.coerce.number().optional().nullable(),
  monthKey: z.string().optional().nullable(),
  dueDate: dateField,
  status: z.string().optional(),
});

const schema = z.object({
  invoiceNumber: z.string().min(1),
  requestId: z.string().optional().nullable(),
  quotationId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  invoiceDate: dateField,
  dueDate: z.coerce.date(),
  netAmount: z.coerce.number().min(0).optional(),
  vatAmount: z.coerce.number().min(0).optional(),
  status: z.string().optional(),
  budgetId: z.string().optional().nullable(),
  batch: z.string().optional().nullable(),
  accountingReference: z.string().optional().nullable(),
  accountingNotes: z.string().optional().nullable(),
  sentToAccounting: z.boolean().optional(),
  accountingSubmissionDate: dateField,
  followUpDate: dateField,
  notes: z.string().optional().nullable(),
  installments: z.array(installmentSchema).optional(),
});

const include = { supplier: true, budget: true, request: true, quotation: true, installments: true } as const;

// GET /api/:tenantId/invoices?search=&status=&category=&batch=&page=&limit=&format=csv
router.get(
  '/',
  requirePermission('invoices.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const search = (req.query.search as string | undefined)?.trim();
    const category = req.query.category as string | undefined; // unb | wait | paid
    const format = req.query.format as string | undefined;
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);

    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      ...(req.query.status ? { status: req.query.status as string } : {}),
      ...(req.query.batch ? { batch: { contains: req.query.batch as string, mode: 'insensitive' } } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: 'insensitive' } },
              { supplier: { name: { contains: search, mode: 'insensitive' } } },
              { request: { requestNumber: { contains: search, mode: 'insensitive' } } },
              { notes: { contains: search, mode: 'insensitive' } },
              { accountingReference: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, fin] = await Promise.all([
      prisma.invoice.findMany({ where, include, orderBy: { createdAt: 'desc' } }),
      loadFinance(prisma, tenantId),
    ]);

    let enriched = rows.map((inv) => {
      const paid = fin.supplierInvoicePaid(inv);
      const total = Number(inv.totalAmount);
      return {
        ...inv,
        status: fin.invoiceAutoStatus(inv),
        paidAmount: paid,
        remainingAmount: Math.max(0, total - paid),
      };
    });

    const counts = {
      all: enriched.length,
      unb: enriched.filter((i) => !i.budgetId && i.status !== INVOICE_STATUS.PAID_FULL).length,
      wait: enriched.filter((i) => i.budgetId && i.status !== INVOICE_STATUS.PAID_FULL).length,
      paid: enriched.filter((i) => i.status === INVOICE_STATUS.PAID_FULL).length,
    };

    if (category === 'unb') enriched = enriched.filter((i) => !i.budgetId && i.status !== INVOICE_STATUS.PAID_FULL);
    else if (category === 'wait') enriched = enriched.filter((i) => i.budgetId && i.status !== INVOICE_STATUS.PAID_FULL);
    else if (category === 'paid') enriched = enriched.filter((i) => i.status === INVOICE_STATUS.PAID_FULL);

    if (format === 'csv') {
      const tenantCode = req.tenant!.tenantCode;
      const date = new Date().toISOString().slice(0, 10);
      const header = ['شماره فاکتور', 'تأمین‌کننده', 'مجموع', 'پرداخت شده', 'مانده', 'وضعیت', 'سررسید', 'بودجه'].join(',');
      const csvRows = enriched.map((i) =>
        [
          i.invoiceNumber,
          i.supplier?.name ?? '',
          Number(i.totalAmount),
          i.paidAmount,
          i.remainingAmount,
          i.status,
          i.dueDate ? i.dueDate.toISOString().slice(0, 10) : '',
          i.budget?.name ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="invoices-${tenantCode}-${date}.csv"`);
      res.send('﻿' + [header, ...csvRows].join('\n'));
      return;
    }

    const total = enriched.length;
    const invoices = enriched.slice((page - 1) * limit, page * limit);
    res.json({ invoices, counts, ...buildMeta(total, page, limit) });
  })
);

router.get(
  '/:id',
  requirePermission('invoices.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const inv = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ...include, payments: { orderBy: { paymentDate: 'asc' } } },
    });
    if (!inv) throw ApiError.notFound('فاکتور یافت نشد');
    const fin = await loadFinance(prisma, tenantId);
    const paid = fin.supplierInvoicePaid(inv);
    res.json({ invoice: { ...inv, status: fin.invoiceAutoStatus(inv), paidAmount: paid, remainingAmount: Math.max(0, Number(inv.totalAmount) - paid) } });
  })
);

function totals(body: { netAmount?: number; vatAmount?: number }) {
  const net = body.netAmount ?? 0;
  const vat = body.vatAmount ?? 0;
  return { net, vat, total: net + vat };
}

router.post(
  '/',
  requirePermission('invoices.create'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const body = req.body as z.infer<typeof schema>;
    const { net, vat, total } = totals(body);

    const created = await prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber: body.invoiceNumber,
        requestId: body.requestId ?? null,
        quotationId: body.quotationId ?? null,
        supplierId: body.supplierId ?? null,
        invoiceDate: body.invoiceDate ?? new Date(),
        dueDate: body.dueDate,
        netAmount: net,
        vatAmount: vat,
        totalAmount: total,
        status: body.status ?? INVOICE_STATUS.WAIT_APPROVE,
        budgetId: body.budgetId ?? null,
        batch: body.batch ?? null,
        accountingReference: body.accountingReference ?? null,
        accountingNotes: body.accountingNotes ?? null,
        sentToAccounting: body.sentToAccounting ?? false,
        accountingSubmissionDate: body.accountingSubmissionDate ?? null,
        followUpDate: body.followUpDate ?? null,
        notes: body.notes ?? null,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
        installments: body.installments?.length
          ? { create: body.installments.map((i) => ({ tenantId, amount: i.amount, percent: i.percent ?? null, monthKey: i.monthKey ?? null, dueDate: i.dueDate ?? null, status: i.status ?? 'در انتظار' })) }
          : undefined,
      },
    });
    await recalcInvoiceStatus(tenantId, created.id);
    const invoice = await prisma.invoice.findUnique({ where: { id: created.id }, include });
    res.status(201).json({ invoice });
  })
);

// POST /api/:tenantId/invoices/bulk-accounting — bulk set sentToAccounting on multiple invoices
router.post(
  '/bulk-accounting',
  requirePermission('invoices.edit'),
  validate(z.object({ ids: z.array(z.string()).min(1), sentToAccounting: z.boolean() })),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const { ids, sentToAccounting } = req.body as { ids: string[]; sentToAccounting: boolean };
    const result = await prisma.invoice.updateMany({
      where: { id: { in: ids }, tenantId },
      data: { sentToAccounting },
    });
    res.json({ updated: result.count });
  })
);

router.patch(
  '/:id',
  requirePermission('invoices.edit'),
  validate(schema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('فاکتور یافت نشد');

    const net = req.body.netAmount ?? Number(existing.netAmount);
    const vat = req.body.vatAmount ?? Number(existing.vatAmount);

    await prisma.$transaction(async (tx) => {
      if (req.body.installments) {
        await tx.installment.deleteMany({ where: { invoiceId: existing.id } });
        if (req.body.installments.length) {
          await tx.installment.createMany({
            data: req.body.installments.map((i: z.infer<typeof installmentSchema>) => ({
              tenantId,
              invoiceId: existing.id,
              amount: i.amount,
              percent: i.percent ?? null,
              monthKey: i.monthKey ?? null,
              dueDate: i.dueDate ?? null,
              status: i.status ?? 'در انتظار',
            })),
          });
        }
      }
      await tx.invoice.update({
        where: { id: existing.id },
        data: {
          invoiceNumber: req.body.invoiceNumber ?? existing.invoiceNumber,
          requestId: req.body.requestId ?? existing.requestId,
          quotationId: req.body.quotationId ?? existing.quotationId,
          supplierId: req.body.supplierId ?? existing.supplierId,
          invoiceDate: req.body.invoiceDate ?? existing.invoiceDate,
          dueDate: req.body.dueDate ?? existing.dueDate,
          netAmount: net,
          vatAmount: vat,
          totalAmount: net + vat,
          status: req.body.status ?? existing.status,
          budgetId: req.body.budgetId === undefined ? existing.budgetId : req.body.budgetId,
          batch: req.body.batch ?? existing.batch,
          accountingReference: req.body.accountingReference ?? existing.accountingReference,
          accountingNotes: req.body.accountingNotes ?? existing.accountingNotes,
          sentToAccounting: req.body.sentToAccounting ?? existing.sentToAccounting,
          accountingSubmissionDate: req.body.accountingSubmissionDate ?? existing.accountingSubmissionDate,
          followUpDate: req.body.followUpDate ?? existing.followUpDate,
          notes: req.body.notes ?? existing.notes,
          updatedById: req.auth!.userId,
        },
      });
    });
    await recalcInvoiceStatus(tenantId, existing.id);
    const invoice = await prisma.invoice.findUnique({ where: { id: existing.id }, include });
    res.json({ invoice });
  })
);

router.delete(
  '/:id',
  requirePermission('invoices.delete'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('فاکتور یافت نشد');
    await prisma.invoice.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

export default router;

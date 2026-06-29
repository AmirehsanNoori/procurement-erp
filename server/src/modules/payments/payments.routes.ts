import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { validate } from '../../middleware/validate';
import { requirePermission, requireAnyPermission } from '../../middleware/requirePermission';
import { recalcInvoiceStatus } from '../invoices/service';
import { loadFinance, INVOICE_STATUS } from '../finance/calc';

const router = Router({ mergeParams: true });

// GET /api/:tenantId/payments/schedule — upcoming/open payments: every invoice
// not yet fully paid, with paid/remaining/installments + advance summary.
router.get(
  '/schedule',
  requirePermission('payments.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const fin = await loadFinance(prisma, tenantId);
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, archived: false },
      include: { supplier: true, request: true, installments: true },
      orderBy: { dueDate: 'asc' },
    });

    const open = invoices
      .map((inv) => {
        const paid = fin.supplierInvoicePaid(inv);
        const total = Number(inv.totalAmount);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          supplier: inv.supplier?.name ?? '—',
          requestNumber: inv.request?.requestNumber ?? '',
          total,
          paid,
          remaining: Math.max(0, total - paid),
          percent: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
          dueDate: inv.dueDate,
          batch: inv.batch,
          status: fin.invoiceAutoStatus(inv),
          installments: inv.installments.map((i) => ({
            amount: Number(i.amount),
            percent: i.percent != null ? Number(i.percent) : null,
            monthKey: i.monthKey,
            dueDate: i.dueDate,
          })),
        };
      })
      .filter((i) => i.status !== INVOICE_STATUS.PAID_FULL);

    const advances = await prisma.quotation.aggregate({
      where: { tenantId, advancePaymentAmount: { gt: 0 } },
      _sum: { advancePaymentAmount: true },
    });
    const totalActual = (await prisma.payment.aggregate({ where: { tenantId }, _sum: { amount: true } }))._sum.amount;

    res.json({
      invoices: open,
      totals: {
        openRemaining: open.reduce((a, i) => a + i.remaining, 0),
        advance: Number(advances._sum.advancePaymentAmount ?? 0),
        actual: Number(totalActual ?? 0),
      },
    });
  })
);

// GET /api/:tenantId/payments — actual payments + advance payments from quotations.
router.get(
  '/',
  requirePermission('payments.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const search = (req.query.search as string | undefined)?.trim()?.toLowerCase();
    const fromDate = req.query.from ? new Date(req.query.from as string) : null;
    const toDate = req.query.to ? new Date(req.query.to as string) : null;

    const [payments, quotations, invoices] = await Promise.all([
      prisma.payment.findMany({ where: { tenantId }, orderBy: { paymentDate: 'desc' } }),
      prisma.quotation.findMany({ where: { tenantId, advancePaymentAmount: { gt: 0 } }, include: { supplier: true, request: true } }),
      prisma.invoice.findMany({ where: { tenantId }, include: { supplier: true, request: true } }),
    ]);
    const invById = new Map(invoices.map((i) => [i.id, i]));

    const actual = payments.map((p) => {
      const inv = invById.get(p.invoiceId);
      return {
        id: p.id,
        type: 'invoice' as const,
        date: p.paymentDate,
        amount: Number(p.amount),
        listNumber: p.paymentListNumber,
        reference: p.reference,
        notes: p.notes,
        supplier: inv?.supplier?.name ?? '—',
        docNumber: inv?.invoiceNumber ?? '—',
        requestNumber: inv?.request?.requestNumber ?? '',
        invoiceId: p.invoiceId,
      };
    });

    const advances = quotations.map((q) => ({
      id: `adv-${q.id}`,
      type: 'advance' as const,
      date: q.advancePaymentDate ?? q.date,
      amount: Number(q.advancePaymentAmount),
      listNumber: q.paymentBatchNumber,
      reference: q.accountingReference,
      notes: q.notes,
      supplier: q.supplier?.name ?? '—',
      docNumber: q.quotationNumber ?? q.id.slice(-5),
      requestNumber: q.request?.requestNumber ?? '',
      quotationId: q.id,
    }));

    let rows = [...advances, ...actual].sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : 0;
      const bd = b.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    });
    if (search) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search));
    if (fromDate || toDate) {
      rows = rows.filter((r) => {
        if (!r.date) return false;
        const d = r.date as Date;
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });
    }

    const totalActual = actual.reduce((a, p) => a + p.amount, 0);
    const totalAdvance = advances.reduce((a, p) => a + p.amount, 0);
    res.json({ payments: rows, totals: { actual: totalActual, advance: totalAdvance } });
  })
);

// POST /api/:tenantId/payments — register a payment against an invoice.
router.post(
  '/',
  requireAnyPermission('payments.register_payment', 'payments.create'),
  validate(
    z.object({
      invoiceId: z.string().min(1),
      paymentDate: z.coerce.date().optional(),
      amount: z.coerce.number().positive(),
      paymentListNumber: z.string().optional().nullable(),
      reference: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
  ),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const body = req.body as { invoiceId: string; paymentDate?: Date; amount: number; paymentListNumber?: string; reference?: string; notes?: string };
    const inv = await prisma.invoice.findFirst({ where: { id: body.invoiceId, tenantId } });
    if (!inv) throw ApiError.notFound('فاکتور یافت نشد');

    const payment = await prisma.payment.create({
      data: {
        tenantId,
        invoiceId: inv.id,
        paymentDate: body.paymentDate ?? new Date(),
        amount: body.amount,
        paymentListNumber: body.paymentListNumber ?? null,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        createdById: req.auth!.userId,
      },
    });
    const status = await recalcInvoiceStatus(tenantId, inv.id);
    res.status(201).json({ payment, invoiceStatus: status });
  })
);

router.patch(
  '/:id',
  requirePermission('payments.delete'),
  validate(
    z.object({
      paymentDate: z.coerce.date().optional().nullable(),
      paymentListNumber: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
  ),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.payment.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('پرداخت یافت نشد');
    const payment = await prisma.payment.update({
      where: { id: existing.id },
      data: {
        ...(req.body.paymentDate !== undefined ? { paymentDate: req.body.paymentDate } : {}),
        ...(req.body.paymentListNumber !== undefined ? { paymentListNumber: req.body.paymentListNumber } : {}),
        ...(req.body.notes !== undefined ? { notes: req.body.notes } : {}),
      },
    });
    await recalcInvoiceStatus(tenantId, existing.invoiceId);
    res.json({ payment });
  })
);

router.delete(
  '/:id',
  requirePermission('payments.delete'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const existing = await prisma.payment.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw ApiError.notFound('پرداخت یافت نشد');
    await prisma.payment.delete({ where: { id: existing.id } });
    await recalcInvoiceStatus(tenantId, existing.invoiceId);
    res.json({ ok: true });
  })
);

export default router;

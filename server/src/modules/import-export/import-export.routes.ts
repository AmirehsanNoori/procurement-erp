import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── GET /api/:tenantId/import-export/export ───────────────────────────────────
// Full tenant data dump as JSON — for backup or migration.
router.get(
  '/export',
  requirePermission('import_export.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;

    const [suppliers, requests, budgets, allocations, quotations, invoices, installments, payments, documents] =
      await Promise.all([
        prisma.supplier.findMany({ where: { tenantId } }),
        prisma.request.findMany({ where: { tenantId } }),
        prisma.budget.findMany({ where: { tenantId } }),
        prisma.budgetAllocation.findMany({ where: { budget: { tenantId } } }),
        prisma.quotation.findMany({ where: { tenantId } }),
        prisma.invoice.findMany({ where: { tenantId } }),
        prisma.installment.findMany({ where: { tenantId } }),
        prisma.payment.findMany({ where: { tenantId } }),
        prisma.document.findMany({ where: { tenantId } }),
      ]);

    const bundle = {
      version: '1.0',
      schema: 'aen-erp-export',
      tenantId,
      exportedAt: new Date().toISOString(),
      counts: {
        suppliers: suppliers.length,
        requests: requests.length,
        budgets: budgets.length,
        quotations: quotations.length,
        invoices: invoices.length,
        payments: payments.length,
        documents: documents.length,
      },
      data: {
        suppliers,
        requests,
        budgets,
        budgetAllocations: allocations,
        quotations,
        invoices,
        installments,
        payments,
        documents: documents.map((d) => ({ ...d, storagePath: undefined })),
      },
    };

    const json = JSON.stringify(bundle, null, 2);
    const tenantCode = req.tenant!.tenantCode ?? tenantId.slice(0, 8);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `erp-export-${tenantCode}-${dateStr}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  })
);

// ── POST /api/:tenantId/import-export/import ──────────────────────────────────
// Import from an AEN ERP export bundle (JSON).
// Strategy: upsert by natural key; create if not found.
// Returns a per-entity summary of created / updated / skipped.
router.post(
  '/import',
  requirePermission('import_export.view'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('فایل JSON انتخاب نشده است');

    let bundle: Record<string, unknown>;
    try {
      bundle = JSON.parse(req.file.buffer.toString('utf-8'));
    } catch {
      throw ApiError.badRequest('فایل JSON نامعتبر است');
    }

    if (bundle.schema !== 'aen-erp-export') {
      throw ApiError.badRequest('فرمت فایل پشتیبانی نمی‌شود. فقط فایل‌های صادرشده از همین سیستم قابل وارد کردن هستند.');
    }

    const tenantId = req.tenant!.tenantId;
    const data = bundle.data as Record<string, unknown[]>;

    const result = {
      suppliers: { created: 0, updated: 0, skipped: 0 },
      requests: { created: 0, updated: 0, skipped: 0 },
      budgets: { created: 0, updated: 0, skipped: 0 },
      quotations: { created: 0, updated: 0, skipped: 0 },
      invoices: { created: 0, updated: 0, skipped: 0 },
      payments: { created: 0, updated: 0, skipped: 0 },
    };

    // ── Suppliers ─────────────────────────────────────────────────────────────
    const supplierIdMap = new Map<string, string>(); // old ID → new ID
    for (const raw of (data.suppliers ?? []) as Record<string, unknown>[]) {
      const name = String(raw.name ?? '').trim();
      if (!name) { result.suppliers.skipped++; continue; }

      const existing = await prisma.supplier.findFirst({ where: { tenantId, name } });
      if (existing) {
        supplierIdMap.set(String(raw.id), existing.id);
        result.suppliers.updated++;
      } else {
        const created = await prisma.supplier.create({
          data: {
            tenantId,
            name,
            contactPerson: raw.contactPerson as string ?? null,
            phone: raw.phone as string ?? null,
            email: raw.email as string ?? null,
            bankAccount: raw.bankAccount as string ?? null,
            notes: raw.notes as string ?? null,
          },
        });
        supplierIdMap.set(String(raw.id), created.id);
        result.suppliers.created++;
      }
    }

    // ── Budgets ───────────────────────────────────────────────────────────────
    const budgetIdMap = new Map<string, string>();
    for (const raw of (data.budgets ?? []) as Record<string, unknown>[]) {
      const yearJalali = Number(raw.yearJalali);
      const monthJalali = Number(raw.monthJalali);
      if (!yearJalali || !monthJalali) { result.budgets.skipped++; continue; }

      const existing = await prisma.budget.findFirst({ where: { tenantId, yearJalali, monthJalali } });
      if (existing) {
        budgetIdMap.set(String(raw.id), existing.id);
        result.budgets.updated++;
      } else {
        const created = await prisma.budget.create({
          data: {
            tenantId,
            name: raw.name as string ?? null,
            yearJalali,
            monthJalali,
            estimatedCost: Number(raw.estimatedCost ?? 0),
            contingencyPercent: Number(raw.contingencyPercent ?? 0),
            requiredBudget: Number(raw.requiredBudget ?? 0),
            approvedBudget: Number(raw.approvedBudget ?? 0),
            notes: raw.notes as string ?? null,
          },
        });
        budgetIdMap.set(String(raw.id), created.id);
        result.budgets.created++;
      }
    }

    // ── Requests ──────────────────────────────────────────────────────────────
    const requestIdMap = new Map<string, string>();
    for (const raw of (data.requests ?? []) as Record<string, unknown>[]) {
      const requestNumber = String(raw.requestNumber ?? '').trim();
      if (!requestNumber) { result.requests.skipped++; continue; }

      const resolvedSupplierId = raw.supplierId ? supplierIdMap.get(String(raw.supplierId)) : null;
      const existing = await prisma.request.findFirst({ where: { tenantId, requestNumber } });

      if (existing) {
        requestIdMap.set(String(raw.id), existing.id);
        result.requests.updated++;
      } else {
        const created = await prisma.request.create({
          data: {
            tenantId,
            requestNumber,
            orderNo: raw.orderNo as string ?? null,
            title: raw.title as string ?? null,
            description: raw.description as string ?? null,
            category: raw.category as string ?? null,
            status: String(raw.status ?? 'جدید'),
            supplierId: resolvedSupplierId ?? null,
            notes: raw.notes as string ?? null,
            ioidRow: raw.ioidRow ? Number(raw.ioidRow) : null,
            ioidRemark: raw.ioidRemark as string ?? null,
            cost: raw.cost ? Number(raw.cost) : null,
            archived: Boolean(raw.archived),
          },
        });
        requestIdMap.set(String(raw.id), created.id);
        result.requests.created++;
      }
    }

    // ── Quotations ────────────────────────────────────────────────────────────
    const quotationIdMap = new Map<string, string>();
    for (const raw of (data.quotations ?? []) as Record<string, unknown>[]) {
      const quotationNumber = String(raw.quotationNumber ?? '').trim();
      if (!quotationNumber) { result.quotations.skipped++; continue; }

      const resolvedSupplierId = raw.supplierId ? supplierIdMap.get(String(raw.supplierId)) : null;
      const resolvedBudgetId = raw.budgetId ? budgetIdMap.get(String(raw.budgetId)) : null;
      const resolvedRequestId = raw.requestId ? requestIdMap.get(String(raw.requestId)) : null;

      const existing = await prisma.quotation.findFirst({ where: { tenantId, quotationNumber } });
      if (existing) {
        quotationIdMap.set(String(raw.id), existing.id);
        result.quotations.updated++;
      } else {
        const created = await prisma.quotation.create({
          data: {
            tenantId,
            quotationNumber,
            requestId: resolvedRequestId ?? null,
            supplierId: resolvedSupplierId ?? null,
            budgetId: resolvedBudgetId ?? null,
            amount: raw.amount ? Number(raw.amount) : null,
            status: String(raw.status ?? 'در انتظار سفارش'),
            advancePaymentAmount: raw.advancePaymentAmount ? Number(raw.advancePaymentAmount) : null,
            notes: raw.notes as string ?? null,
            archived: Boolean(raw.archived),
          },
        });
        quotationIdMap.set(String(raw.id), created.id);
        result.quotations.created++;
      }
    }

    // ── Invoices ──────────────────────────────────────────────────────────────
    const invoiceIdMap = new Map<string, string>();
    for (const raw of (data.invoices ?? []) as Record<string, unknown>[]) {
      const invoiceNumber = String(raw.invoiceNumber ?? '').trim();
      if (!invoiceNumber) { result.invoices.skipped++; continue; }

      const resolvedSupplierId = raw.supplierId ? supplierIdMap.get(String(raw.supplierId)) : null;
      const resolvedBudgetId = raw.budgetId ? budgetIdMap.get(String(raw.budgetId)) : null;
      const resolvedRequestId = raw.requestId ? requestIdMap.get(String(raw.requestId)) : null;
      const resolvedQuotationId = raw.quotationId ? quotationIdMap.get(String(raw.quotationId)) : null;

      const existing = await prisma.invoice.findFirst({ where: { tenantId, invoiceNumber } });
      if (existing) {
        invoiceIdMap.set(String(raw.id), existing.id);
        result.invoices.updated++;
      } else {
        const created = await prisma.invoice.create({
          data: {
            tenantId,
            invoiceNumber,
            requestId: resolvedRequestId ?? null,
            quotationId: resolvedQuotationId ?? null,
            supplierId: resolvedSupplierId ?? null,
            budgetId: resolvedBudgetId ?? null,
            totalAmount: Number(raw.totalAmount ?? 0),
            netAmount: raw.netAmount ? Number(raw.netAmount) : null,
            vatAmount: raw.vatAmount ? Number(raw.vatAmount) : null,
            status: String(raw.status ?? 'در انتظار بودجه'),
            notes: raw.notes as string ?? null,
            archived: Boolean(raw.archived),
          },
        });
        invoiceIdMap.set(String(raw.id), created.id);
        result.invoices.created++;
      }
    }

    // ── Payments ──────────────────────────────────────────────────────────────
    for (const raw of (data.payments ?? []) as Record<string, unknown>[]) {
      const resolvedInvoiceId = raw.invoiceId ? invoiceIdMap.get(String(raw.invoiceId)) : null;
      if (!resolvedInvoiceId) { result.payments.skipped++; continue; }

      const reference = raw.reference as string ?? null;
      const existing = reference
        ? await prisma.payment.findFirst({ where: { tenantId, reference } })
        : null;

      if (existing) {
        result.payments.updated++;
      } else {
        await prisma.payment.create({
          data: {
            tenantId,
            invoiceId: resolvedInvoiceId,
            amount: Number(raw.amount ?? 0),
            paymentDate: raw.paymentDate ? new Date(raw.paymentDate as string) : null,
            reference: reference,
            paymentListNumber: raw.paymentListNumber as string ?? null,
            notes: raw.notes as string ?? null,
          },
        });
        result.payments.created++;
      }
    }

    res.json({ ok: true, result });
  })
);

export default router;

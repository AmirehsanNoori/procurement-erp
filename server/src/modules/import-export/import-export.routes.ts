import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';
import { jalaliStr } from '../../lib/jalali';

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

// ── GET /api/:tenantId/import-export/excel/:store ─────────────────────────────
// Per-store Excel (.xlsx) export with Persian headers and Jalali dates, mirroring
// the prototype's exportExcelStore. Supported stores: requests, quotations,
// invoices, payments, suppliers, tasks.
const EXCEL_STORES = ['requests', 'quotations', 'invoices', 'payments', 'suppliers', 'tasks'] as const;
type ExcelStore = (typeof EXCEL_STORES)[number];

async function buildExcelRows(tenantId: string, store: ExcelStore): Promise<Record<string, unknown>[]> {
  switch (store) {
    case 'requests': {
      const rows = await prisma.request.findMany({ where: { tenantId }, include: { supplier: true, assignee: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } });
      return rows.map((r) => ({
        'شماره PQ': r.requestNumber,
        'عنوان': r.title ?? '',
        'شرح': r.description ?? '',
        'دسته': r.category ?? '',
        'تاریخ درخواست': jalaliStr(r.requestDate),
        'مبلغ تخمینی': r.estimatedAmount != null ? Number(r.estimatedAmount) : '',
        'تأمین‌کننده': r.supplier?.name ?? '',
        'مسئول': r.assignee?.fullName ?? '',
        'وضعیت': r.status,
        'تاریخ پیگیری': jalaliStr(r.followUpDate),
        'تاریخ تحویل': jalaliStr(r.deliveryDate),
        'آرشیو': r.archived ? 'بله' : 'خیر',
      }));
    }
    case 'quotations': {
      const rows = await prisma.quotation.findMany({ where: { tenantId }, include: { supplier: true, request: true, budget: true }, orderBy: { createdAt: 'desc' } });
      return rows.map((q) => ({
        'شماره پیش‌فاکتور': q.quotationNumber ?? '',
        'تأمین‌کننده': q.supplier?.name ?? '',
        'شماره PQ': q.request?.requestNumber ?? '',
        'تاریخ': jalaliStr(q.date),
        'مبلغ': q.amount != null ? Number(q.amount) : '',
        'ارز': q.currency,
        'پیش‌پرداخت': q.advancePaymentAmount != null ? Number(q.advancePaymentAmount) : '',
        'وضعیت': q.status,
        'بودجه': q.budget?.name ?? '',
        'دسته پرداخت': q.paymentBatchNumber ?? '',
        'تاریخ پیگیری': jalaliStr(q.followUpDate),
        'تاریخ تحویل': jalaliStr(q.deliveryDate),
        'آرشیو': q.archived ? 'بله' : 'خیر',
      }));
    }
    case 'invoices': {
      const rows = await prisma.invoice.findMany({ where: { tenantId }, include: { supplier: true, request: true, budget: true }, orderBy: { createdAt: 'desc' } });
      return rows.map((i) => ({
        'شماره فاکتور': i.invoiceNumber,
        'شماره PQ': i.request?.requestNumber ?? '',
        'تأمین‌کننده': i.supplier?.name ?? '',
        'تاریخ فاکتور': jalaliStr(i.invoiceDate),
        'سررسید': jalaliStr(i.dueDate),
        'مبلغ خالص': i.netAmount != null ? Number(i.netAmount) : '',
        'مالیات': i.vatAmount != null ? Number(i.vatAmount) : '',
        'جمع کل': Number(i.totalAmount),
        'وضعیت': i.status,
        'بودجه': i.budget?.name ?? '',
        'دسته پرداخت': i.batch ?? '',
        'رفرنس حسابداری': i.accountingReference ?? '',
        'آرشیو': i.archived ? 'بله' : 'خیر',
      }));
    }
    case 'payments': {
      const rows = await prisma.payment.findMany({ where: { tenantId }, include: { invoice: { include: { supplier: true } } }, orderBy: { paymentDate: 'desc' } });
      return rows.map((p) => ({
        'تاریخ پرداخت': jalaliStr(p.paymentDate),
        'شماره فاکتور': p.invoice?.invoiceNumber ?? '',
        'تأمین‌کننده': p.invoice?.supplier?.name ?? '',
        'شماره لیست': p.paymentListNumber ?? '',
        'مبلغ': Number(p.amount),
        'مرجع': p.reference ?? '',
        'یادداشت': p.notes ?? '',
      }));
    }
    case 'suppliers': {
      const rows = await prisma.supplier.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
      return rows.map((s) => ({
        'نام': s.name,
        'شخص تماس': s.contactPerson ?? '',
        'تلفن': s.phone ?? '',
        'ایمیل': s.email ?? '',
        'حساب بانکی': s.bankAccount ?? '',
        'یادداشت': s.notes ?? '',
      }));
    }
    case 'tasks': {
      const rows = await prisma.task.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      return rows.map((tk) => ({
        'عنوان': tk.title,
        'توضیحات': tk.description ?? '',
        'اولویت': tk.priority,
        'وضعیت': tk.status,
        'سررسید': jalaliStr(tk.dueDate),
        'تاریخ پیگیری': jalaliStr(tk.followUpDate),
      }));
    }
  }
}

const STORE_LABEL: Record<ExcelStore, string> = {
  requests: 'درخواست‌ها',
  quotations: 'پیش‌فاکتورها',
  invoices: 'فاکتورها',
  payments: 'پرداخت‌ها',
  suppliers: 'تأمین‌کنندگان',
  tasks: 'وظایف',
};

router.get(
  '/excel/:store',
  requirePermission('import_export.view'),
  asyncHandler(async (req, res) => {
    const store = req.params.store as ExcelStore;
    if (!EXCEL_STORES.includes(store)) throw ApiError.badRequest('بخش نامعتبر است');
    const tenantId = req.tenant!.tenantId;

    const rows = await buildExcelRows(tenantId, store);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '—': 'بدون داده' }]);
    XLSX.utils.book_append_sheet(wb, ws, STORE_LABEL[store]);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const dateStr = jalaliStr(new Date()).replace(/\//g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="${store}-${dateStr}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
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

// ── POST /api/:tenantId/import-export/clear ───────────────────────────────────
// Wipe ALL business data for this tenant (irreversible). Tenant config, users,
// roles and billing are preserved so the workspace remains usable. The client
// must send { confirm: "DELETE" } to guard against accidental calls.
router.post(
  '/clear',
  requirePermission('import_export.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    if (req.body?.confirm !== 'DELETE') {
      throw ApiError.badRequest('برای پاک‌سازی باید تأییدیه ارسال شود');
    }

    // Child → parent order; cascades cover ExpenseItem and ApprovalVote.
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { tenantId } }),
      prisma.installment.deleteMany({ where: { tenantId } }),
      prisma.invoice.deleteMany({ where: { tenantId } }),
      prisma.quotation.deleteMany({ where: { tenantId } }),
      prisma.budgetAllocation.deleteMany({ where: { tenantId } }),
      prisma.budget.deleteMany({ where: { tenantId } }),
      prisma.correspondence.deleteMany({ where: { tenantId } }),
      prisma.expenseReport.deleteMany({ where: { tenantId } }),
      prisma.approvalInstance.deleteMany({ where: { tenantId } }),
      prisma.blanketOrder.deleteMany({ where: { tenantId } }),
      prisma.supplierInteraction.deleteMany({ where: { tenantId } }),
      prisma.supplierContact.deleteMany({ where: { tenantId } }),
      prisma.document.deleteMany({ where: { tenantId } }),
      prisma.timelineEvent.deleteMany({ where: { tenantId } }),
      prisma.notification.deleteMany({ where: { tenantId } }),
      prisma.task.deleteMany({ where: { tenantId } }),
      prisma.request.deleteMany({ where: { tenantId } }),
      prisma.supplier.deleteMany({ where: { tenantId } }),
    ]);

    res.json({ ok: true });
  })
);

export default router;

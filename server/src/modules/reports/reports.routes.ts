import { Router } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../../lib/prisma';
import { ApiError, asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';
import { loadFinance, requiredBudget, num, INVOICE_STATUS } from '../finance/calc';
import { jalaliStr, jalaliMonthName } from '../../lib/jalali';

const router = Router({ mergeParams: true });

const REPORT_TYPES = ['invoices', 'overdue', 'budget', 'suppliers', 'schedule', 'kpi'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

interface ReportResult {
  columns: string[];
  rows: Record<string, string | number>[];
  kpis?: { label: string; value: number }[];
}

/**
 * Build one of the prototype's report types. Filters (supplier/status/date) apply
 * to invoice-based reports; budget/kpi reports summarise the whole portfolio.
 */
async function buildReport(tenantId: string, type: ReportType, filters: { supplier?: string; status?: string; from?: Date; to?: Date }): Promise<ReportResult> {
  const fin = await loadFinance(prisma, tenantId);

  if (type === 'invoices' || type === 'overdue' || type === 'schedule') {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId },
      include: { supplier: true },
      orderBy: { dueDate: 'asc' },
    });
    let rows = invoices.map((inv) => {
      const paid = fin.supplierInvoicePaid(inv);
      const total = num(inv.totalAmount);
      return {
        inv,
        status: fin.invoiceAutoStatus(inv),
        paid,
        total,
        remaining: Math.max(0, total - paid),
      };
    });
    if (filters.supplier) rows = rows.filter((r) => r.inv.supplier?.name === filters.supplier);
    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    if (filters.from) rows = rows.filter((r) => r.inv.invoiceDate && r.inv.invoiceDate >= filters.from!);
    if (filters.to) rows = rows.filter((r) => r.inv.invoiceDate && r.inv.invoiceDate <= filters.to!);

    const now = new Date();
    if (type === 'overdue') rows = rows.filter((r) => r.inv.dueDate && r.inv.dueDate < now && r.status !== INVOICE_STATUS.PAID_FULL);
    if (type === 'schedule') rows = rows.filter((r) => r.status !== INVOICE_STATUS.PAID_FULL);

    return {
      columns: ['شماره فاکتور', 'تاریخ', 'تأمین‌کننده', 'جمع کل', 'پرداخت‌شده', 'مانده', 'وضعیت', 'سررسید', 'دسته'],
      rows: rows.map((r) => ({
        'شماره فاکتور': r.inv.invoiceNumber,
        'تاریخ': jalaliStr(r.inv.invoiceDate),
        'تأمین‌کننده': r.inv.supplier?.name ?? '—',
        'جمع کل': r.total,
        'پرداخت‌شده': r.paid,
        'مانده': r.remaining,
        'وضعیت': r.status,
        'سررسید': jalaliStr(r.inv.dueDate),
        'دسته': r.inv.batch ?? '—',
      })),
    };
  }

  if (type === 'budget') {
    const budgets = fin.budgets
      .slice()
      .sort((a, b) => a.yearJalali * 100 + a.monthJalali - (b.yearJalali * 100 + b.monthJalali));
    return {
      columns: ['بودجه', 'ماه شمسی', 'مبلغ تأییدشده', 'رزرو شده', 'پرداخت واقعی', 'باقیمانده'],
      rows: budgets.map((b) => {
        const s = fin.budgetSummary(b);
        return {
          'بودجه': b.name || `${jalaliMonthName(b.monthJalali)} ${b.yearJalali}`,
          'ماه شمسی': `${jalaliMonthName(b.monthJalali)} ${b.yearJalali}`,
          'مبلغ تأییدشده': s.approved,
          'رزرو شده': s.reserved,
          'پرداخت واقعی': s.actual,
          'باقیمانده': s.remaining,
        };
      }),
    };
  }

  if (type === 'suppliers') {
    const suppliers = await prisma.supplier.findMany({ where: { tenantId }, include: { invoices: true } });
    return {
      columns: ['تأمین‌کننده', 'تعداد فاکتور', 'جمع کل', 'پرداخت‌شده', 'مانده'],
      rows: suppliers.map((s) => {
        const total = s.invoices.reduce((a, i) => a + num(i.totalAmount), 0);
        const paid = s.invoices.reduce((a, i) => a + fin.supplierInvoicePaid(i), 0);
        return {
          'تأمین‌کننده': s.name,
          'تعداد فاکتور': s.invoices.length,
          'جمع کل': total,
          'پرداخت‌شده': paid,
          'مانده': Math.max(0, total - paid),
        };
      }),
    };
  }

  // kpi
  const need = fin.budgets.reduce((a, b) => a + requiredBudget(b), 0);
  const approved = fin.budgets.reduce((a, b) => a + num(b.approvedBudget), 0);
  const actual = fin.budgets.reduce((a, b) => a + fin.actualPaidForBudget(b), 0);
  return {
    columns: ['شاخص', 'مقدار'],
    rows: [
      { 'شاخص': 'بودجه مورد نیاز', 'مقدار': need },
      { 'شاخص': 'بودجه تأیید شده', 'مقدار': approved },
      { 'شاخص': 'هزینه واقعی', 'مقدار': actual },
      { 'شاخص': 'صرفه‌جویی / مانده', 'مقدار': approved - actual },
    ],
    kpis: [
      { label: 'بودجه مورد نیاز', value: need },
      { label: 'بودجه تأیید شده', value: approved },
      { label: 'هزینه واقعی', value: actual },
      { label: 'صرفه‌جویی / مانده', value: approved - actual },
    ],
  };
}

// GET /api/:tenantId/reports/run?type=&supplier=&status=&from=&to=&format=
router.get(
  '/run',
  requirePermission('reports.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const type = (req.query.type as ReportType) || 'invoices';
    if (!REPORT_TYPES.includes(type)) throw ApiError.badRequest('نوع گزارش نامعتبر است');

    const filters = {
      supplier: (req.query.supplier as string) || undefined,
      status: (req.query.status as string) || undefined,
      from: req.query.from ? new Date(req.query.from as string) : undefined,
      to: req.query.to ? new Date(req.query.to as string) : undefined,
    };

    const result = await buildReport(tenantId, type, filters);

    if (req.query.format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.rows.length ? result.rows : [{ '—': 'بدون داده' }]);
      XLSX.utils.book_append_sheet(wb, ws, 'گزارش');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      const dateStr = jalaliStr(new Date()).replace(/\//g, '-');
      res.setHeader('Content-Disposition', `attachment; filename="report-${type}-${dateStr}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
      return;
    }

    res.json(result);
  })
);

export default router;

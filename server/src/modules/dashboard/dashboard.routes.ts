import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';
import { loadFinance, num, INVOICE_STATUS } from '../finance/calc';

const router = Router({ mergeParams: true });

// ── GET /api/:tenantId/dashboard ─────────────────────────────────────────────
router.get(
  '/',
  requirePermission('dashboard.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;

    const [fin, reqCount, quoteCount, invCount, suppCount, docCount, unreadCount] =
      await Promise.all([
        loadFinance(prisma, tenantId),
        prisma.request.count({ where: { tenantId, archived: false } }),
        prisma.quotation.count({ where: { tenantId, archived: false } }),
        prisma.invoice.count({ where: { tenantId, archived: false } }),
        prisma.supplier.count({ where: { tenantId } }),
        prisma.document.count({ where: { tenantId } }),
        prisma.notification.count({ where: { tenantId, isRead: false } }),
      ]);

    // Invoice status breakdown using live derived status
    const invoiceBreakdown: Record<string, number> = {
      [INVOICE_STATUS.WAIT_BUDGET]: 0,
      [INVOICE_STATUS.WAIT_APPROVE]: 0,
      [INVOICE_STATUS.APPROVED]: 0,
      [INVOICE_STATUS.READY]: 0,
      [INVOICE_STATUS.PARTIAL]: 0,
      [INVOICE_STATUS.PAID_FULL]: 0,
      'کنسل شده': 0,
    };
    for (const inv of fin.invoices) {
      if (!inv.archived) {
        const status = fin.invoiceAutoStatus(inv);
        invoiceBreakdown[status] = (invoiceBreakdown[status] ?? 0) + 1;
      }
    }

    // Budget summaries with burn metrics
    const budgets = fin.budgets
      .sort((a, b) => {
        if (a.yearJalali !== b.yearJalali) return b.yearJalali - a.yearJalali;
        return b.monthJalali - a.monthJalali;
      })
      .slice(0, 6)
      .map((b) => {
        const s = fin.budgetSummary(b);
        return {
          id: b.id,
          name: b.name,
          yearJalali: b.yearJalali,
          monthJalali: b.monthJalali,
          ...s,
        };
      });

    // Overdue invoices (dueDate < today, still unpaid)
    const today = new Date();
    const overdueInvoices = fin.invoices
      .filter((inv) => {
        if (inv.archived) return false;
        if (!inv.dueDate) return false;
        const status = fin.invoiceAutoStatus(inv);
        if (status === INVOICE_STATUS.PAID_FULL || status === 'کنسل شده') return false;
        return new Date(inv.dueDate) < today;
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 8);

    // Enrich overdue with supplier names
    const supplierIds = [...new Set(overdueInvoices.map((i) => i.supplierId).filter(Boolean) as string[])];
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true },
    });
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

    const overdueList = overdueInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      dueDate: inv.dueDate,
      supplier: inv.supplierId ? (supplierMap.get(inv.supplierId) ?? '—') : '—',
      total: num(inv.totalAmount),
      paid: fin.supplierInvoicePaid(inv),
      remaining: num(inv.totalAmount) - fin.supplierInvoicePaid(inv),
      status: fin.invoiceAutoStatus(inv),
    }));

    // Payment totals
    const totalActualPaid = fin.payments.reduce((a, p) => a + num(p.amount), 0);
    const totalAdvance = fin.quotations.reduce((a, q) => a + num(q.advancePaymentAmount), 0);

    res.json({
      summary: {
        requests: reqCount,
        quotations: quoteCount,
        invoices: invCount,
        suppliers: suppCount,
        documents: docCount,
        unreadNotifications: unreadCount,
      },
      invoiceBreakdown,
      budgets,
      overdueInvoices: overdueList,
      payments: {
        actual: totalActualPaid,
        advance: totalAdvance,
        total: totalActualPaid + totalAdvance,
      },
    });
  })
);

// ── GET /api/:tenantId/dashboard/executive ────────────────────────────────────
router.get(
  '/executive',
  requirePermission('executive_dashboard.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;

    const [fin, reqNewCount, reqArchivedCount, invCount, suppCount, docCount] =
      await Promise.all([
        loadFinance(prisma, tenantId),
        prisma.request.count({ where: { tenantId, archived: false } }),
        prisma.request.count({ where: { tenantId, archived: true } }),
        prisma.invoice.count({ where: { tenantId, archived: false } }),
        prisma.supplier.count({ where: { tenantId } }),
        prisma.document.count({ where: { tenantId } }),
      ]);

    // Portfolio totals
    let totalApproved = 0;
    let totalReserved = 0;
    let totalActualBudget = 0;

    const allBudgets = fin.budgets
      .sort((a, b) => {
        if (a.yearJalali !== b.yearJalali) return b.yearJalali - a.yearJalali;
        return b.monthJalali - a.monthJalali;
      })
      .map((b) => {
        const s = fin.budgetSummary(b);
        totalApproved += s.approved;
        totalReserved += s.reserved;
        totalActualBudget += s.actual;
        return {
          id: b.id,
          name: b.name,
          yearJalali: b.yearJalali,
          monthJalali: b.monthJalali,
          ...s,
        };
      });

    // Per-supplier payment summary
    const supplierPayments: Record<string, number> = {};
    for (const p of fin.payments) {
      const inv = fin.invoices.find((i) => i.id === p.invoiceId);
      if (inv?.supplierId) {
        supplierPayments[inv.supplierId] = (supplierPayments[inv.supplierId] ?? 0) + num(p.amount);
      }
    }
    const supplierIds = Object.keys(supplierPayments);
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
      : [];
    const topSuppliers = suppliers
      .map((s) => ({ id: s.id, name: s.name, paid: supplierPayments[s.id] ?? 0 }))
      .sort((a, b) => b.paid - a.paid)
      .slice(0, 5);

    // Overdue count and amount
    const today = new Date();
    let overdueCount = 0;
    let overdueAmount = 0;
    for (const inv of fin.invoices) {
      if (inv.archived || !inv.dueDate) continue;
      const status = fin.invoiceAutoStatus(inv);
      if (status === INVOICE_STATUS.PAID_FULL || status === 'کنسل شده') continue;
      if (new Date(inv.dueDate) < today) {
        overdueCount++;
        overdueAmount += num(inv.totalAmount) - fin.supplierInvoicePaid(inv);
      }
    }

    // Invoice status breakdown
    const invoiceBreakdown: Record<string, number> = {};
    for (const inv of fin.invoices) {
      if (!inv.archived) {
        const s = fin.invoiceAutoStatus(inv);
        invoiceBreakdown[s] = (invoiceBreakdown[s] ?? 0) + 1;
      }
    }

    // Monthly spending trend (last 12 months by payment date)
    const monthlySpend: Record<string, number> = {};
    for (const p of fin.payments) {
      if (!p.paymentDate) continue;
      const d = new Date(p.paymentDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlySpend[key] = (monthlySpend[key] ?? 0) + num(p.amount);
    }
    // Last 12 months
    const now = new Date();
    const spendTrend = Array.from({ length: 12 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { month: key, amount: monthlySpend[key] ?? 0 };
    });

    // Request status distribution
    const requestStats = await prisma.request.groupBy({
      by: ['status'],
      where: { tenantId, archived: false },
      _count: { status: true },
    });

    res.json({
      portfolio: {
        totalApproved,
        totalReserved,
        totalActual: totalActualBudget,
        totalRemaining: totalApproved - totalReserved - totalActualBudget,
        burnPercent: totalApproved > 0
          ? Math.round(((totalReserved + totalActualBudget) / totalApproved) * 100)
          : 0,
      },
      budgets: allBudgets,
      overdueCount,
      overdueAmount,
      topSuppliers,
      invoiceBreakdown,
      spendTrend,
      requestStats: requestStats.map((r) => ({ status: r.status, count: r._count.status })),
      summary: {
        requests: reqNewCount,
        requestsArchived: reqArchivedCount,
        invoices: invCount,
        suppliers: suppCount,
        documents: docCount,
      },
    });
  })
);

export default router;

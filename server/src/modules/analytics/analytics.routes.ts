import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';
import { loadFinance, num, INVOICE_STATUS } from '../finance/calc';
import { dateToJalali } from '../../lib/jalali';

const router = Router({ mergeParams: true });

// ── GET /api/:tenantId/analytics ──────────────────────────────────────────────
router.get(
  '/',
  requirePermission('analytics_forecast.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const fin = await loadFinance(prisma, tenantId);
    const today = new Date();

    // ── Monthly payment trend (last 12 months) ─────────────────────────────
    const monthlyPayments: Record<string, number> = {};
    for (const p of fin.payments) {
      if (!p.paymentDate) continue;
      const [jy, jm] = dateToJalali(new Date(p.paymentDate));
      const key = `${jy}-${String(jm).padStart(2, '0')}`;
      monthlyPayments[key] = (monthlyPayments[key] ?? 0) + num(p.amount);
    }

    // ── Monthly invoice creation trend ────────────────────────────────────
    const monthlyInvoices: Record<string, number> = {};
    for (const inv of fin.invoices) {
      const [jy, jm] = dateToJalali(new Date(inv.createdAt));
      const key = `${jy}-${String(jm).padStart(2, '0')}`;
      monthlyInvoices[key] = (monthlyInvoices[key] ?? 0) + 1;
    }

    // ── Invoice aging (days since creation, open only) ────────────────────
    const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    for (const inv of fin.invoices) {
      if (inv.archived) continue;
      const status = fin.invoiceAutoStatus(inv);
      if (status === INVOICE_STATUS.PAID_FULL || status === 'کنسل شده') continue;
      const days = Math.floor((today.getTime() - new Date(inv.createdAt).getTime()) / 86_400_000);
      if (days <= 30) aging.d0_30++;
      else if (days <= 60) aging.d31_60++;
      else if (days <= 90) aging.d61_90++;
      else aging.d90plus++;
    }

    // ── Budget burn trajectory per month ──────────────────────────────────
    const budgetTrend = fin.budgets
      .sort((a, b) => a.yearJalali !== b.yearJalali ? a.yearJalali - b.yearJalali : a.monthJalali - b.monthJalali)
      .map((b) => {
        const s = fin.budgetSummary(b);
        return {
          key: `${b.yearJalali}-${String(b.monthJalali).padStart(2, '0')}`,
          yearJalali: b.yearJalali,
          monthJalali: b.monthJalali,
          name: b.name ?? null,
          approved: s.approved,
          actual: s.actual,
          reserved: s.reserved,
          remaining: s.remaining,
          burnPercent: s.burnPercent,
        };
      });

    // ── Payment pace & forecast ────────────────────────────────────────────
    // Average monthly spend over last 3 months with data
    const sortedMonths = Object.entries(monthlyPayments).sort(([a], [b]) => a.localeCompare(b));
    const recentMonths = sortedMonths.slice(-3);
    const avgMonthlySpend = recentMonths.length
      ? recentMonths.reduce((a, [, v]) => a + v, 0) / recentMonths.length
      : 0;

    // Total remaining approved budget
    const totalApproved = fin.budgets.reduce((a, b) => a + num(b.approvedBudget), 0);
    const totalSpent = fin.payments.reduce((a, p) => a + num(p.amount), 0);
    const totalRemaining = totalApproved - totalSpent;
    const monthsToExhaust = avgMonthlySpend > 0 ? Math.round(totalRemaining / avgMonthlySpend) : null;

    // ── Top invoice categories (by request category) ──────────────────────
    const requests = await prisma.request.findMany({
      where: { tenantId },
      select: { id: true, category: true },
    });
    const categoryMap = new Map(requests.map((r) => [r.id, r.category]));

    const spendByCategory: Record<string, number> = {};
    for (const inv of fin.invoices) {
      const cat = (inv.requestId ? categoryMap.get(inv.requestId) : null) ?? 'دسته‌بندی نشده';
      spendByCategory[cat] = (spendByCategory[cat] ?? 0) + num(inv.totalAmount);
    }

    const topCategories = Object.entries(spendByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([cat, total]) => ({ category: cat, total }));

    // ── Quotation → Invoice conversion rate ───────────────────────────────
    const totalQuotations = fin.quotations.length;
    const convertedQuotations = fin.quotations.filter((q) =>
      fin.invoices.some((inv) => inv.quotationId === q.id)
    ).length;
    const conversionRate = totalQuotations > 0
      ? Math.round((convertedQuotations / totalQuotations) * 100)
      : 0;

    res.json({
      monthlyPayments: Object.fromEntries(sortedMonths),
      monthlyInvoices,
      aging,
      budgetTrend,
      forecast: {
        avgMonthlySpend,
        totalApproved,
        totalSpent,
        totalRemaining,
        monthsToExhaust,
      },
      topCategories,
      conversionRate: {
        total: totalQuotations,
        converted: convertedQuotations,
        rate: conversionRate,
      },
    });
  })
);

export default router;

import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';
import { loadFinance, num, INVOICE_STATUS } from '../finance/calc';

const router = Router({ mergeParams: true });

type AuditLevel = 'critical' | 'warning' | 'info';

interface AuditIssue {
  entityType: string;
  entityId: string;
  label: string;
  detail: string;
  suggestion: string;
}

interface AuditCheck {
  id: string;
  title: string;
  description: string;
  level: AuditLevel;
  passed: boolean;
  issueCount: number;
  issues: AuditIssue[];
}

// ── GET /api/:tenantId/audit ──────────────────────────────────────────────────
router.get(
  '/',
  requirePermission('erp_audit.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const fin = await loadFinance(prisma, tenantId);
    const today = new Date();
    const checks: AuditCheck[] = [];

    // ─── 1. Invoice status drift ──────────────────────────────────────────────
    {
      const issues: AuditIssue[] = [];
      for (const inv of fin.invoices) {
        if (inv.archived) continue;
        const computed = fin.invoiceAutoStatus(inv);
        if (inv.status !== computed) {
          issues.push({
            entityType: 'invoice',
            entityId: inv.id,
            label: inv.invoiceNumber,
            detail: `وضعیت DB: «${inv.status}» — وضعیت محاسبه‌شده: «${computed}»`,
            suggestion: 'وضعیت را دستی به مقدار محاسبه‌شده بروزرسانی کنید یا پرداخت‌ها را بررسی کنید.',
          });
        }
      }
      checks.push({
        id: 'invoice_status_drift',
        title: 'یکپارچگی وضعیت فاکتورها',
        description: 'بررسی می‌کند وضعیت ذخیره‌شده با وضعیت محاسبه‌شده از پرداخت‌ها برابر است.',
        level: 'warning',
        passed: issues.length === 0,
        issueCount: issues.length,
        issues,
      });
    }

    // ─── 2. Budget overruns ───────────────────────────────────────────────────
    {
      const issues: AuditIssue[] = [];
      for (const b of fin.budgets) {
        const s = fin.budgetSummary(b);
        if (s.remaining < 0) {
          const label = b.name ?? `${b.monthJalali}/${b.yearJalali}`;
          issues.push({
            entityType: 'budget',
            entityId: b.id,
            label,
            detail: `کسری: ${Math.abs(s.remaining).toLocaleString('fa-IR')} ریال (تصویب: ${s.approved.toLocaleString('fa-IR')}، مصرف: ${(s.reserved + s.actual).toLocaleString('fa-IR')})`,
            suggestion: 'بودجه تصویب‌شده را افزایش دهید یا برخی فاکتورها / پیش‌فاکتورها را به ماه دیگری منتقل کنید.',
          });
        }
      }
      checks.push({
        id: 'budget_overrun',
        title: 'سقف بودجه',
        description: 'بودجه‌هایی که مجموع رزرو + مصرف از بودجه تصویب‌شده بیشتر است.',
        level: 'critical',
        passed: issues.length === 0,
        issueCount: issues.length,
        issues,
      });
    }

    // ─── 3. Payment overrun (paid > invoice total) ────────────────────────────
    {
      const issues: AuditIssue[] = [];
      for (const inv of fin.invoices) {
        const paid = fin.supplierInvoicePaid(inv);
        const total = num(inv.totalAmount);
        if (total > 0 && paid > total + 1) {
          issues.push({
            entityType: 'invoice',
            entityId: inv.id,
            label: inv.invoiceNumber,
            detail: `مبلغ فاکتور: ${total.toLocaleString('fa-IR')} — مبلغ پرداختی: ${paid.toLocaleString('fa-IR')} (مازاد: ${(paid - total).toLocaleString('fa-IR')})`,
            suggestion: 'پرداخت‌های مازاد را بررسی و در صورت لزوم حذف کنید.',
          });
        }
      }
      checks.push({
        id: 'payment_overrun',
        title: 'پرداخت مازاد بر فاکتور',
        description: 'فاکتورهایی که مجموع پرداخت‌ها از مبلغ فاکتور بیشتر است.',
        level: 'critical',
        passed: issues.length === 0,
        issueCount: issues.length,
        issues,
      });
    }

    // ─── 4. Quotations with converted invoice not archived ────────────────────
    {
      const issues: AuditIssue[] = [];
      for (const q of fin.quotations) {
        if (q.archived) continue;
        const hasConvertedInvoice = fin.invoices.some(
          (inv) => inv.quotationId === q.id && !inv.archived
        );
        if (hasConvertedInvoice) {
          issues.push({
            entityType: 'quotation',
            entityId: q.id,
            label: q.quotationNumber ?? q.id.slice(0, 8),
            detail: 'پیش‌فاکتور به فاکتور تبدیل شده اما هنوز بایگانی نشده است.',
            suggestion: 'پیش‌فاکتور را بایگانی کنید تا در گزارش‌های فعال نمایش داده نشود.',
          });
        }
      }
      checks.push({
        id: 'unconverted_quotation',
        title: 'پیش‌فاکتورهای تبدیل‌شده بایگانی‌نشده',
        description: 'پیش‌فاکتورهایی که فاکتور معادل دارند ولی خودشان بایگانی نشده‌اند.',
        level: 'info',
        passed: issues.length === 0,
        issueCount: issues.length,
        issues,
      });
    }

    // ─── 5. Invoices without budget for > 7 days ─────────────────────────────
    {
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const issues: AuditIssue[] = [];
      for (const inv of fin.invoices) {
        if (inv.archived) continue;
        const status = fin.invoiceAutoStatus(inv);
        if (
          status !== INVOICE_STATUS.PAID_FULL &&
          status !== 'کنسل شده' &&
          !inv.budgetId &&
          new Date(inv.createdAt) < sevenDaysAgo
        ) {
          issues.push({
            entityType: 'invoice',
            entityId: inv.id,
            label: inv.invoiceNumber,
            detail: `ایجادشده: ${new Date(inv.createdAt).toLocaleDateString('fa-IR')} — بدون بودجه`,
            suggestion: 'فاکتور را به یک بودجه تخصیص دهید.',
          });
        }
      }
      checks.push({
        id: 'invoice_no_budget_stale',
        title: 'فاکتورهای قدیمی بدون بودجه',
        description: 'فاکتورهایی که بیش از ۷ روز است بودجه ندارند و پرداخت نشده‌اند.',
        level: 'warning',
        passed: issues.length === 0,
        issueCount: issues.length,
        issues,
      });
    }

    // ─── 6. Invoices with zero amount ────────────────────────────────────────
    {
      const issues: AuditIssue[] = [];
      for (const inv of fin.invoices) {
        if (inv.archived) continue;
        if (num(inv.totalAmount) === 0) {
          issues.push({
            entityType: 'invoice',
            entityId: inv.id,
            label: inv.invoiceNumber,
            detail: 'مبلغ فاکتور صفر است.',
            suggestion: 'مبلغ فاکتور را وارد کنید.',
          });
        }
      }
      checks.push({
        id: 'invoice_zero_amount',
        title: 'فاکتورهای با مبلغ صفر',
        description: 'فاکتورهای فعال که هنوز مبلغی وارد نشده است.',
        level: 'info',
        passed: issues.length === 0,
        issueCount: issues.length,
        issues,
      });
    }

    // ─── 7. Stale active quotations (> 90 days, no follow-up, not archived) ──
    {
      const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      const issues: AuditIssue[] = [];
      for (const q of fin.quotations) {
        if (q.archived) continue;
        const hasInvoice = fin.invoices.some((inv) => inv.quotationId === q.id);
        if (!hasInvoice && new Date(q.createdAt) < ninetyDaysAgo) {
          issues.push({
            entityType: 'quotation',
            entityId: q.id,
            label: q.quotationNumber ?? q.id.slice(0, 8),
            detail: `ایجادشده: ${new Date(q.createdAt).toLocaleDateString('fa-IR')} — بدون فاکتور و بدون پیگیری`,
            suggestion: 'پیش‌فاکتور را بایگانی کنید یا به فاکتور تبدیل کنید.',
          });
        }
      }
      checks.push({
        id: 'stale_quotation',
        title: 'پیش‌فاکتورهای راکد',
        description: 'پیش‌فاکتورهایی که بیش از ۹۰ روز فعال هستند و هنوز به فاکتور تبدیل نشده‌اند.',
        level: 'info',
        passed: issues.length === 0,
        issueCount: issues.length,
        issues,
      });
    }

    // ─── 8. IOID rows without a linked invoice ───────────────────────────────
    {
      const requests = await prisma.request.findMany({
        where: { tenantId, archived: false },
        select: { id: true, requestNumber: true },
      });
      const invoiceQuoteNos = new Set(
        fin.invoices
          .filter((i) => !i.archived && i.requestId)
          .map((i) => i.requestId)
      );
      const issues: AuditIssue[] = [];
      for (const r of requests) {
        if (!invoiceQuoteNos.has(r.id)) {
          issues.push({
            entityType: 'request',
            entityId: r.id,
            label: r.requestNumber,
            detail: 'هیچ فاکتوری به این درخواست/QUOTE متصل نیست.',
            suggestion: 'پیش‌فاکتور ایجاد کنید و به فاکتور تبدیل کنید یا اگر لغو شده بایگانی کنید.',
          });
        }
      }
      checks.push({
        id: 'ioid_no_invoice',
        title: 'درخواست‌های بدون فاکتور',
        description: 'درخواست‌های فعالی که هنوز فاکتوری به آن‌ها متصل نشده است.',
        level: 'info',
        passed: issues.length === 0,
        issueCount: issues.length,
        issues: issues.slice(0, 50),
      });
    }

    const passCount = checks.filter((c) => c.passed).length;
    const criticalCount = checks.filter((c) => !c.passed && c.level === 'critical').length;
    const warningCount = checks.filter((c) => !c.passed && c.level === 'warning').length;

    res.json({
      summary: {
        total: checks.length,
        passed: passCount,
        failed: checks.length - passCount,
        critical: criticalCount,
        warnings: warningCount,
        healthScore: Math.round((passCount / checks.length) * 100),
      },
      checks,
      runAt: new Date().toISOString(),
    });
  })
);

export default router;

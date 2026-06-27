import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

type DueDateGroup = 'overdue' | 'today' | 'this_week' | 'this_month' | 'future';

interface DueDateItem {
  entityType: 'invoice' | 'quotation' | 'request';
  entityId: string;
  label: string;
  supplier: string;
  dateType: string;
  dateTypeLabel: string;
  date: string;
  daysFromNow: number;
  group: DueDateGroup;
  status: string;
}

function daysDiff(d: Date, today: Date): number {
  const ms = d.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function classify(days: number): DueDateGroup {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'this_week';
  if (days <= 30) return 'this_month';
  return 'future';
}

// ── GET /api/:tenantId/due-dates ──────────────────────────────────────────────
router.get(
  '/',
  requirePermission('due_dates.view'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items: DueDateItem[] = [];

    // ── Invoices ─────────────────────────────────────────────────────────────
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, archived: false },
      include: { supplier: { select: { name: true } } },
    });

    for (const inv of invoices) {
      if (['پرداخت کامل', 'کنسل شده'].includes(inv.status)) continue;

      if (inv.dueDate) {
        const days = daysDiff(new Date(inv.dueDate), today);
        items.push({
          entityType: 'invoice',
          entityId: inv.id,
          label: inv.invoiceNumber,
          supplier: inv.supplier?.name ?? '—',
          dateType: 'dueDate',
          dateTypeLabel: 'سررسید',
          date: inv.dueDate.toISOString(),
          daysFromNow: days,
          group: classify(days),
          status: inv.status,
        });
      }

      if (inv.followUpDate) {
        const days = daysDiff(new Date(inv.followUpDate), today);
        items.push({
          entityType: 'invoice',
          entityId: inv.id,
          label: inv.invoiceNumber,
          supplier: inv.supplier?.name ?? '—',
          dateType: 'followUpDate',
          dateTypeLabel: 'پیگیری',
          date: inv.followUpDate.toISOString(),
          daysFromNow: days,
          group: classify(days),
          status: inv.status,
        });
      }
    }

    // ── Quotations ────────────────────────────────────────────────────────────
    const quotations = await prisma.quotation.findMany({
      where: { tenantId, archived: false },
      include: { supplier: { select: { name: true } } },
    });

    for (const q of quotations) {
      if (q.followUpDate) {
        const days = daysDiff(new Date(q.followUpDate), today);
        items.push({
          entityType: 'quotation',
          entityId: q.id,
          label: q.quotationNumber ?? q.id.slice(0, 8),
          supplier: q.supplier?.name ?? '—',
          dateType: 'followUpDate',
          dateTypeLabel: 'پیگیری',
          date: q.followUpDate.toISOString(),
          daysFromNow: days,
          group: classify(days),
          status: q.status,
        });
      }

      if (q.deliveryDate) {
        const days = daysDiff(new Date(q.deliveryDate), today);
        items.push({
          entityType: 'quotation',
          entityId: q.id,
          label: q.quotationNumber ?? q.id.slice(0, 8),
          supplier: q.supplier?.name ?? '—',
          dateType: 'deliveryDate',
          dateTypeLabel: 'تحویل',
          date: q.deliveryDate.toISOString(),
          daysFromNow: days,
          group: classify(days),
          status: q.status,
        });
      }
    }

    // ── Requests ──────────────────────────────────────────────────────────────
    const requests = await prisma.request.findMany({
      where: { tenantId, archived: false },
      include: { supplier: { select: { name: true } } },
    });

    for (const r of requests) {
      if (r.followUpDate) {
        const days = daysDiff(new Date(r.followUpDate), today);
        items.push({
          entityType: 'request',
          entityId: r.id,
          label: r.requestNumber,
          supplier: r.supplier?.name ?? '—',
          dateType: 'followUpDate',
          dateTypeLabel: 'پیگیری',
          date: r.followUpDate.toISOString(),
          daysFromNow: days,
          group: classify(days),
          status: r.status,
        });
      }

      if (r.deliveryDate) {
        const days = daysDiff(new Date(r.deliveryDate), today);
        items.push({
          entityType: 'request',
          entityId: r.id,
          label: r.requestNumber,
          supplier: r.supplier?.name ?? '—',
          dateType: 'deliveryDate',
          dateTypeLabel: 'تحویل',
          date: r.deliveryDate.toISOString(),
          daysFromNow: days,
          group: classify(days),
          status: r.status,
        });
      }
    }

    // Sort all items: overdue first (most overdue at top), then soonest upcoming
    items.sort((a, b) => a.daysFromNow - b.daysFromNow);

    const grouped = {
      overdue: items.filter((i) => i.group === 'overdue'),
      today: items.filter((i) => i.group === 'today'),
      this_week: items.filter((i) => i.group === 'this_week'),
      this_month: items.filter((i) => i.group === 'this_month'),
      future: items.filter((i) => i.group === 'future'),
    };

    res.json({
      grouped,
      total: items.length,
      overdueCount: grouped.overdue.length,
      todayCount: grouped.today.length,
    });
  })
);

export default router;

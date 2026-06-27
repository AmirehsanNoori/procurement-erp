import { PrismaClient } from '@prisma/client';
import { loadFinance, num, INVOICE_STATUS } from '../finance/calc';

/**
 * Generate smart notifications for a tenant based on current financial state.
 * Uses a `reference` field for idempotency — same event won't produce duplicate rows.
 * Reference pattern: `{type}_{entityId}_{yyyy-mm-dd}` (daily dedup window).
 */
export async function generateNotifications(
  prisma: PrismaClient,
  tenantId: string
): Promise<void> {
  const fin = await loadFinance(prisma, tenantId);
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date();

  type NotifPayload = {
    type: string;
    level: string;
    title: string;
    description: string;
    entityType: string | null;
    entityId: string | null;
    reference: string;
  };

  const toCreate: NotifPayload[] = [];

  // 1. Overdue invoices ─────────────────────────────────────────────────────
  for (const inv of fin.invoices) {
    if (inv.archived || !inv.dueDate) continue;
    const status = fin.invoiceAutoStatus(inv);
    if (status === INVOICE_STATUS.PAID_FULL || status === 'کنسل شده') continue;
    if (new Date(inv.dueDate) >= today) continue;

    const remaining = num(inv.totalAmount) - fin.supplierInvoicePaid(inv);
    if (remaining <= 0) continue;

    toCreate.push({
      type: 'overdue_invoice',
      level: 'critical',
      title: `فاکتور ${inv.invoiceNumber} سررسید گذشته`,
      description: `مانده پرداخت: ${remaining.toLocaleString('fa-IR')} ریال`,
      entityType: 'invoice',
      entityId: inv.id,
      reference: `overdue_invoice_${inv.id}_${todayStr}`,
    });
  }

  // 2. Budget overruns ───────────────────────────────────────────────────────
  for (const b of fin.budgets) {
    const s = fin.budgetSummary(b);
    if (s.remaining < 0) {
      const label = b.name ?? `${b.monthJalali}/${b.yearJalali}`;
      toCreate.push({
        type: 'budget_overrun',
        level: 'critical',
        title: `بودجه «${label}» از حد مجاز گذشت`,
        description: `مانده: ${s.remaining.toLocaleString('fa-IR')} ریال (کمبود)`,
        entityType: 'budget',
        entityId: b.id,
        reference: `budget_overrun_${b.id}_${todayStr}`,
      });
    }
  }

  // 3. Invoices with no budget assignment ───────────────────────────────────
  const noBudgetInvs = fin.invoices.filter((inv) => {
    if (inv.archived) return false;
    const s = fin.invoiceAutoStatus(inv);
    return s === INVOICE_STATUS.WAIT_BUDGET;
  });
  if (noBudgetInvs.length > 0) {
    toCreate.push({
      type: 'no_budget_invoices',
      level: 'important',
      title: `${noBudgetInvs.length} فاکتور منتظر تخصیص بودجه`,
      description: 'فاکتورهایی که هنوز به بودجه اختصاص داده نشده‌اند را تخصیص دهید.',
      entityType: null,
      entityId: null,
      reference: `no_budget_invoices_${todayStr}`,
    });
  }

  // 4. Quotations whose follow-up date is overdue ───────────────────────────
  for (const q of fin.quotations) {
    if (q.archived || !q.followUpDate) continue;
    if (new Date(q.followUpDate) >= today) continue;
    const label = q.quotationNumber ?? q.id.slice(0, 8);
    toCreate.push({
      type: 'quotation_followup',
      level: 'important',
      title: `پیش‌فاکتور ${label} پیگیری نشده`,
      description: 'تاریخ پیگیری گذشته — لطفاً وضعیت را بروزرسانی کنید.',
      entityType: 'quotation',
      entityId: q.id,
      reference: `quotation_followup_${q.id}_${todayStr}`,
    });
  }

  if (toCreate.length === 0) return;

  // Dedup: only insert references that don't exist yet
  const existing = await prisma.notification.findMany({
    where: { tenantId, reference: { in: toCreate.map((n) => n.reference) } },
    select: { reference: true },
  });
  const existingRefs = new Set(existing.map((n) => n.reference));

  const newItems = toCreate.filter((n) => !existingRefs.has(n.reference));
  if (newItems.length === 0) return;

  await prisma.notification.createMany({
    data: newItems.map((n) => ({
      tenantId,
      type: n.type,
      level: n.level,
      title: n.title,
      description: n.description,
      entityType: n.entityType,
      entityId: n.entityId,
      reference: n.reference,
      isRead: false,
    })),
  });
}

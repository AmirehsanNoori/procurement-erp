/**
 * Central financial logic, mirroring the prototype's rules so the production
 * numbers match the original:
 *
 *   requiredBudget = ceil(estimated × (1 + contingency%))
 *   reserved       = Σ active-quotation remaining (amount − advance) + Σ unpaid-invoice totals (by budget)
 *   actualPaid     = Σ invoice payments (by budget) + Σ quotation advances (by budget)
 *                    + payments without a budget matched to the budget's Jalali month
 *   remaining      = approved − reserved − actualPaid
 *
 * Invoice status is derived automatically from payments/advance/budget unless a
 * manual terminal status is set.
 */
import { Budget, Invoice, Payment, Quotation } from '@prisma/client';
import { dateToJalali } from '../../lib/jalali';

export const INVOICE_STATUS = {
  WAIT_BUDGET: 'در انتظار بودجه',
  WAIT_APPROVE: 'در انتظار تأیید',
  APPROVED: 'تأیید شده',
  READY: 'آماده پرداخت',
  PARTIAL: 'نیمه پرداخت',
  PAID_FULL: 'پرداخت کامل',
} as const;

// Statuses a user sets explicitly; auto-status must not override them.
const MANUAL_STATUSES = new Set<string>([
  'کنسل شده',
  'در انتظار اطلاعات بیشتر',
  'در حال تعمیر یا بررسی توسط ورکشاپ',
]);

export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v as number);
  return Number.isFinite(n) ? n : 0;
}

export function requiredBudget(b: Pick<Budget, 'estimatedCost' | 'contingencyPercent' | 'requiredBudget'>): number {
  const stored = num(b.requiredBudget);
  if (stored > 0) return stored;
  const est = num(b.estimatedCost);
  const cont = num(b.contingencyPercent);
  return Math.ceil(est * (1 + cont / 100));
}

/** Snapshot of a tenant's financial records with derived metrics. */
export class FinanceContext {
  private invoiceById = new Map<string, Invoice>();
  private paymentsByInvoice = new Map<string, Payment[]>();

  constructor(
    public budgets: Budget[],
    public quotations: Quotation[],
    public invoices: Invoice[],
    public payments: Payment[]
  ) {
    for (const inv of invoices) this.invoiceById.set(inv.id, inv);
    for (const p of payments) {
      const arr = this.paymentsByInvoice.get(p.invoiceId) ?? [];
      arr.push(p);
      this.paymentsByInvoice.set(p.invoiceId, arr);
    }
  }

  /** Payments recorded directly against an invoice. */
  invoicePaymentsTotal(invoiceId: string): number {
    return (this.paymentsByInvoice.get(invoiceId) ?? []).reduce((a, p) => a + num(p.amount), 0);
  }

  /** Advance taken on the quotation an invoice was converted from. */
  private advanceForInvoice(inv: Invoice): number {
    if (!inv.quotationId) return 0;
    const q = this.quotations.find((x) => x.id === inv.quotationId);
    return num(q?.advancePaymentAmount);
  }

  /** Total considered paid for an invoice (payments + advance). */
  supplierInvoicePaid(inv: Invoice): number {
    return this.invoicePaymentsTotal(inv.id) + this.advanceForInvoice(inv);
  }

  /** Auto-derived invoice status (unless a manual terminal status is set). */
  invoiceAutoStatus(inv: Invoice): string {
    if (MANUAL_STATUSES.has(inv.status)) return inv.status;
    const total = num(inv.totalAmount);
    const paid = this.supplierInvoicePaid(inv);
    if (total > 0 && paid >= total) return INVOICE_STATUS.PAID_FULL;
    if (paid > 0) return INVOICE_STATUS.PARTIAL;
    if (!inv.budgetId) return INVOICE_STATUS.WAIT_BUDGET;
    if (inv.sentToAccounting) return INVOICE_STATUS.READY;
    return inv.status || INVOICE_STATUS.WAIT_APPROVE;
  }

  /** Reserved = active quotation remaining + unpaid invoice totals, by budget. */
  reservedForBudget(budgetId: string): number {
    const q = this.quotations
      .filter((x) => !x.archived && x.budgetId === budgetId)
      .reduce((a, x) => a + Math.max(0, num(x.amount) - num(x.advancePaymentAmount)), 0);
    const i = this.invoices
      .filter((x) => x.budgetId === budgetId && this.invoiceAutoStatus(x) !== INVOICE_STATUS.PAID_FULL)
      .reduce((a, x) => a + num(x.totalAmount), 0);
    return q + i;
  }

  /** Actual paid = invoice payments + quotation advances tied to the budget,
   *  plus budget-less payments that fall in the budget's Jalali month. */
  actualPaidForBudget(budget: Budget): number {
    let invoicePays = 0;
    for (const p of this.payments) {
      const inv = this.invoiceById.get(p.invoiceId);
      if (inv?.budgetId === budget.id) {
        invoicePays += num(p.amount);
      } else if (!inv?.budgetId && p.paymentDate) {
        const [jy, jm] = dateToJalali(p.paymentDate);
        if (jy === budget.yearJalali && jm === budget.monthJalali) invoicePays += num(p.amount);
      }
    }
    const advancePays = this.quotations
      .filter((x) => x.budgetId === budget.id)
      .reduce((a, x) => a + num(x.advancePaymentAmount), 0);
    return invoicePays + advancePays;
  }

  budgetSummary(b: Budget) {
    const required = requiredBudget(b);
    const approved = num(b.approvedBudget);
    const reserved = this.reservedForBudget(b.id);
    const actual = this.actualPaidForBudget(b);
    const remaining = approved - reserved - actual;
    return {
      required,
      approved,
      reserved,
      actual,
      remaining,
      estimated: num(b.estimatedCost),
      gapApprovedVsRequired: approved - required,
      burnPercent: approved > 0 ? Math.round(((reserved + actual) / approved) * 100) : 0,
    };
  }
}

/** Load all financial records for a tenant into a FinanceContext. */
export async function loadFinance(
  prisma: import('@prisma/client').PrismaClient,
  tenantId: string
): Promise<FinanceContext> {
  const [budgets, quotations, invoices, payments] = await Promise.all([
    prisma.budget.findMany({ where: { tenantId } }),
    prisma.quotation.findMany({ where: { tenantId } }),
    prisma.invoice.findMany({ where: { tenantId } }),
    prisma.payment.findMany({ where: { tenantId } }),
  ]);
  return new FinanceContext(budgets, quotations, invoices, payments);
}

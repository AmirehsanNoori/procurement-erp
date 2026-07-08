import { describe, it, expect } from 'vitest';
import type { Budget, Invoice, Payment, Quotation } from '@prisma/client';
import { FinanceContext, INVOICE_STATUS } from './calc';

// Minimal record builders — the finance engine only reads a handful of fields,
// so we cast partials rather than fabricate whole Prisma rows.
const B = (o: Record<string, unknown>): Budget => o as unknown as Budget;
const I = (o: Record<string, unknown>): Invoice => o as unknown as Invoice;
const P = (o: Record<string, unknown>): Payment => o as unknown as Payment;
const Q = (o: Record<string, unknown>): Quotation => o as unknown as Quotation;

describe('FinanceContext.invoiceAutoStatus', () => {
  const fin = (invoices: Invoice[], payments: Payment[] = [], quotations: Quotation[] = []) =>
    new FinanceContext([], quotations, invoices, payments);

  it('WAIT_BUDGET when there is no budget and nothing paid', () => {
    const inv = I({ id: 'i1', totalAmount: 100, budgetId: null, status: '', sentToAccounting: false });
    expect(fin([inv]).invoiceAutoStatus(inv)).toBe(INVOICE_STATUS.WAIT_BUDGET);
  });

  it('WAIT_APPROVE when budgeted but not sent to accounting and unpaid', () => {
    const inv = I({ id: 'i1', totalAmount: 100, budgetId: 'b1', status: '', sentToAccounting: false });
    expect(fin([inv]).invoiceAutoStatus(inv)).toBe(INVOICE_STATUS.WAIT_APPROVE);
  });

  it('READY when budgeted and sent to accounting, still unpaid', () => {
    const inv = I({ id: 'i1', totalAmount: 100, budgetId: 'b1', status: '', sentToAccounting: true });
    expect(fin([inv]).invoiceAutoStatus(inv)).toBe(INVOICE_STATUS.READY);
  });

  it('PARTIAL then PAID_FULL as payments accumulate', () => {
    const inv = I({ id: 'i1', totalAmount: 100, budgetId: 'b1', status: '', sentToAccounting: false });
    const partial = fin([inv], [P({ invoiceId: 'i1', amount: 40 })]);
    expect(partial.invoiceAutoStatus(inv)).toBe(INVOICE_STATUS.PARTIAL);
    const full = fin([inv], [P({ invoiceId: 'i1', amount: 100 })]);
    expect(full.invoiceAutoStatus(inv)).toBe(INVOICE_STATUS.PAID_FULL);
  });

  it('counts a converted quotation advance toward paid', () => {
    const inv = I({ id: 'i1', totalAmount: 100, budgetId: 'b1', quotationId: 'q1', status: '', sentToAccounting: false });
    const quote = Q({ id: 'q1', advancePaymentAmount: 50 });
    const ctx = fin([inv], [P({ invoiceId: 'i1', amount: 50 })], [quote]);
    expect(ctx.invoiceAutoStatus(inv)).toBe(INVOICE_STATUS.PAID_FULL); // 50 advance + 50 payment = 100
  });

  it('respects a manual terminal status (does not auto-override)', () => {
    const inv = I({ id: 'i1', totalAmount: 100, budgetId: null, status: 'کنسل شده', sentToAccounting: false });
    expect(fin([inv]).invoiceAutoStatus(inv)).toBe('کنسل شده');
  });
});

describe('FinanceContext.reservedForBudget', () => {
  it('reserves active-quote remaining (amount − advance) + unpaid-invoice totals, by budget', () => {
    const quotations = [
      Q({ id: 'q1', budgetId: 'b1', amount: 1000, advancePaymentAmount: 200, archived: false }), // → 800
      Q({ id: 'q2', budgetId: 'b1', amount: 500, advancePaymentAmount: 0, archived: true }), // archived → 0
      Q({ id: 'q3', budgetId: 'b2', amount: 999, advancePaymentAmount: 0, archived: false }), // other budget → 0
    ];
    const invoices = [
      I({ id: 'i1', budgetId: 'b1', totalAmount: 500, status: '', sentToAccounting: false }), // unpaid → 500
      I({ id: 'i2', budgetId: 'b1', totalAmount: 300, status: '', sentToAccounting: false }), // paid full → 0
    ];
    const payments = [P({ invoiceId: 'i2', amount: 300 })];
    const ctx = new FinanceContext([], quotations, invoices, payments);
    expect(ctx.reservedForBudget('b1')).toBe(1300); // 800 + 500
    expect(ctx.reservedForBudget('b2')).toBe(999);
  });
});

describe('FinanceContext.budgetSummary', () => {
  it('computes required/approved/reserved/actual/remaining and burn%', () => {
    const budget = B({ id: 'b1', approvedBudget: 1000, estimatedCost: 800, contingencyPercent: 0, requiredBudget: 0, yearJalali: 1403, monthJalali: 9 });
    const quotations = [Q({ id: 'q1', budgetId: 'b1', amount: 200, advancePaymentAmount: 0, archived: false })];
    const ctx = new FinanceContext([budget], quotations, [], []);
    const s = ctx.budgetSummary(budget);
    expect(s.required).toBe(800); // ceil(800 * (1 + 0))
    expect(s.approved).toBe(1000);
    expect(s.reserved).toBe(200);
    expect(s.actual).toBe(0);
    expect(s.remaining).toBe(800); // 1000 − 200 − 0
    expect(s.gapApprovedVsRequired).toBe(200); // 1000 − 800
    expect(s.burnPercent).toBe(20); // (200 + 0) / 1000
  });

  it('actualPaid includes quotation advances tied to the budget', () => {
    const budget = B({ id: 'b1', approvedBudget: 1000, estimatedCost: 0, contingencyPercent: 0, requiredBudget: 1000, yearJalali: 1403, monthJalali: 9 });
    const quotations = [Q({ id: 'q1', budgetId: 'b1', amount: 500, advancePaymentAmount: 150, archived: false })];
    const ctx = new FinanceContext([budget], quotations, [], []);
    const s = ctx.budgetSummary(budget);
    expect(s.actual).toBe(150); // advance counts as actual paid
    expect(s.reserved).toBe(350); // 500 − 150
    expect(s.remaining).toBe(500); // 1000 − 350 − 150
  });
});

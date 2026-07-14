import { prisma } from '../../lib/prisma';

/**
 * F3 — automatic accounting entry from a supplier payment.
 *
 * Standard payment voucher:
 *   Dr  حساب‌های پرداختنی تجاری     amount
 *       Cr  بانک / صندوق                 amount
 *
 * Draft journal soft-references the payment (refModule/refType='payment'/refId).
 * Idempotent per payment, fail-open, credit account overridable (bank vs cash).
 */

export const PAYMENT_POSTING_DEFAULTS = {
  payableCode: '200101', // حساب‌های پرداختنی تجاری (debit: settle supplier)
  cashCode: '100102', // بانک (credit: money out) — override with 100101 for صندوق
};

export interface PaymentLike {
  id: string;
  amount: unknown;
  paymentDate: Date | null;
  invoiceNumber?: string | null;
  supplierName?: string | null;
}

export interface PostingResult {
  status: 'created' | 'exists' | 'skipped';
  journalId?: string;
  journalNumber?: number;
  reason?: string;
}

type CodeOverrides = Partial<typeof PAYMENT_POSTING_DEFAULTS>;

function accountByCode(tenantId: string, code: string) {
  return prisma.finAccount.findFirst({ where: { tenantId, code, isActive: true, isPostable: true } });
}

/** Create a draft payment voucher. Idempotent per payment. */
export async function createPaymentJournal(
  tenantId: string,
  payment: PaymentLike,
  createdById?: string | null,
  overrides?: CodeOverrides,
): Promise<PostingResult> {
  const existing = await prisma.finJournal.findFirst({
    where: { tenantId, refModule: 'procurement', refType: 'payment', refId: payment.id },
    select: { id: true, number: true },
  });
  if (existing) return { status: 'exists', journalId: existing.id, journalNumber: existing.number };

  const amount = Number(payment.amount) || 0;
  if (amount <= 0) return { status: 'skipped', reason: 'مبلغ پرداخت صفر است' };

  const codes = { ...PAYMENT_POSTING_DEFAULTS, ...overrides };
  const [payable, cash] = await Promise.all([
    accountByCode(tenantId, codes.payableCode),
    accountByCode(tenantId, codes.cashCode),
  ]);
  if (!payable || !cash) {
    return { status: 'skipped', reason: 'حساب‌های پیش‌فرض (پرداختنی/بانک) در کدینگ حساب‌ها یافت نشد؛ ابتدا کدینگ را کامل کنید' };
  }

  const desc = `پرداخت${payment.supplierName ? ` به ${payment.supplierName}` : ''}${payment.invoiceNumber ? ` بابت فاکتور ${payment.invoiceNumber}` : ''}`;
  const lines = [
    { accountId: payable.id, debit: amount, credit: 0, description: payment.supplierName ? `تسویه ${payment.supplierName}` : 'تسویه حساب‌های پرداختنی', sortOrder: 0 },
    { accountId: cash.id, debit: 0, credit: amount, description: 'وجه پرداختی', sortOrder: 1 },
  ];

  const last = await prisma.finJournal.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  const number = (last?.number ?? 0) + 1;

  const journal = await prisma.finJournal.create({
    data: {
      tenantId,
      number,
      date: payment.paymentDate ?? new Date(),
      status: 'draft',
      description: desc,
      refModule: 'procurement',
      refType: 'payment',
      refId: payment.id,
      createdById: createdById ?? null,
      lines: { create: lines.map((l) => ({ tenantId, accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, sortOrder: l.sortOrder })) },
    },
    select: { id: true, number: true },
  });
  return { status: 'created', journalId: journal.id, journalNumber: journal.number };
}

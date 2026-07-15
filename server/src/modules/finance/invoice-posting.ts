import { prisma } from '../../lib/prisma';

/**
 * F2 — automatic accounting entry from a procurement invoice.
 *
 * Standard purchase voucher (procure-to-pay):
 *   Dr  موجودی کالا / هزینه خرید        netAmount
 *   Dr  مالیات و عوارض ارزش افزوده       vatAmount   (only when vat > 0)
 *       Cr  حساب‌های پرداختنی تجاری           totalAmount
 *
 * The draft journal soft-references the invoice (refModule/refType/refId, ADR-0009)
 * so Finance stays decoupled from Procurement. Account mapping resolves by the
 * standard seeded codes but is overridable per call — orgs can customise later.
 * Fail-open: if the chart of accounts isn't set up, we skip (never block the
 * procurement handoff) and report a reason.
 */

export const INVOICE_POSTING_DEFAULTS = {
  // Debit the GR/IR clearing account (the goods receipt already debited موجودی
  // کالا, W2). For flows without a goods receipt this can be overridden to a
  // direct expense/inventory account.
  inventoryCode: '200103', // حساب واسط دریافت/فاکتور کالا (GR/IR)
  inputVatCode: '100402', // پیش‌پرداخت مالیات (claimable input VAT)
  payableCode: '200101', // حساب‌های پرداختنی تجاری (credit: supplier)
};

export interface InvoiceLike {
  id: string;
  invoiceNumber: string;
  netAmount: unknown;
  vatAmount: unknown;
  totalAmount: unknown;
  invoiceDate: Date | null;
  supplier?: { name: string } | null;
}

export interface PostingResult {
  status: 'created' | 'exists' | 'skipped';
  journalId?: string;
  journalNumber?: number;
  reason?: string;
}

type CodeOverrides = Partial<typeof INVOICE_POSTING_DEFAULTS>;

function accountByCode(tenantId: string, code: string) {
  return prisma.finAccount.findFirst({ where: { tenantId, code, isActive: true, isPostable: true } });
}

/** Create a draft accounting voucher for an invoice. Idempotent per invoice. */
export async function createInvoiceJournal(
  tenantId: string,
  invoice: InvoiceLike,
  createdById?: string | null,
  overrides?: CodeOverrides,
): Promise<PostingResult> {
  // Idempotent: one voucher per invoice (skip if any already links to it).
  const existing = await prisma.finJournal.findFirst({
    where: { tenantId, refModule: 'procurement', refType: 'invoice', refId: invoice.id },
    select: { id: true, number: true },
  });
  if (existing) return { status: 'exists', journalId: existing.id, journalNumber: existing.number };

  const net = Number(invoice.netAmount) || 0;
  const vat = Number(invoice.vatAmount) || 0;
  const total = Number(invoice.totalAmount) || net + vat;
  if (total <= 0) return { status: 'skipped', reason: 'مبلغ فاکتور صفر است' };

  const codes = { ...INVOICE_POSTING_DEFAULTS, ...overrides };
  const [inventory, vatAcc, payable] = await Promise.all([
    accountByCode(tenantId, codes.inventoryCode),
    vat > 0 ? accountByCode(tenantId, codes.inputVatCode) : Promise.resolve(null),
    accountByCode(tenantId, codes.payableCode),
  ]);
  if (!inventory || !payable || (vat > 0 && !vatAcc)) {
    return { status: 'skipped', reason: 'حساب‌های پیش‌فرض (موجودی/مالیات/پرداختنی) در کدینگ حساب‌ها یافت نشد؛ ابتدا کدینگ را کامل کنید' };
  }

  const lines = [
    { accountId: inventory.id, debit: net, credit: 0, description: 'بهای کالا/خدمت', sortOrder: 0 },
    ...(vat > 0 && vatAcc ? [{ accountId: vatAcc.id, debit: vat, credit: 0, description: 'مالیات و عوارض ارزش افزوده', sortOrder: 1 }] : []),
    { accountId: payable.id, debit: 0, credit: total, description: invoice.supplier?.name ? `بستانکاری ${invoice.supplier.name}` : 'حساب‌های پرداختنی', sortOrder: 2 },
  ];

  const last = await prisma.finJournal.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  const number = (last?.number ?? 0) + 1;

  const journal = await prisma.finJournal.create({
    data: {
      tenantId,
      number,
      date: invoice.invoiceDate ?? new Date(),
      status: 'draft',
      description: `بابت فاکتور خرید ${invoice.invoiceNumber}${invoice.supplier?.name ? ` — ${invoice.supplier.name}` : ''}`,
      refModule: 'procurement',
      refType: 'invoice',
      refId: invoice.id,
      createdById: createdById ?? null,
      lines: { create: lines.map((l) => ({ tenantId, accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, sortOrder: l.sortOrder })) },
    },
    select: { id: true, number: true },
  });
  return { status: 'created', journalId: journal.id, journalNumber: journal.number };
}

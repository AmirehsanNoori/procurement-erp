import { prisma } from '../../lib/prisma';

/**
 * W2 — inventory ↔ GL integration (perpetual inventory with a GR/IR clearing
 * account, so it dovetails with the invoice voucher F2 without double counting):
 *
 *   Goods receipt : Dr موجودی کالا (100301)        Cr GR/IR (200103)
 *   Invoice (F2)  : Dr GR/IR (200103) + Dr VAT     Cr پرداختنی (200101)
 *   Stock issue   : Dr بهای تمام‌شده (500101)       Cr موجودی کالا (100301)
 *
 * Net of receipt + invoice = Dr inventory + Dr VAT, Cr payable. Draft, idempotent
 * per source document, fail-open (never blocks the warehouse operation).
 */

export const INVENTORY_GL = {
  inventoryCode: '100301', // موجودی کالا
  grirCode: '200103', // حساب واسط دریافت/فاکتور کالا
  cogsCode: '500101', // بهای تمام‌شده کالای فروش‌رفته
  varianceCode: '500401', // کسری و اضافات انبارگردانی
};

export interface PostingResult {
  status: 'created' | 'exists' | 'skipped';
  journalId?: string;
  journalNumber?: number;
  reason?: string;
}

function accountByCode(tenantId: string, code: string) {
  return prisma.finAccount.findFirst({ where: { tenantId, code, isActive: true, isPostable: true } });
}
async function nextNumber(tenantId: string) {
  const last = await prisma.finJournal.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

async function postPair(
  tenantId: string, refType: string, refId: string, description: string,
  debitCode: string, creditCode: string, amount: number, createdById?: string | null,
): Promise<PostingResult> {
  const existing = await prisma.finJournal.findFirst({ where: { tenantId, refModule: 'inventory', refType, refId }, select: { id: true, number: true } });
  if (existing) return { status: 'exists', journalId: existing.id, journalNumber: existing.number };
  const value = round2(amount);
  if (value <= 0) return { status: 'skipped', reason: 'مبلغ صفر است' };
  const [dr, cr] = await Promise.all([accountByCode(tenantId, debitCode), accountByCode(tenantId, creditCode)]);
  if (!dr || !cr) return { status: 'skipped', reason: 'حساب‌های پیش‌فرض انبار در کدینگ یافت نشد (موجودی/واسط/بهای تمام‌شده)' };
  const number = await nextNumber(tenantId);
  const journal = await prisma.finJournal.create({
    data: {
      tenantId, number, date: new Date(), status: 'draft', description,
      refModule: 'inventory', refType, refId, createdById: createdById ?? null,
      lines: { create: [
        { tenantId, accountId: dr.id, debit: value, credit: 0, description, sortOrder: 0 },
        { tenantId, accountId: cr.id, debit: 0, credit: value, description, sortOrder: 1 },
      ] },
    },
    select: { id: true, number: true },
  });
  return { status: 'created', journalId: journal.id, journalNumber: journal.number };
}

/** Goods receipt: Dr inventory, Cr GR/IR. */
export function createReceiptJournal(tenantId: string, receiptId: string, value: number, label: string, createdById?: string | null) {
  return postPair(tenantId, 'goods_receipt', receiptId, `رسید انبار${label ? ` — ${label}` : ''}`, INVENTORY_GL.inventoryCode, INVENTORY_GL.grirCode, value, createdById);
}

/** Stock issue: Dr COGS, Cr inventory. */
export function createIssueJournal(tenantId: string, movementId: string, value: number, label: string, createdById?: string | null) {
  return postPair(tenantId, 'stock_issue', movementId, `حواله انبار${label ? ` — ${label}` : ''}`, INVENTORY_GL.cogsCode, INVENTORY_GL.inventoryCode, value, createdById);
}

/** Stocktake variance: surplus → Dr inventory / Cr variance; shortage → reverse.
 *  `netDelta` is the signed inventory value change (surplus positive). */
export function createStocktakeJournal(tenantId: string, stocktakeId: string, netDelta: number, label: string, createdById?: string | null) {
  const amount = Math.abs(round2(netDelta));
  const [debit, credit] = netDelta >= 0
    ? [INVENTORY_GL.inventoryCode, INVENTORY_GL.varianceCode] // surplus
    : [INVENTORY_GL.varianceCode, INVENTORY_GL.inventoryCode]; // shortage
  return postPair(tenantId, 'stocktake', stocktakeId, `مغایرت انبارگردانی${label ? ` — ${label}` : ''}`, debit, credit, amount, createdById);
}

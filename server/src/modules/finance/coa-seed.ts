/**
 * Default Iranian-style chart of accounts (کدینگ استاندارد حساب‌ها).
 * Three levels: گروه (group) → کل (general) → معین (postable). Only معین
 * accounts accept journal lines. This is a starting template — every tenant can
 * add, edit, deactivate or extend it after seeding (customizable per org).
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface CoaSeedNode {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  isPostable: boolean;
}

/** Ordered so that parents always precede their children. */
export const IRANIAN_COA: CoaSeedNode[] = [
  // ── دارایی‌ها ──────────────────────────────────────────────────────────────
  { code: '10', name: 'دارایی‌ها', type: 'asset', isPostable: false },
  { code: '1001', name: 'موجودی نقد و بانک', type: 'asset', parentCode: '10', isPostable: false },
  { code: '100101', name: 'صندوق', type: 'asset', parentCode: '1001', isPostable: true },
  { code: '100102', name: 'بانک', type: 'asset', parentCode: '1001', isPostable: true },
  { code: '100103', name: 'تنخواه‌گردان', type: 'asset', parentCode: '1001', isPostable: true },
  { code: '1002', name: 'حساب‌ها و اسناد دریافتنی', type: 'asset', parentCode: '10', isPostable: false },
  { code: '100201', name: 'حساب‌های دریافتنی تجاری', type: 'asset', parentCode: '1002', isPostable: true },
  { code: '100202', name: 'اسناد دریافتنی', type: 'asset', parentCode: '1002', isPostable: true },
  { code: '1003', name: 'موجودی مواد و کالا', type: 'asset', parentCode: '10', isPostable: false },
  { code: '100301', name: 'موجودی کالا', type: 'asset', parentCode: '1003', isPostable: true },
  { code: '1004', name: 'پیش‌پرداخت‌ها', type: 'asset', parentCode: '10', isPostable: false },
  { code: '100401', name: 'پیش‌پرداخت خرید', type: 'asset', parentCode: '1004', isPostable: true },
  { code: '100402', name: 'پیش‌پرداخت مالیات', type: 'asset', parentCode: '1004', isPostable: true },
  { code: '1005', name: 'دارایی‌های ثابت مشهود', type: 'asset', parentCode: '10', isPostable: false },
  { code: '100501', name: 'اموال، ماشین‌آلات و تجهیزات', type: 'asset', parentCode: '1005', isPostable: true },
  { code: '100502', name: 'استهلاک انباشته', type: 'asset', parentCode: '1005', isPostable: true },

  // ── بدهی‌ها ────────────────────────────────────────────────────────────────
  { code: '20', name: 'بدهی‌ها', type: 'liability', isPostable: false },
  { code: '2001', name: 'حساب‌ها و اسناد پرداختنی', type: 'liability', parentCode: '20', isPostable: false },
  { code: '200101', name: 'حساب‌های پرداختنی تجاری', type: 'liability', parentCode: '2001', isPostable: true },
  { code: '200102', name: 'اسناد پرداختنی', type: 'liability', parentCode: '2001', isPostable: true },
  { code: '200103', name: 'حساب واسط دریافت/فاکتور کالا (GR/IR)', type: 'liability', parentCode: '2001', isPostable: true },
  { code: '2002', name: 'مالیات و عوارض پرداختنی', type: 'liability', parentCode: '20', isPostable: false },
  { code: '200201', name: 'مالیات بر ارزش افزوده', type: 'liability', parentCode: '2002', isPostable: true },
  { code: '200202', name: 'مالیات تکلیفی', type: 'liability', parentCode: '2002', isPostable: true },
  { code: '2003', name: 'حقوق و دستمزد پرداختنی', type: 'liability', parentCode: '20', isPostable: false },
  { code: '200301', name: 'حقوق پرداختنی', type: 'liability', parentCode: '2003', isPostable: true },
  { code: '200302', name: 'بیمه پرداختنی', type: 'liability', parentCode: '2003', isPostable: true },

  // ── حقوق صاحبان سهام ──────────────────────────────────────────────────────
  { code: '30', name: 'حقوق صاحبان سهام', type: 'equity', isPostable: false },
  { code: '3001', name: 'سرمایه', type: 'equity', parentCode: '30', isPostable: false },
  { code: '300101', name: 'سرمایه', type: 'equity', parentCode: '3001', isPostable: true },
  { code: '3002', name: 'سود و زیان انباشته', type: 'equity', parentCode: '30', isPostable: false },
  { code: '300201', name: 'سود (زیان) انباشته', type: 'equity', parentCode: '3002', isPostable: true },

  // ── درآمدها ────────────────────────────────────────────────────────────────
  { code: '40', name: 'درآمدها', type: 'income', isPostable: false },
  { code: '4001', name: 'درآمد عملیاتی', type: 'income', parentCode: '40', isPostable: false },
  { code: '400101', name: 'فروش', type: 'income', parentCode: '4001', isPostable: true },
  { code: '400102', name: 'درآمد ارائه خدمات', type: 'income', parentCode: '4001', isPostable: true },
  { code: '4002', name: 'درآمد غیرعملیاتی', type: 'income', parentCode: '40', isPostable: false },
  { code: '400201', name: 'سایر درآمدها', type: 'income', parentCode: '4002', isPostable: true },

  // ── هزینه‌ها ───────────────────────────────────────────────────────────────
  { code: '50', name: 'هزینه‌ها', type: 'expense', isPostable: false },
  { code: '5001', name: 'بهای تمام‌شده', type: 'expense', parentCode: '50', isPostable: false },
  { code: '500101', name: 'بهای تمام‌شده کالای فروش‌رفته', type: 'expense', parentCode: '5001', isPostable: true },
  { code: '5002', name: 'هزینه‌های عمومی و اداری', type: 'expense', parentCode: '50', isPostable: false },
  { code: '500201', name: 'حقوق و دستمزد', type: 'expense', parentCode: '5002', isPostable: true },
  { code: '500202', name: 'اجاره', type: 'expense', parentCode: '5002', isPostable: true },
  { code: '500203', name: 'آب، برق، گاز و مخابرات', type: 'expense', parentCode: '5002', isPostable: true },
  { code: '500204', name: 'ملزومات اداری', type: 'expense', parentCode: '5002', isPostable: true },
  { code: '5003', name: 'هزینه‌های خرید و تدارکات', type: 'expense', parentCode: '50', isPostable: false },
  { code: '500301', name: 'هزینه خرید', type: 'expense', parentCode: '5003', isPostable: true },
  { code: '500302', name: 'هزینه حمل و نقل', type: 'expense', parentCode: '5003', isPostable: true },
  { code: '5004', name: 'کسری و اضافات انبار', type: 'expense', parentCode: '50', isPostable: false },
  { code: '500401', name: 'کسری و اضافات انبارگردانی', type: 'expense', parentCode: '5004', isPostable: true },
];

export function levelOfCode(code: string): number {
  if (code.length <= 2) return 1;
  if (code.length <= 4) return 2;
  return 3;
}

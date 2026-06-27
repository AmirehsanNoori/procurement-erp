import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney, faDate, JMONTHS } from '../lib/format';

interface SupplierRow {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  invoiceCount: number;
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
  lastPaymentDate: string | null;
  invoices: InvoiceRow[];
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  paid: number;
  remaining: number;
  status: string;
  requestNumber: string;
  budget: { name: string | null; monthJalali: number; yearJalali: number } | null;
}

interface StatementData {
  statement: SupplierRow[];
  totals: { totalInvoiced: number; totalPaid: number; balance: number };
}

const STATUS_BADGE: Record<string, string> = {
  'پرداخت کامل': 'bg-emerald-100 text-emerald-700',
  'نیمه پرداخت': 'bg-amber-100 text-amber-700',
  'در انتظار بودجه': 'bg-slate-100 text-slate-600',
  'آماده پرداخت': 'bg-violet-100 text-violet-700',
  'در انتظار تأیید': 'bg-blue-100 text-blue-700',
  'کنسل شده': 'bg-rose-100 text-rose-700',
};

export function SupplierStatement() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<StatementData>({
    queryKey: ['supplier-statement', tid],
    queryFn: async () => (await api.get(`/${tid}/suppliers/statement`)).data,
    enabled: Boolean(tid),
    staleTime: 60_000,
  });

  const rows = (data?.statement ?? []).filter((s) =>
    !search || s.name.includes(search) || (s.contactPerson ?? '').includes(search)
  );

  return (
    <Layout title={t('supplierStatement.title')}>
      {/* Totals banner */}
      {data && (
        <div className="card mb-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-slate-500">{t('suppliers.statement.totalInvoiced')}</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{faMoney(data.totals.totalInvoiced)}</div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{t('suppliers.statement.totalPaid')}</div>
            <div className="text-xl font-bold text-emerald-700 mt-1">{faMoney(data.totals.totalPaid)}</div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{t('suppliers.statement.balance')}</div>
            <div className={`text-xl font-bold mt-1 ${data.totals.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {faMoney(data.totals.balance)}
            </div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          className="input max-w-xs"
          placeholder={t('suppliers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="py-12 text-center text-slate-400">{t('common.loading')}</div>
      )}

      {/* Supplier list */}
      <div className="space-y-2">
        {rows.map((s) => {
          const isOpen = expanded === s.id;
          const hasBalance = s.balance > 0;
          return (
            <div key={s.id} className="card p-0 overflow-hidden">
              {/* Header row */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(isOpen ? null : s.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{s.name}</span>
                    {s.invoiceCount > 0 && (
                      <span className="text-[10px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                        {s.invoiceCount} {t('invoices.title')}
                      </span>
                    )}
                    {hasBalance && (
                      <span className="text-[10px] rounded-full bg-rose-100 px-2 py-0.5 text-rose-700 font-bold">
                        {t('suppliers.statement.balance')}: {faMoney(s.balance)}
                      </span>
                    )}
                  </div>
                  {s.contactPerson && (
                    <div className="text-xs text-slate-400 mt-0.5">{s.contactPerson}</div>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <div className="text-xs text-slate-500">{t('suppliers.statement.totalPaid')}</div>
                  <div className="text-sm font-bold text-emerald-700">{faMoney(s.totalPaid)}</div>
                </div>
                <span className="text-slate-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </button>

              {/* Invoice detail */}
              {isOpen && (
                <div className="border-t border-slate-100">
                  {s.invoices.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">
                      {t('invoices.empty')}
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-right text-slate-500">
                          <th className="px-3 py-2">{t('invoices.cols.number')}</th>
                          <th className="px-3 py-2">{t('requests.cols.number')}</th>
                          <th className="px-3 py-2">{t('budgets.title')}</th>
                          <th className="px-3 py-2">{t('common.date')}</th>
                          <th className="px-3 py-2">{t('invoices.cols.dueDate')}</th>
                          <th className="px-3 py-2">{t('common.amount')}</th>
                          <th className="px-3 py-2">{t('invoices.cols.paid')}</th>
                          <th className="px-3 py-2">{t('invoices.cols.remaining')}</th>
                          <th className="px-3 py-2">{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.invoices.map((inv) => (
                          <tr key={inv.id} className={`border-t border-slate-100 ${inv.dueDate && new Date(inv.dueDate) < new Date() && inv.remaining > 0 ? 'bg-rose-50' : ''}`}>
                            <td className="px-3 py-2 font-bold text-slate-700">{inv.invoiceNumber}</td>
                            <td className="px-3 py-2 font-semibold text-blue-700">{inv.requestNumber || '—'}</td>
                            <td className="px-3 py-2 text-slate-500">
                              {inv.budget
                                ? (inv.budget.name || `${JMONTHS[inv.budget.monthJalali]} ${inv.budget.yearJalali}`)
                                : <span className="text-rose-400 text-[10px]">{t('budgets.noBudget', 'بدون بودجه')}</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{faDate(inv.invoiceDate)}</td>
                            <td className={`px-3 py-2 font-semibold ${inv.dueDate && new Date(inv.dueDate) < new Date() && inv.remaining > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                              {faDate(inv.dueDate)}
                            </td>
                            <td className="px-3 py-2 font-bold">{faMoney(inv.totalAmount)}</td>
                            <td className="px-3 py-2 text-emerald-700">{faMoney(inv.paid)}</td>
                            <td className={`px-3 py-2 font-bold ${inv.remaining > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                              {faMoney(inv.remaining)}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] ${STATUS_BADGE[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-xs">
                          <td colSpan={5} className="px-3 py-2 text-slate-600">{t('common.total')} {s.name}</td>
                          <td className="px-3 py-2">{faMoney(s.totalInvoiced)}</td>
                          <td className="px-3 py-2 text-emerald-700">{faMoney(s.totalPaid)}</td>
                          <td className={`px-3 py-2 ${s.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {faMoney(s.balance)}
                          </td>
                          <td className="px-3 py-2">
                            {s.lastPaymentDate && (
                              <span className="text-[10px] text-slate-400">
                                {t('supplierStatement.lastPayment', 'آخرین')}: {faDate(s.lastPaymentDate)}
                              </span>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {rows.length === 0 && !isLoading && (
          <div className="card py-12 text-center text-slate-400">
            {t('suppliers.empty')}
          </div>
        )}
      </div>
    </Layout>
  );
}

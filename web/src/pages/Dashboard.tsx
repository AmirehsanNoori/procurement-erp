import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate, JMONTHS } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface BudgetSummary {
  id: string;
  name: string | null;
  yearJalali: number;
  monthJalali: number;
  approved: number;
  reserved: number;
  actual: number;
  remaining: number;
  burnPercent: number;
}

interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  supplier: string;
  remaining: number;
  status: string;
}

interface DashboardData {
  summary: {
    requests: number;
    quotations: number;
    invoices: number;
    suppliers: number;
    documents: number;
    unreadNotifications: number;
  };
  invoiceBreakdown: Record<string, number>;
  budgets: BudgetSummary[];
  overdueInvoices: OverdueInvoice[];
  payments: { actual: number; advance: number; total: number };
}

function KpiCard({
  label,
  value,
  sub,
  color,
  to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  to?: string;
}) {
  const inner = (
    <div className={`card flex items-start gap-3 border-r-4 ${color} hover:shadow-md transition-shadow`}>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className="mt-1 text-2xl font-bold text-slate-800 leading-tight">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-400 truncate">{sub}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : <div>{inner}</div>;
}

function BurnBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function burnColor(pct: number): string {
  if (pct >= 100) return 'bg-rose-500';
  if (pct >= 80) return 'bg-amber-400';
  return 'bg-emerald-400';
}

export function Dashboard() {
  const { currentTenantId, can } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [payModal, setPayModal] = useState<{ id: string; number: string; remaining: number; amount: string; date: string; listNumber: string } | null>(null);
  const [payErr, setPayErr] = useState('');

  const payMut = useMutation({
    mutationFn: async () =>
      api.post(`/${tid}/payments`, {
        invoiceId: payModal!.id,
        amount: Number(payModal!.amount || 0),
        paymentDate: payModal!.date || undefined,
        paymentListNumber: payModal!.listNumber || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', tid] });
      qc.invalidateQueries({ queryKey: ['invoices', tid] });
      qc.invalidateQueries({ queryKey: ['payments', tid] });
      setPayModal(null);
      setPayErr('');
    },
    onError: (e) => setPayErr(apiError(e)),
  });

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard', tid],
    queryFn: async () => (await api.get(`/${tid}/dashboard`)).data,
    enabled: Boolean(tid),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const s = data?.summary;
  const inv = data?.invoiceBreakdown ?? {};
  const openInvoices = (s?.invoices ?? 0) - (inv['پرداخت کامل'] ?? 0) - (inv['کنسل شده'] ?? 0);

  return (
    <Layout title={t('dashboard.title')}>
      {isLoading && (
        <div className="text-center text-slate-400 py-12">{t('common.loading')}</div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <KpiCard
              label={t('dashboard.kpi.activeRequests')}
              value={s?.requests ?? 0}
              sub={t('dashboard.kpi.requestsSub')}
              color="border-blue-400"
              to="/requests"
            />
            <KpiCard
              label={t('dashboard.kpi.quotations')}
              value={s?.quotations ?? 0}
              sub={t('dashboard.kpi.quotationsSub')}
              color="border-violet-400"
              to="/quotations"
            />
            <KpiCard
              label={t('dashboard.kpi.openInvoices')}
              value={openInvoices}
              sub={`${inv['در انتظار بودجه'] ?? 0} ${t('dashboard.kpi.noBudget')} · ${inv['آماده پرداخت'] ?? 0} ${t('dashboard.kpi.readyToPay')}`}
              color={openInvoices > 0 ? 'border-amber-400' : 'border-emerald-400'}
              to="/invoices"
            />
            <KpiCard
              label={t('dashboard.kpi.totalPayments')}
              value={faMoney(data.payments.total)}
              sub={`${t('dashboard.kpi.cash')}: ${faMoney(data.payments.actual)} · ${t('dashboard.kpi.advance')}: ${faMoney(data.payments.advance)}`}
              color="border-emerald-400"
              to="/payments"
            />
          </div>

          {/* Second KPI row */}
          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            <KpiCard
              label={t('dashboard.kpi.suppliers')}
              value={s?.suppliers ?? 0}
              color="border-slate-300"
              to="/suppliers"
            />
            <KpiCard
              label={t('dashboard.kpi.documents')}
              value={s?.documents ?? 0}
              color="border-slate-300"
              to="/documents"
            />
            <Link to="/notifications">
              <div className={`card flex items-start gap-3 border-r-4 hover:shadow-md transition-shadow ${
                (s?.unreadNotifications ?? 0) > 0 ? 'border-rose-400' : 'border-slate-300'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 font-medium">{t('dashboard.kpi.unreadNotif')}</div>
                  <div className={`mt-1 text-2xl font-bold leading-tight ${
                    (s?.unreadNotifications ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800'
                  }`}>
                    {s?.unreadNotifications ?? 0}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{t('dashboard.kpi.viewAllNotif')}</div>
                </div>
              </div>
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Budget burn section */}
            {data.budgets.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700">{t('dashboard.budget.title')}</h2>
                  <Link to="/budget" className="text-xs text-blue-600 hover:underline">
                    {t('dashboard.budget.viewAll')}
                  </Link>
                </div>
                <div className="space-y-4">
                  {data.budgets.map((b) => {
                    const label = b.name ?? `${JMONTHS[b.monthJalali] ?? b.monthJalali} ${b.yearJalali}`;
                    return (
                      <div key={b.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-700">{label}</span>
                          <span className={`text-xs font-bold ${
                            b.burnPercent >= 100 ? 'text-rose-600' :
                            b.burnPercent >= 80 ? 'text-amber-600' :
                            'text-emerald-600'
                          }`}>
                            {b.burnPercent}٪
                          </span>
                        </div>
                        <BurnBar pct={b.burnPercent} color={burnColor(b.burnPercent)} />
                        <div className="flex justify-between mt-1 text-[10px] text-slate-400">
                          <span>{t('dashboard.budget.consumed')}: {faMoney(b.actual + b.reserved)}</span>
                          <span>{t('dashboard.budget.approved')}: {faMoney(b.approved)}</span>
                        </div>
                        {b.remaining < 0 && (
                          <div className="mt-1 text-[10px] text-rose-600 font-medium">
                            {t('dashboard.budget.deficit')}: {faMoney(Math.abs(b.remaining))} {t('common.rial')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Overdue invoices section */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-700">{t('dashboard.overdue.title')}</h2>
                <Link to="/invoices" className="text-xs text-blue-600 hover:underline">
                  {t('dashboard.overdue.viewAll')}
                </Link>
              </div>
              {data.overdueInvoices.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  {t('dashboard.overdue.empty')}
                </div>
              ) : (
                <div className="space-y-2">
                  {data.overdueInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-rose-700">{inv.invoiceNumber}</div>
                        <div className="text-[10px] text-slate-500 truncate">{inv.supplier}</div>
                        <div className="text-[10px] text-rose-500">{t('dashboard.overdue.dueDate')}: {faDate(inv.dueDate)}</div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className="text-xs font-bold text-rose-700">{faMoney(inv.remaining)}</div>
                        <div className="text-[10px] text-slate-400">{t('dashboard.overdue.remainingLabel')}</div>
                      </div>
                      {can('payments.register_payment') && (
                        <button
                          className="btn btn-outline px-2 py-1 text-xs shrink-0"
                          title={t('dashboard.overdue.quickPayTip')}
                          onClick={() => {
                            setPayErr('');
                            setPayModal({ id: inv.id, number: inv.invoiceNumber, remaining: inv.remaining, amount: String(inv.remaining), date: '', listNumber: '' });
                          }}
                        >💳</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Invoice breakdown */}
          {Object.keys(inv).length > 0 && (
            <div className="card mt-4">
              <h2 className="text-sm font-bold text-slate-700 mb-3">{t('dashboard.invoiceStatus.title')}</h2>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { key: 'در انتظار بودجه', color: 'bg-slate-100 text-slate-600' },
                  { key: 'در انتظار تأیید', color: 'bg-blue-50 text-blue-700' },
                  { key: 'تأیید شده', color: 'bg-sky-50 text-sky-700' },
                  { key: 'آماده پرداخت', color: 'bg-violet-50 text-violet-700' },
                  { key: 'نیمه پرداخت', color: 'bg-amber-50 text-amber-700' },
                  { key: 'پرداخت کامل', color: 'bg-emerald-50 text-emerald-700' },
                ].map(({ key, color }) => (
                  <div key={key} className={`rounded-lg px-3 py-2 text-center ${color}`}>
                    <div className="text-lg font-bold">{inv[key] ?? 0}</div>
                    <div className="text-[10px] leading-snug mt-0.5">{key}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Quick-pay modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPayModal(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-bold">{t('dashboard.quickPay.title')}</h2>
            <p className="mb-3 text-xs text-slate-500">{t('dashboard.quickPay.invoice')} {payModal.number} — {t('dashboard.quickPay.remaining')} {faMoney(payModal.remaining)}</p>
            {payErr && <div className="mb-2 text-sm text-rose-600">{payErr}</div>}
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('dashboard.quickPay.amountLabel')}</span>
                <input className="input" type="number" value={payModal.amount} onChange={(e) => setPayModal({ ...payModal, amount: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('dashboard.quickPay.payDateLabel')}</span>
                <JDatePicker className="input" value={payModal.date} onChange={(v) => setPayModal({ ...payModal, date: v })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('dashboard.quickPay.listNumberLabel')}</span>
                <input className="input" dir="ltr" placeholder={t('dashboard.quickPay.listPlaceholder')} value={payModal.listNumber} onChange={(e) => setPayModal({ ...payModal, listNumber: e.target.value })} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setPayModal(null)}>{t('dashboard.quickPay.cancel')}</button>
              <button
                className="btn btn-primary"
                disabled={!Number(payModal.amount) || payMut.isPending}
                onClick={() => payMut.mutate()}
              >{payMut.isPending ? t('common.submitting') : t('dashboard.quickPay.submit')}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

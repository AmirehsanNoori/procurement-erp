import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney, faDate, JMONTHS } from '../lib/format';

interface ExecData {
  portfolio: {
    totalApproved: number;
    totalReserved: number;
    totalActual: number;
    totalRemaining: number;
    burnPercent: number;
  };
  budgets: Array<{
    id: string;
    name: string | null;
    yearJalali: number;
    monthJalali: number;
    approved: number;
    reserved: number;
    actual: number;
    remaining: number;
    burnPercent: number;
  }>;
  overdueCount: number;
  overdueAmount: number;
  topSuppliers: Array<{ id: string; name: string; paid: number }>;
  invoiceBreakdown: Record<string, number>;
  spendTrend: Array<{ month: string; amount: number }>;
  requestStats: Array<{ status: string; count: number }>;
  summary: {
    requests: number;
    requestsArchived: number;
    invoices: number;
    suppliers: number;
    documents: number;
  };
}

function SpendTrendChart({ data }: { data: Array<{ month: string; amount: number }> }) {
  const W = 400, H = 120, PAD = 20;
  if (!data.length) return null;
  const maxVal = Math.max(...data.map((d) => d.amount), 1);
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - (d.amount / maxVal) * (H - PAD * 2);
    return { x, y, ...d };
  });
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const fillPoly = `${pts[0].x},${H - PAD} ` + polyline + ` ${pts[pts.length - 1].x},${H - PAD}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <polygon points={fillPoly} fill="#6366f120" />
      <polyline points={polyline} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p) => (
        <circle key={p.month} cx={p.x} cy={p.y} r={3} fill="#6366f1" />
      ))}
    </svg>
  );
}

function BurnBar({ pct, overrun }: { pct: number; overrun?: boolean }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  return (
    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${overrun ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Executive() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;

  const { data, isLoading } = useQuery<ExecData>({
    queryKey: ['executive', tid],
    queryFn: async () => (await api.get(`/${tid}/dashboard/executive`)).data,
    enabled: Boolean(tid),
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <Layout title={t('executive.title')}>
        <div className="py-12 text-center text-slate-400">{t('common.loading')}</div>
      </Layout>
    );
  }

  if (!data) return <Layout title={t('executive.title')}><div /></Layout>;

  const p = data.portfolio;
  const inv = data.invoiceBreakdown;

  return (
    <Layout title={t('executive.title')}>
      {/* Portfolio Overview */}
      <div className="card mb-4">
        <h2 className="text-sm font-bold text-slate-700 mb-4">{t('executive.portfolio')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="text-center">
            <div className="text-xs text-slate-500">{t('budgets.approved')}</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{faMoney(p.totalApproved)}</div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">{t('budgets.reserved')}</div>
            <div className="text-xl font-bold text-amber-700 mt-1">{faMoney(p.totalReserved)}</div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">{t('budgets.actual')}</div>
            <div className="text-xl font-bold text-blue-700 mt-1">{faMoney(p.totalActual)}</div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">{t('budgets.remaining')}</div>
            <div className={`text-xl font-bold mt-1 ${p.totalRemaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {faMoney(p.totalRemaining)}
            </div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
        </div>

        {/* Overall burn bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{t('budgets.burnPct')}</span>
            <span className="font-bold">{p.burnPercent}٪</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                p.burnPercent >= 100 ? 'bg-rose-500' : p.burnPercent >= 80 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(p.burnPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Overdue alert */}
      {data.overdueCount > 0 && (
        <div className="card mb-4 border-r-4 border-rose-400 bg-rose-50">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="text-sm font-bold text-rose-800">
                {data.overdueCount} {t('dashboard.overdue.title')}
              </div>
              <div className="text-xs text-rose-600">
                {t('dashboard.overdue.remainingLabel')}: {faMoney(data.overdueAmount)} {t('common.rial')}
              </div>
            </div>
            <div className="flex-1" />
            <Link to="/invoices" className="btn btn-outline text-xs border-rose-400 text-rose-700">
              {t('common.viewAll')}
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Budget table */}
        <div className="card overflow-x-auto p-0">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-700">{t('executive.budgetTable')}</h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-3">{t('budgets.title')}</th>
                <th className="p-3">{t('budgets.approved')}</th>
                <th className="p-3">{t('budgets.actual')}</th>
                <th className="p-3">{t('budgets.remaining')}</th>
                <th className="p-3">{t('budgets.burnPct')}</th>
              </tr>
            </thead>
            <tbody>
              {data.budgets.map((b) => {
                const label = b.name ?? `${JMONTHS[b.monthJalali] ?? b.monthJalali} ${b.yearJalali}`;
                const overrun = b.remaining < 0;
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="p-3 font-medium text-slate-700">{label}</td>
                    <td className="p-3 text-slate-600">{faMoney(b.approved)}</td>
                    <td className="p-3 text-slate-600">{faMoney(b.actual + b.reserved)}</td>
                    <td className={`p-3 font-bold ${overrun ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {faMoney(b.remaining)}
                    </td>
                    <td className="p-3 w-24">
                      <div className="flex items-center gap-2">
                        <BurnBar pct={b.burnPercent} overrun={overrun} />
                        <span className={`shrink-0 font-bold ${overrun ? 'text-rose-600' : b.burnPercent >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {b.burnPercent}٪
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data.budgets.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">{t('budgets.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {/* Invoice breakdown */}
          <div className="card">
            <h2 className="text-sm font-bold text-slate-700 mb-3">{t('dashboard.invoiceStatus.title')}</h2>
            <div className="space-y-2">
              {[
                { key: 'در انتظار بودجه', color: 'bg-slate-200', textColor: 'text-slate-700' },
                { key: 'در انتظار تأیید', color: 'bg-blue-200', textColor: 'text-blue-800' },
                { key: 'تأیید شده', color: 'bg-sky-200', textColor: 'text-sky-800' },
                { key: 'آماده پرداخت', color: 'bg-violet-200', textColor: 'text-violet-800' },
                { key: 'نیمه پرداخت', color: 'bg-amber-200', textColor: 'text-amber-800' },
                { key: 'پرداخت کامل', color: 'bg-emerald-200', textColor: 'text-emerald-800' },
                { key: 'کنسل شده', color: 'bg-rose-100', textColor: 'text-rose-700' },
              ]
                .filter(({ key }) => (inv[key] ?? 0) > 0)
                .map(({ key, color, textColor }) => {
                  const count = inv[key] ?? 0;
                  const total = Object.values(inv).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-24 text-xs text-slate-600 shrink-0">{key}</div>
                      <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className={`text-xs font-bold w-8 text-left ${textColor}`}>{count}</div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Top suppliers by payment */}
          {data.topSuppliers.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-700">{t('executive.topSuppliers')}</h2>
                <Link to="/suppliers" className="text-xs text-blue-600 hover:underline">{t('common.viewAll')}</Link>
              </div>
              <div className="space-y-2">
                {data.topSuppliers.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-4 text-center">{i + 1}</span>
                      <span className="font-medium text-slate-700">{s.name}</span>
                    </div>
                    <span className="font-bold text-slate-600">{faMoney(s.paid)} {t('common.rial')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary counts */}
          <div className="card">
            <h2 className="text-sm font-bold text-slate-700 mb-3">{t('executive.overdueTitle')}</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('requests.title')}</span>
                <span className="font-bold">{data.summary.requests}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('common.archive')}</span>
                <span className="font-bold">{data.summary.requestsArchived}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('invoices.title')}</span>
                <span className="font-bold">{data.summary.invoices}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('suppliers.title')}</span>
                <span className="font-bold">{data.summary.suppliers}</span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-slate-500">{t('dashboard.kpi.documents')}</span>
                <span className="font-bold">{data.summary.documents}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spend Trend + Request Stats */}
      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        {/* Monthly spending trend */}
        {data.spendTrend && (
          <div className="card">
            <h2 className="text-sm font-bold text-slate-700 mb-3">روند پرداخت‌های ماهانه</h2>
            <SpendTrendChart data={data.spendTrend} />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              {data.spendTrend.filter((_, i) => i % 3 === 0).map((d) => (
                <span key={d.month}>{d.month.slice(5)}</span>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>کمترین: {faMoney(Math.min(...data.spendTrend.map((d) => d.amount)))}</span>
              <span>بیشترین: {faMoney(Math.max(...data.spendTrend.map((d) => d.amount)))}</span>
            </div>
          </div>
        )}

        {/* Request status breakdown */}
        {data.requestStats && data.requestStats.length > 0 && (
          <div className="card">
            <h2 className="text-sm font-bold text-slate-700 mb-3">وضعیت درخواست‌ها</h2>
            <div className="space-y-2">
              {data.requestStats.sort((a, b) => b.count - a.count).map((rs) => {
                const total = data.requestStats.reduce((s, r) => s + r.count, 0);
                const pct = total > 0 ? Math.round((rs.count / total) * 100) : 0;
                return (
                  <div key={rs.status} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-slate-600 shrink-0">{rs.status}</div>
                    <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                      <div className="h-full rounded bg-indigo-400" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs font-bold w-8 text-left text-indigo-700">{rs.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-400 text-left">
        {faDate(new Date().toISOString())}
      </div>
    </Layout>
  );
}

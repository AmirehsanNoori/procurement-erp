import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney, JMONTHS } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';
import { SearchableSelect } from '../components/SearchableSelect';
import { downloadBlob } from '../lib/download';

const REPORT_TYPES: { value: string; label: string }[] = [
  { value: 'invoices', label: 'فاکتورهای باز' },
  { value: 'overdue', label: 'معوقات' },
  { value: 'budget', label: 'مصرف بودجه' },
  { value: 'suppliers', label: 'خلاصه تأمین‌کنندگان' },
  { value: 'schedule', label: 'برنامه پرداخت' },
  { value: 'kpi', label: 'KPI / صرفه‌جویی' },
];
const INVOICE_STATUSES = ['در انتظار بودجه', 'در انتظار تأیید', 'تأیید شده', 'آماده پرداخت', 'نیمه پرداخت', 'پرداخت کامل'];

interface ReportResult {
  columns: string[];
  rows: Record<string, string | number>[];
  kpis?: { label: string; value: number }[];
}

const MONEY_COLS = new Set(['جمع کل', 'پرداخت‌شده', 'مانده', 'مبلغ تأییدشده', 'رزرو شده', 'پرداخت واقعی', 'باقیمانده', 'مقدار']);

function ReportBuilder({ tid }: { tid: string }) {
  const [type, setType] = useState('invoices');
  const [supplier, setSupplier] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [submitted, setSubmitted] = useState<{ type: string; supplier: string; status: string; from: string; to: string } | null>(null);

  const suppliersQ = useQuery({
    queryKey: ['suppliers-opt', tid],
    queryFn: async () => (await api.get(`/${tid}/suppliers`)).data.suppliers as { id: string; name: string }[],
    enabled: Boolean(tid),
  });

  const params = (s: NonNullable<typeof submitted>) => ({
    type: s.type,
    supplier: s.supplier || undefined,
    status: s.status || undefined,
    from: s.from || undefined,
    to: s.to || undefined,
  });

  const reportQ = useQuery({
    queryKey: ['report-run', tid, submitted],
    queryFn: async () => (await api.get(`/${tid}/reports/run`, { params: params(submitted!) })).data as ReportResult,
    enabled: Boolean(tid && submitted),
  });

  const invoiceFilters = type === 'invoices' || type === 'overdue' || type === 'schedule';
  const result = reportQ.data;

  return (
    <div className="card mb-4">
      <h2 className="text-sm font-bold text-slate-700 mb-3">📑 گزارش‌ساز</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">نوع گزارش</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">تأمین‌کننده</span>
          <SearchableSelect
            value={supplier}
            onChange={setSupplier}
            placeholder="همه"
            disabled={!invoiceFilters}
            options={[{ value: '', label: 'همه' }, ...(suppliersQ.data ?? []).map((s) => ({ value: s.name, label: s.name }))]}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">وضعیت</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!invoiceFilters}>
            <option value="">همه</option>
            {INVOICE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">از تاریخ</span>
          <JDatePicker className="input" value={from} onChange={setFrom} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">تا تاریخ</span>
          <JDatePicker className="input" value={to} onChange={setTo} />
        </label>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary" onClick={() => setSubmitted({ type, supplier, status, from, to })}>اجرا</button>
          <button
            className="btn btn-outline"
            disabled={!submitted}
            onClick={() => downloadBlob(`/${tid}/reports/run?` + new URLSearchParams({ ...params(submitted!), format: 'xlsx' } as Record<string, string>).toString(), `report-${type}.xlsx`)}
          >📥 Excel</button>
        </div>
      </div>

      {reportQ.isFetching && <div className="py-6 text-center text-slate-400 text-sm">در حال اجرا...</div>}

      {result && !reportQ.isFetching && (
        <div className="mt-4">
          {result.kpis && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
              {result.kpis.map((k) => (
                <div key={k.label} className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{k.label}</div>
                  <div className="text-lg font-bold text-slate-800 mt-1">{faMoney(k.value)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            {result.rows.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">موردی یافت نشد</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-right text-slate-500">
                    {result.columns.map((c) => <th key={c} className="p-2">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {result.columns.map((c) => (
                        <td key={c} className="p-2">{MONEY_COLS.has(c) && typeof row[c] === 'number' ? faMoney(row[c] as number) : row[c]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface BudgetSummary {
  id: string;
  name: string | null;
  yearJalali: number;
  monthJalali: number;
  approved: number;
  reserved: number;
  actual: number;
  remaining: number;
  estimated: number;
  required: number;
  burnPercent: number;
  gapApprovedVsRequired: number;
}

interface ExecData {
  portfolio: {
    totalApproved: number;
    totalReserved: number;
    totalActual: number;
    totalRemaining: number;
    burnPercent: number;
  };
  budgets: BudgetSummary[];
  overdueCount: number;
  overdueAmount: number;
  invoiceBreakdown: Record<string, number>;
  summary: {
    requests: number;
    requestsArchived: number;
    invoices: number;
    suppliers: number;
    documents: number;
  };
}

function BudgetBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 text-[10px] text-slate-500 text-left shrink-0">{label}</div>
      <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-28 text-xs text-slate-700 text-left shrink-0">{faMoney(value)}</div>
    </div>
  );
}

export function Reports() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;

  const { data, isLoading } = useQuery<ExecData>({
    queryKey: ['reports-exec', tid],
    queryFn: async () => (await api.get(`/${tid}/dashboard/executive`)).data,
    enabled: Boolean(tid),
    staleTime: 120_000,
  });

  const p = data?.portfolio;
  const totalInvCount = data ? Object.values(data.invoiceBreakdown).reduce((a, b) => a + b, 0) : 0;
  const budgetsWithGap = data ? data.budgets.filter((b) => b.gapApprovedVsRequired < 0) : [];

  return (
    <Layout title={t('reports.title')}>
      <ReportBuilder tid={tid} />

      {isLoading && <div className="py-12 text-center text-slate-400">{t('common.loading')}</div>}
      {!isLoading && data && p && (
      <>
      {/* Portfolio KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        {[
          { label: t('budgets.approved'), value: p.totalApproved, color: 'border-blue-400' },
          { label: t('budgets.actual'), value: p.totalActual, color: 'border-emerald-400' },
          { label: t('budgets.reserved'), value: p.totalReserved, color: 'border-amber-400' },
          { label: t('budgets.remaining'), value: p.totalRemaining, color: p.totalRemaining < 0 ? 'border-rose-500' : 'border-slate-300' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`card border-r-4 ${color}`}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-xl font-bold mt-1 ${value < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
              {faMoney(value)}
            </div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        {/* Budget efficiency table */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t('reports.budgetEfficiency')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-right text-slate-500">
                  <th className="p-2">{t('budgets.title')}</th>
                  <th className="p-2">{t('analytics.forecast.spent')}</th>
                  <th className="p-2">{t('budgets.approved')}</th>
                  <th className="p-2">{t('budgets.actual')}</th>
                  <th className="p-2">{t('budgets.burnPct')}</th>
                </tr>
              </thead>
              <tbody>
                {data.budgets.map((b) => {
                  const label = b.name ?? `${JMONTHS[b.monthJalali] ?? b.monthJalali} ${b.yearJalali}`;
                  const efficiency = b.approved > 0 ? Math.round((b.actual / b.approved) * 100) : 0;
                  const underApproved = b.gapApprovedVsRequired < 0;
                  return (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="p-2 font-medium text-slate-700">{label}</td>
                      <td className="p-2 text-slate-500">{faMoney(b.estimated)}</td>
                      <td className={`p-2 font-medium ${underApproved ? 'text-rose-600' : 'text-slate-700'}`}>
                        {faMoney(b.approved)}
                        {underApproved && <span className="text-[9px] mr-1">⚠</span>}
                      </td>
                      <td className="p-2 text-blue-700">{faMoney(b.actual)}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${efficiency >= 80 ? 'bg-emerald-400' : efficiency >= 50 ? 'bg-blue-400' : 'bg-slate-300'}`}
                              style={{ width: `${Math.min(efficiency, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] w-8 text-left">{efficiency}٪</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.budgets.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-slate-400">{t('budgets.empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {budgetsWithGap.length > 0 && (
            <div className="mt-3 text-xs text-rose-600 bg-rose-50 rounded p-2">
              ⚠ {budgetsWithGap.length} {t('budgets.deficit')}
            </div>
          )}
        </div>

        {/* Invoice status chart */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t('reports.invoiceBreakdown')}</h2>
          <div className="space-y-2 mb-4">
            {[
              { key: 'در انتظار بودجه', bar: 'bg-slate-400' },
              { key: 'در انتظار تأیید', bar: 'bg-blue-400' },
              { key: 'تأیید شده', bar: 'bg-sky-400' },
              { key: 'آماده پرداخت', bar: 'bg-violet-400' },
              { key: 'نیمه پرداخت', bar: 'bg-amber-400' },
              { key: 'پرداخت کامل', bar: 'bg-emerald-400' },
              { key: 'کنسل شده', bar: 'bg-rose-300' },
            ].map(({ key, bar }) => {
              const count = data.invoiceBreakdown[key] ?? 0;
              if (count === 0) return null;
              return (
                <BudgetBar
                  key={key}
                  label={key}
                  value={count}
                  max={totalInvCount}
                  color={bar}
                />
              );
            })}
          </div>
          <div className="text-xs text-slate-500 text-left">
            {t('common.total')}: {totalInvCount} {t('invoices.title')}
          </div>
        </div>
      </div>

      {/* Budget spend breakdown */}
      <div className="card mb-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">{t('reports.spendWaterfall')}</h2>
        <div className="space-y-3">
          {data.budgets.map((b) => {
            const label = b.name ?? `${JMONTHS[b.monthJalali] ?? b.monthJalali} ${b.yearJalali}`;
            return (
              <div key={b.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{label}</span>
                  <span className="text-[10px] text-slate-400">{faMoney(b.approved)} {t('budgets.approved')}</span>
                </div>
                <div className="flex gap-0.5 h-4 rounded-full overflow-hidden bg-slate-100">
                  {b.approved > 0 && (
                    <>
                      <div
                        title={`${t('budgets.actual')}: ${faMoney(b.actual)}`}
                        className="bg-emerald-400 h-full"
                        style={{ width: `${Math.min((b.actual / b.approved) * 100, 100)}%` }}
                      />
                      <div
                        title={`${t('budgets.reserved')}: ${faMoney(b.reserved)}`}
                        className="bg-amber-300 h-full"
                        style={{ width: `${Math.min((b.reserved / b.approved) * 100, 100 - (b.actual / b.approved) * 100)}%` }}
                      />
                    </>
                  )}
                </div>
                <div className="flex gap-4 mt-1 text-[10px]">
                  <span className="text-emerald-600">■ {t('budgets.actual')}: {faMoney(b.actual)}</span>
                  <span className="text-amber-500">■ {t('budgets.reserved')}: {faMoney(b.reserved)}</span>
                  <span className={b.remaining < 0 ? 'text-rose-600' : 'text-slate-400'}>
                    ■ {t('budgets.remaining')}: {faMoney(b.remaining)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary stats */}
      <div className="card">
        <h2 className="text-sm font-bold text-slate-700 mb-3">{t('executive.portfolio')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: t('budgets.burnPct'), value: `${p.burnPercent}٪` },
            { label: t('dashboard.overdue.title'), value: data.overdueCount, danger: data.overdueCount > 0 },
            { label: t('executive.overdueTitle'), value: `${faMoney(data.overdueAmount)} ${t('common.rial')}`, danger: data.overdueAmount > 0 },
            { label: t('requests.title'), value: data.summary.requests },
            { label: t('suppliers.title'), value: data.summary.suppliers },
            { label: t('dashboard.kpi.documents'), value: data.summary.documents },
          ].map(({ label, value, danger }) => (
            <div key={label} className={`rounded-lg border p-3 ${danger ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}>
              <div className="text-[10px] text-slate-500">{label}</div>
              <div className={`text-lg font-bold mt-1 ${danger ? 'text-rose-700' : 'text-slate-800'}`}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </Layout>
  );
}

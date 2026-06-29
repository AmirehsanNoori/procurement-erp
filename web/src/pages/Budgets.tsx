import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate, JMONTHS } from '../lib/format';

interface BudgetSummary {
  required: number; approved: number; reserved: number; actual: number; remaining: number; estimated: number; burnPercent: number;
}
interface BudgetAllocation {
  id: string; yearJalali: number; monthJalali: number; percentage: number; amount: number;
}
interface Budget {
  id: string; name: string | null; yearJalali: number; monthJalali: number;
  estimatedCost: string; contingencyPercent: string; approvedBudget: string;
  summary: BudgetSummary;
  allocations: BudgetAllocation[];
}
interface Totals { estimated: number; required: number; approved: number; reserved: number; actual: number; remaining: number; }
interface BudgetInvoice {
  id: string; invoiceNumber: string; supplier: string; requestNumber: string;
  totalAmount: number; paidAmount: number; remainingAmount: number;
  status: string; invoiceDate: string | null; dueDate: string | null; sentToAccounting: boolean;
}
interface UnbudgetedInvoice {
  id: string; invoiceNumber: string; supplier: string; requestNumber: string;
  totalAmount: number; remainingAmount: number; status: string;
  dueDate: string | null; invoiceDate: string | null;
}

const EMPTY = { id: '', name: '', yearJalali: 1404, monthJalali: 4, estimatedCost: '', contingencyPercent: '0', approvedBudget: '' };
type AllocRow = { yearJalali: number; monthJalali: number; percentage: number };

const STATUS_COLORS: Record<string, string> = {
  'پرداخت کامل': 'bg-emerald-100 text-emerald-700',
  'نیمه پرداخت': 'bg-blue-100 text-blue-700',
  'آماده پرداخت': 'bg-amber-100 text-amber-700',
  'تأیید شده': 'bg-sky-100 text-sky-700',
  'در انتظار بودجه': 'bg-slate-100 text-slate-500',
  'کنسل شده': 'bg-rose-100 text-rose-600',
};

interface PlanRow { type: string; number: string; request: string; supplier: string; amount: number; paid: number; remaining: number; date: string | null; status: string }
interface PlanMonth { key: string; label: string; total: number; rows: PlanRow[] }

function MonthlyPaymentPlan({ tid }: { tid: string }) {
  const { data } = useQuery({
    queryKey: ['budget-payment-plan', tid],
    queryFn: async () => (await api.get(`/${tid}/budgets/payment-plan`)).data.months as PlanMonth[],
    enabled: Boolean(tid),
  });
  if (!data) return null;
  return (
    <div className="card mt-4">
      <h2 className="text-sm font-bold text-slate-700 mb-3">📅 برنامه پرداخت ماهانه</h2>
      {data.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-6">برنامه پرداخت ماهانه‌ای وجود ندارد.</div>
      ) : (
        <div className="space-y-4">
          {data.map((m) => (
            <div key={m.key}>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700">{m.label}</h3>
                <span className="text-xs font-bold text-blue-700">قابل پرداخت: {faMoney(m.total)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-right text-slate-500">
                      <th className="p-2">نوع</th><th className="p-2">شماره</th><th className="p-2">درخواست</th><th className="p-2">تأمین‌کننده</th>
                      <th className="p-2">مبلغ</th><th className="p-2">پرداخت‌شده</th><th className="p-2">مانده</th><th className="p-2">تاریخ</th><th className="p-2">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2">{r.type}</td>
                        <td className="p-2 font-bold">{r.number}</td>
                        <td className="p-2 text-blue-700">{r.request || '—'}</td>
                        <td className="p-2">{r.supplier}</td>
                        <td className="p-2">{faMoney(r.amount)}</td>
                        <td className="p-2 text-emerald-700">{faMoney(r.paid)}</td>
                        <td className={`p-2 font-bold ${r.remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{faMoney(r.remaining)}</td>
                        <td className="p-2">{faDate(r.date)}</td>
                        <td className="p-2">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Budgets() {
  const { t } = useTranslation();
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showUnbudgeted, setShowUnbudgeted] = useState(false);
  const [useAlloc, setUseAlloc] = useState(false);
  const [allocRows, setAllocRows] = useState<AllocRow[]>([{ yearJalali: 1404, monthJalali: 1, percentage: 100 }]);

  const { data, isLoading } = useQuery({
    queryKey: ['budgets', tid],
    queryFn: async () => (await api.get(`/${tid}/budgets`)).data as { budgets: Budget[]; totals: Totals },
    enabled: Boolean(tid),
  });

  const invoicesQ = useQuery({
    queryKey: ['budget-invoices', tid, expandedId],
    queryFn: async () => (await api.get(`/${tid}/budgets/${expandedId}/invoices`)).data as { invoices: BudgetInvoice[]; total: number },
    enabled: Boolean(expandedId),
  });

  const unbudgetedQ = useQuery({
    queryKey: ['unbudgeted-invoices', tid],
    queryFn: async () => (await api.get(`/${tid}/budgets/unbudgeted`)).data as { invoices: UnbudgetedInvoice[]; total: number },
    enabled: Boolean(tid) && showUnbudgeted,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const allocTotal = allocRows.reduce((s, r) => s + r.percentage, 0);
      if (useAlloc && Math.round(allocTotal) !== 100) throw new Error('مجموع درصدها باید ۱۰۰ باشد');
      const payload: Record<string, unknown> = {
        name: form.name || undefined,
        yearJalali: Number(form.yearJalali),
        monthJalali: Number(form.monthJalali),
        estimatedCost: Number(form.estimatedCost || 0),
        contingencyPercent: Number(form.contingencyPercent || 0),
        approvedBudget: form.approvedBudget ? Number(form.approvedBudget) : undefined,
        allocations: useAlloc ? allocRows : [],
      };
      if (form.id) return api.patch(`/${tid}/budgets/${form.id}`, payload);
      return api.post(`/${tid}/budgets`, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets', tid] }); setOpen(false); setForm(EMPTY); setAllocRows([{ yearJalali: 1404, monthJalali: 1, percentage: 100 }]); setUseAlloc(false); },
    onError: (e) => setErr(apiError(e)),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/budgets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets', tid] }),
  });

  const requiredPreview = Math.ceil(Number(form.estimatedCost || 0) * (1 + Number(form.contingencyPercent || 0) / 100));
  const totals = data?.totals;
  const allocTotal = allocRows.reduce((s, r) => s + r.percentage, 0);

  function edit(b: Budget) {
    setForm({ id: b.id, name: b.name ?? '', yearJalali: b.yearJalali, monthJalali: b.monthJalali, estimatedCost: String(b.estimatedCost), contingencyPercent: String(b.contingencyPercent), approvedBudget: String(b.approvedBudget) });
    const hasAlloc = b.allocations && b.allocations.length > 0;
    setUseAlloc(hasAlloc);
    setAllocRows(hasAlloc ? b.allocations.map((a) => ({ yearJalali: a.yearJalali, monthJalali: a.monthJalali, percentage: a.percentage })) : [{ yearJalali: b.yearJalali, monthJalali: b.monthJalali, percentage: 100 }]);
    setErr(''); setOpen(true);
  }
  function submit(e: FormEvent) { e.preventDefault(); setErr(''); saveMut.mutate(); }
  function toggleExpand(id: string) { setExpandedId((prev) => (prev === id ? null : id)); }

  function addAllocRow() {
    setAllocRows((r) => [...r, { yearJalali: Number(form.yearJalali), monthJalali: 1, percentage: 0 }]);
  }
  function removeAllocRow(i: number) {
    setAllocRows((r) => r.filter((_, idx) => idx !== i));
  }
  function setAllocField(i: number, field: keyof AllocRow, val: number) {
    setAllocRows((r) => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  return (
    <Layout title={t('budgets.title')}>
      <div className="mb-3 flex justify-between items-center">
        <button
          className={`btn text-xs px-3 py-1.5 ${showUnbudgeted ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setShowUnbudgeted((v) => !v)}
        >
          {t('budgets.unbudgetedInvoices', 'فاکتورهای بدون بودجه')}
          {unbudgetedQ.data && <span className="mr-1 rounded-full bg-rose-500 text-white text-[10px] px-1.5">{unbudgetedQ.data.total}</span>}
        </button>
        {can('monthly_budget.create') && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setErr(''); setUseAlloc(false); setAllocRows([{ yearJalali: 1404, monthJalali: 1, percentage: 100 }]); setOpen(true); }}>
            {t('budgets.addNew')}
          </button>
        )}
      </div>

      {/* Unbudgeted invoices panel */}
      {showUnbudgeted && (
        <div className="card mb-4 border-2 border-rose-200">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-bold text-rose-700">{t('budgets.unbudgetedInvoices', 'فاکتورهای بدون بودجه')}</span>
            <span className="text-xs text-slate-500">{t('budgets.unbudgetedHint', 'این فاکتورها هنوز به هیچ بودجه‌ای متصل نشده‌اند')}</span>
          </div>
          {unbudgetedQ.isFetching ? (
            <div className="py-4 text-center text-xs text-slate-400">{t('common.loading')}</div>
          ) : (unbudgetedQ.data?.invoices ?? []).length === 0 ? (
            <div className="py-3 text-center text-xs text-emerald-600">✓ {t('budgets.noUnbudgeted', 'همه فاکتورها دارای بودجه هستند')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right text-slate-500 bg-rose-50">
                    <th className="pb-1 px-2 py-2">{t('invoices.cols.number')}</th>
                    <th className="pb-1 px-2 py-2">{t('requests.cols.number')}</th>
                    <th className="pb-1 px-2 py-2">{t('common.supplier')}</th>
                    <th className="pb-1 px-2 py-2">{t('invoices.cols.dueDate')}</th>
                    <th className="pb-1 px-2 py-2">{t('invoices.cols.amount')}</th>
                    <th className="pb-1 px-2 py-2">{t('invoices.cols.remaining')}</th>
                    <th className="pb-1 px-2 py-2">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(unbudgetedQ.data?.invoices ?? []).map((inv) => (
                    <tr key={inv.id} className={`border-t border-slate-200 ${inv.dueDate && new Date(inv.dueDate) < new Date() ? 'bg-rose-50' : ''}`}>
                      <td className="py-1.5 px-2 font-bold text-slate-800">{inv.invoiceNumber}</td>
                      <td className="py-1.5 px-2 text-blue-700">{inv.requestNumber || '—'}</td>
                      <td className="py-1.5 px-2">{inv.supplier}</td>
                      <td className={`py-1.5 px-2 font-semibold ${inv.dueDate && new Date(inv.dueDate) < new Date() ? 'text-rose-600' : ''}`}>
                        {faDate(inv.dueDate)}
                      </td>
                      <td className="py-1.5 px-2 font-bold">{faMoney(inv.totalAmount)}</td>
                      <td className="py-1.5 px-2 font-bold text-rose-600">{faMoney(inv.remainingAmount)}</td>
                      <td className="py-1.5 px-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-rose-200">
                    <td colSpan={4} className="pt-1 px-2 text-slate-500">{t('common.total')}</td>
                    <td className="pt-1 px-2 font-bold">{faMoney((unbudgetedQ.data?.invoices ?? []).reduce((a, i) => a + i.totalAmount, 0))}</td>
                    <td className="pt-1 px-2 font-bold text-rose-600">{faMoney((unbudgetedQ.data?.invoices ?? []).reduce((a, i) => a + i.remainingAmount, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {totals && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t('analytics.forecast.spent'), totals.estimated],
            [t('budgets.reserved'), totals.required],
            [t('budgets.approved'), totals.approved],
            [t('budgets.actual'), totals.actual],
          ].map(([l, v]) => (
            <div key={l as string} className="card"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-lg font-bold">{faMoney(v as number)}</div><div className="text-xs text-slate-400">{t('common.rial')}</div></div>
          ))}
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="card mb-4 grid gap-3 sm:grid-cols-3">
          {err && <div className="sm:col-span-3 text-sm text-rose-600">{err}</div>}
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('budgets.form.name')}</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('budgets.form.year')}</span><input className="input" type="number" value={form.yearJalali} onChange={(e) => setForm({ ...form, yearJalali: Number(e.target.value) })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('budgets.form.month')}</span>
            <select className="input" value={form.monthJalali} onChange={(e) => setForm({ ...form, monthJalali: Number(e.target.value) })}>
              {JMONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('budgets.form.amount')}</span><input className="input" type="number" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} required /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('budgets.form.contingency', 'احتیاط %')}</span><input className="input" type="number" value={form.contingencyPercent} onChange={(e) => setForm({ ...form, contingencyPercent: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('budgets.reserved')} ({t('common.result')})</span><input className="input bg-slate-50 font-bold" value={faMoney(requiredPreview)} readOnly /></label>
          <label className="block sm:col-span-3"><span className="mb-1 block text-xs font-bold text-slate-600">{t('budgets.approved')}</span><input className="input" type="number" value={form.approvedBudget} onChange={(e) => setForm({ ...form, approvedBudget: e.target.value })} /></label>

          {/* Monthly distribution toggle */}
          <div className="sm:col-span-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useAlloc} onChange={(e) => setUseAlloc(e.target.checked)} className="h-4 w-4" />
              <span className="text-xs font-bold text-slate-600">{t('budgets.form.monthlyDistribution', 'توزیع ماهانه بودجه')}</span>
            </label>
          </div>

          {useAlloc && (
            <div className="sm:col-span-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{t('budgets.form.allocations', 'توزیع ماهانه')}</span>
                <span className={`text-xs font-bold ${Math.round(allocTotal) === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {t('budgets.form.totalPct', 'مجموع')}: {allocTotal}%
                </span>
              </div>
              <div className="space-y-2">
                {allocRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="number" min={1400} max={1420} className="input w-24 text-xs" value={row.yearJalali} onChange={(e) => setAllocField(i, 'yearJalali', Number(e.target.value))} placeholder={t('budgets.form.year')} />
                    <select className="input w-28 text-xs" value={row.monthJalali} onChange={(e) => setAllocField(i, 'monthJalali', Number(e.target.value))}>
                      {JMONTHS.slice(1).map((m, mi) => <option key={m} value={mi + 1}>{m}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} max={100} className="input w-20 text-xs" value={row.percentage} onChange={(e) => setAllocField(i, 'percentage', Number(e.target.value))} />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                    <span className="text-xs text-slate-500">{faMoney(Math.round((requiredPreview * row.percentage) / 100))}</span>
                    {allocRows.length > 1 && (
                      <button type="button" className="text-rose-500 text-xs hover:text-rose-700" onClick={() => removeAllocRow(i)}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="mt-2 text-xs text-blue-600 hover:underline" onClick={addAllocRow}>
                + {t('budgets.form.addMonth', 'افزودن ماه')}
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 sm:col-span-3">
            <button className="btn btn-primary" disabled={saveMut.isPending}>{t('common.save')}</button>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="card text-center text-slate-400">{t('common.loading')}</div>
      ) : (data?.budgets ?? []).length === 0 ? (
        <div className="card text-center text-slate-400">{t('budgets.empty')}</div>
      ) : (
        <div className="grid gap-3">
          {data!.budgets.map((b) => {
            const s = b.summary;
            const pct = Math.min(100, s.burnPercent);
            const isExpanded = expandedId === b.id;
            return (
              <div key={b.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{b.name || `${JMONTHS[b.monthJalali]} ${b.yearJalali}`}</h3>
                    {b.allocations && b.allocations.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {b.allocations.map((a, i) => (
                          <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                            {JMONTHS[a.monthJalali]} {a.yearJalali}: {a.percentage}%
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{t('budgets.approved')}: <b>{faMoney(s.approved)}</b></span>
                    <button
                      className={`btn px-2 py-1 text-xs ${isExpanded ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => toggleExpand(b.id)}
                    >
                      {isExpanded ? '▲ ' + t('common.close') : t('budgets.viewInvoices')}
                    </button>
                    {can('monthly_budget.edit') && <button className="btn btn-outline px-2 py-1" onClick={() => edit(b)}>✏️</button>}
                    {can('monthly_budget.delete') && <button className="btn btn-outline px-2 py-1 text-rose-600" onClick={() => { if (confirm(t('budgets.confirm.delete'))) delMut.mutate(b.id); }}>🗑</button>}
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">{pct}% {t('budgets.burnPct')}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#2563eb' }} />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    [t('analytics.forecast.spent'), s.estimated],
                    [t('budgets.reserved'), s.required],
                    [t('budgets.approved'), s.approved],
                    [t('budgets.reserved'), s.reserved],
                    [t('budgets.actual'), s.actual],
                    [t('budgets.remaining'), s.remaining],
                  ].map(([l, v], idx) => (
                    <div key={idx} className="rounded-lg bg-slate-50 p-2">
                      <div className="text-[10px] text-slate-500">{l}</div>
                      <div className={`text-sm font-bold ${l === t('budgets.remaining') && (v as number) < 0 ? 'text-rose-600' : ''}`}>{faMoney(v as number)}</div>
                    </div>
                  ))}
                </div>

                {/* Invoice drill-down panel */}
                {isExpanded && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 text-xs font-bold text-slate-600">{t('invoices.title')}</div>
                    {invoicesQ.isFetching && expandedId === b.id ? (
                      <div className="py-4 text-center text-xs text-slate-400">{t('common.loading')}</div>
                    ) : (invoicesQ.data?.invoices ?? []).length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400">{t('invoices.empty')}</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-right text-slate-500">
                              <th className="pb-1 px-2 py-1.5">{t('invoices.cols.number')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('requests.cols.number')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('invoices.cols.supplier')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('common.date')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('invoices.cols.dueDate')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('invoices.cols.amount')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('invoices.cols.paid')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('invoices.cols.remaining')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('invoices.cols.status')}</th>
                              <th className="pb-1 px-2 py-1.5">{t('invoices.accounting.sentToAccounting')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(invoicesQ.data?.invoices ?? []).map((inv) => (
                              <tr key={inv.id} className={`border-t border-slate-200 ${inv.dueDate && new Date(inv.dueDate) < new Date() && inv.remainingAmount > 0 ? 'bg-rose-50' : ''}`}>
                                <td className="py-1.5 px-2 font-bold">{inv.invoiceNumber}</td>
                                <td className="py-1.5 px-2 text-blue-700 font-semibold">{inv.requestNumber || '—'}</td>
                                <td className="py-1.5 px-2">{inv.supplier}</td>
                                <td className="py-1.5 px-2">{faDate(inv.invoiceDate)}</td>
                                <td className={`py-1.5 px-2 font-semibold ${inv.dueDate && new Date(inv.dueDate) < new Date() && inv.remainingAmount > 0 ? 'text-rose-600' : ''}`}>
                                  {faDate(inv.dueDate)}
                                </td>
                                <td className="py-1.5 px-2 font-bold text-slate-700">{faMoney(inv.totalAmount)}</td>
                                <td className="py-1.5 px-2 text-emerald-700">{faMoney(inv.paidAmount)}</td>
                                <td className={`py-1.5 px-2 font-bold ${inv.remainingAmount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{faMoney(inv.remainingAmount)}</td>
                                <td className="py-1.5 px-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                    {inv.status}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2">
                                  {inv.sentToAccounting ? (
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">{t('invoices.detail.sentToAccounting')}</span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                              <td colSpan={5} className="pt-1 px-2 text-right text-slate-500">{t('common.total')}</td>
                              <td className="pt-1 px-2 font-bold">{faMoney((invoicesQ.data?.invoices ?? []).reduce((a, i) => a + i.totalAmount, 0))}</td>
                              <td className="pt-1 px-2 text-emerald-700">{faMoney((invoicesQ.data?.invoices ?? []).reduce((a, i) => a + i.paidAmount, 0))}</td>
                              <td className="pt-1 px-2 text-rose-600">{faMoney((invoicesQ.data?.invoices ?? []).reduce((a, i) => a + i.remainingAmount, 0))}</td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <MonthlyPaymentPlan tid={tid} />
    </Layout>
  );
}

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';

interface FiscalYear { id: string; title: string; }
interface Account { id: string; code: string; name: string; type: string; isPostable: boolean; }
interface Row { id: string; accountId: string; code: string; name: string; type: string; budget: number; actual: number; variance: number; usedPct: number; }

const TYPE_FA: Record<string, string> = { asset: 'دارایی', liability: 'بدهی', equity: 'حقوق مالکانه', income: 'درآمد', expense: 'هزینه' };

export function FinBudgets() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [fyId, setFyId] = useState('');
  const [editor, setEditor] = useState(false);
  const [accId, setAccId] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');

  const yearsQ = useQuery({
    queryKey: ['fin-fiscal-years', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/fiscal-years`)).data.fiscalYears as FiscalYear[],
    enabled: !!tid,
  });
  useEffect(() => { if (!fyId && yearsQ.data?.length) setFyId(yearsQ.data[0].id); }, [yearsQ.data, fyId]);

  const accountsQ = useQuery({
    queryKey: ['fin-accounts', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/accounts`)).data.accounts as Account[],
    enabled: !!tid,
  });
  const bvaQ = useQuery({
    queryKey: ['fin-bva', tid, fyId],
    queryFn: async () => (await api.get(`/${tid}/finance/budget-vs-actual`, { params: { fiscalYearId: fyId } })).data as { rows: Row[]; totals: { budget: number; actual: number; variance: number } },
    enabled: !!tid && !!fyId,
  });

  const save = useMutation({
    mutationFn: async () => api.post(`/${tid}/finance/budgets`, { accountId: accId, fiscalYearId: fyId, amount: Number(amount) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-bva', tid, fyId] }); setEditor(false); setAccId(''); setAmount(''); },
    onError: (e) => setErr(apiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/finance/budgets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-bva', tid, fyId] }),
    onError: (e) => setErr(apiError(e)),
  });

  const canManage = can('finance.create');
  const canDelete = can('finance.delete');
  const rows = bvaQ.data?.rows ?? [];
  const accountOptions = (accountsQ.data ?? []).filter((a) => a.isPostable).map((a) => ({ value: a.id, label: `${a.code} — ${a.name} (${TYPE_FA[a.type] ?? a.type})` }));

  return (
    <Layout title="بودجه و عملکرد">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm"><span className="font-bold text-slate-600">سال مالی:</span>
          <select className="input" value={fyId} onChange={(e) => setFyId(e.target.value)}>
            <option value="">— انتخاب —</option>
            {(yearsQ.data ?? []).map((y) => <option key={y.id} value={y.id}>{y.title}</option>)}
          </select>
        </label>
        {canManage && fyId && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setEditor(true); }}>＋ تعریف بودجه</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      {!fyId ? (
        <div className="card p-8 text-center text-slate-400">یک سال مالی انتخاب کنید. اگر سال مالی ندارید، از صفحهٔ «سال مالی» ایجاد کنید.</div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card"><div className="text-xs text-slate-500">جمع بودجه</div><div className="mt-1 text-lg font-bold tabular-nums">{faMoney(bvaQ.data?.totals.budget ?? 0)}</div></div>
            <div className="card"><div className="text-xs text-slate-500">جمع عملکرد</div><div className="mt-1 text-lg font-bold tabular-nums">{faMoney(bvaQ.data?.totals.actual ?? 0)}</div></div>
            <div className="card"><div className="text-xs text-slate-500">انحراف</div><div className={`mt-1 text-lg font-bold tabular-nums ${(bvaQ.data?.totals.variance ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{faMoney(bvaQ.data?.totals.variance ?? 0)}</div></div>
          </div>

          <div className="card overflow-x-auto p-0">
            {bvaQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : rows.length === 0 ? (
              <div className="p-8 text-center text-slate-400">برای این سال مالی بودجه‌ای تعریف نشده. «تعریف بودجه» را بزنید.</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">حساب</th><th className="p-3">نوع</th><th className="p-3">بودجه</th><th className="p-3">عملکرد</th><th className="p-3">انحراف</th><th className="p-3">مصرف</th>{canDelete && <th className="p-3"></th>}</tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const over = r.usedPct > 100;
                    return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-3"><span className="font-mono text-xs text-slate-400">{r.code}</span> {r.name}</td>
                        <td className="p-3 text-xs text-slate-500">{TYPE_FA[r.type] ?? r.type}</td>
                        <td className="p-3 tabular-nums">{faMoney(r.budget)}</td>
                        <td className="p-3 tabular-nums">{faMoney(r.actual)}</td>
                        <td className={`p-3 tabular-nums font-semibold ${r.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{faMoney(r.variance)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full ${over ? 'bg-rose-500' : r.usedPct > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(0, r.usedPct))}%` }} />
                            </div>
                            <span className={`text-xs tabular-nums ${over ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{r.usedPct}٪</span>
                          </div>
                        </td>
                        {canDelete && <td className="p-3"><button className="text-xs text-rose-500 hover:underline" disabled={del.isPending} onClick={() => { if (confirm('حذف بودجهٔ این حساب؟')) del.mutate(r.id); }}>حذف</button></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {editor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12" onClick={() => setEditor(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-base font-bold text-slate-800">تعریف / ویرایش بودجه</h2>
            {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">حساب معین</span>
                <SearchableSelect value={accId} onChange={setAccId} options={accountOptions} placeholder="انتخاب حساب..." />
              </label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">مبلغ بودجه</span>
                <input className="input w-full tabular-nums" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <p className="text-xs text-slate-400">اگر برای این حساب بودجه‌ای وجود داشته باشد، به‌روزرسانی می‌شود.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setEditor(false)}>انصراف</button>
              <button className="btn btn-primary" disabled={save.isPending || !accId || !(Number(amount) >= 0) || amount === ''} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

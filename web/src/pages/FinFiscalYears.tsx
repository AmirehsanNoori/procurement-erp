import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate, faMoney } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface FiscalYear { id: string; title: string; startDate: string; endDate: string; status: string; }

export function FinFiscalYears() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [err, setErr] = useState('');

  const yearsQ = useQuery({
    queryKey: ['fin-fiscal-years', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/fiscal-years`)).data.fiscalYears as FiscalYear[],
    enabled: !!tid,
  });

  const create = useMutation({
    mutationFn: async () => api.post(`/${tid}/finance/fiscal-years`, { title, startDate: start, endDate: end }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-fiscal-years', tid] }); setCreating(false); setTitle(''); setStart(''); setEnd(''); },
    onError: (e) => setErr(apiError(e)),
  });

  const close = useMutation({
    mutationFn: async (id: string) => (await api.post(`/${tid}/finance/fiscal-years/${id}/close`)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['fin-fiscal-years', tid] });
      qc.invalidateQueries({ queryKey: ['fin-journals', tid] });
      const net = data?.netIncome ?? 0;
      alert(`سال مالی بسته شد. سند اختتامیه شماره ${data?.journal?.number} ثبت شد. ${net >= 0 ? 'سود' : 'زیان'} دوره: ${faMoney(Math.abs(net))}`);
    },
    onError: (e) => setErr(apiError(e)),
  });

  const reopen = useMutation({
    mutationFn: async (id: string) => api.post(`/${tid}/finance/fiscal-years/${id}/reopen`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fin-fiscal-years', tid] }); qc.invalidateQueries({ queryKey: ['fin-journals', tid] }); },
    onError: (e) => setErr(apiError(e)),
  });

  const canManage = can('finance.create');
  const canClose = can('finance.post');

  return (
    <Layout title="سال مالی">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">با بستن سال مالی، سند اختتامیه (انتقال سود/زیان به انباشته) به‌صورت قطعی ثبت و امکان ثبت سند در آن بازه مسدود می‌شود.</p>
        {canManage && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ سال مالی جدید</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {yearsQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (yearsQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">سال مالی ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">عنوان</th><th className="p-3">شروع</th><th className="p-3">پایان</th><th className="p-3">وضعیت</th><th className="p-3"></th></tr></thead>
            <tbody>
              {(yearsQ.data ?? []).map((y) => (
                <tr key={y.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-800">{y.title}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(y.startDate)}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(y.endDate)}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${y.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{y.status === 'open' ? 'باز' : 'بسته'}</span></td>
                  <td className="p-3">
                    {y.status === 'open' && canClose && <button className="text-xs text-rose-600 hover:underline" disabled={close.isPending} onClick={() => { if (confirm(`بستن سال مالی «${y.title}»؟ این عمل قطعی است.`)) { setErr(''); close.mutate(y.id); } }}>بستن سال مالی</button>}
                    {y.status === 'closed' && canClose && <button className="text-xs text-blue-600 hover:underline" disabled={reopen.isPending} onClick={() => { if (confirm(`بازگشایی سال مالی «${y.title}»؟ سند اختتامیه باطل می‌شود.`)) { setErr(''); reopen.mutate(y.id); } }}>بازگشایی</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12" onClick={() => setCreating(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-base font-bold text-slate-800">سال مالی جدید</h2>
            {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">عنوان</span><input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً سال مالی ۱۴۰۵" /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ شروع</span><JDatePicker value={start} onChange={setStart} /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ پایان</span><JDatePicker value={end} onChange={setEnd} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setCreating(false)}>انصراف</button>
              <button className="btn btn-primary" disabled={create.isPending || !title || !start || !end} onClick={() => { setErr(''); create.mutate(); }}>ذخیره</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

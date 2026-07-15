import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface Row { costCenterId: string; code: string; name: string; income: number; expense: number; net: number; }

export function FinCostCenterReport() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const q = useQuery({
    queryKey: ['fin-cc-report', tid, from, to],
    queryFn: async () => (await api.get(`/${tid}/finance/cost-center-report`, { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } })).data as { rows: Row[]; totals: { income: number; expense: number; net: number } },
    enabled: !!tid,
  });
  const rows = q.data?.rows ?? [];

  return (
    <Layout title="گزارش مراکز هزینه">
      <div className="card mb-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">از تاریخ</span><JDatePicker value={from} onChange={setFrom} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تا تاریخ</span><JDatePicker value={to} onChange={setTo} /></label>
        </div>
        <p className="mt-2 text-xs text-slate-400">درآمد و هزینه به تفکیک مرکز هزینه (اسناد قطعی). سطرهای بدون مرکز هزینه در ردیف «بدون مرکز هزینه» تجمیع می‌شوند.</p>
      </div>

      <div className="card overflow-x-auto p-0">
        {q.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">گردشی برای نمایش وجود ندارد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">مرکز هزینه</th><th className="p-3">درآمد</th><th className="p-3">هزینه</th><th className="p-3">خالص</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.costCenterId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500">{r.code}</td>
                  <td className="p-3 font-semibold text-slate-800">{r.name}</td>
                  <td className="p-3 tabular-nums text-emerald-600">{r.income ? faMoney(r.income) : '—'}</td>
                  <td className="p-3 tabular-nums text-amber-700">{r.expense ? faMoney(r.expense) : '—'}</td>
                  <td className={`p-3 tabular-nums font-semibold ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{faMoney(r.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="p-3" colSpan={2}>جمع کل</td>
                <td className="p-3 tabular-nums text-emerald-600">{faMoney(q.data?.totals.income ?? 0)}</td>
                <td className="p-3 tabular-nums text-amber-700">{faMoney(q.data?.totals.expense ?? 0)}</td>
                <td className="p-3 tabular-nums">{faMoney(q.data?.totals.net ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </Layout>
  );
}

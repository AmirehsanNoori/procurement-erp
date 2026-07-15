import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { faMoney } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface Row { accountId: string; code: string; name: string; type: string; debit: number; credit: number; balanceDebit: number; balanceCredit: number; }

export function FinTrialBalance() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const tbQ = useQuery({
    queryKey: ['fin-trial-balance', tid, from, to],
    queryFn: async () => (await api.get(`/${tid}/finance/trial-balance`, { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } })).data as { rows: Row[]; totals: { debit: number; credit: number } },
    enabled: !!tid,
  });
  const rows = tbQ.data?.rows ?? [];
  const balDebit = rows.reduce((s, r) => s + r.balanceDebit, 0);
  const balCredit = rows.reduce((s, r) => s + r.balanceCredit, 0);

  return (
    <Layout title="تراز آزمایشی">
      <div className="card mb-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">از تاریخ</span><JDatePicker value={from} onChange={setFrom} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تا تاریخ</span><JDatePicker value={to} onChange={setTo} /></label>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-slate-400">فقط اسناد «قطعی» در تراز لحاظ می‌شوند.</p>
          <button className="btn btn-outline px-3 py-1 text-xs" onClick={() => downloadBlob(`/${tid}/finance/trial-balance?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), format: 'csv' }).toString()}`, 'trial-balance.csv')}>📥 خروجی</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        {tbQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">گردشی برای نمایش وجود ندارد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">نام حساب</th><th className="p-3">گردش بدهکار</th><th className="p-3">گردش بستانکار</th><th className="p-3">مانده بدهکار</th><th className="p-3">مانده بستانکار</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500">{r.code}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3 tabular-nums">{r.debit ? faMoney(r.debit) : '—'}</td>
                  <td className="p-3 tabular-nums">{r.credit ? faMoney(r.credit) : '—'}</td>
                  <td className="p-3 tabular-nums font-semibold">{r.balanceDebit ? faMoney(r.balanceDebit) : '—'}</td>
                  <td className="p-3 tabular-nums font-semibold">{r.balanceCredit ? faMoney(r.balanceCredit) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="p-3" colSpan={2}>جمع کل</td>
                <td className="p-3 tabular-nums">{faMoney(tbQ.data?.totals.debit ?? 0)}</td>
                <td className="p-3 tabular-nums">{faMoney(tbQ.data?.totals.credit ?? 0)}</td>
                <td className="p-3 tabular-nums">{faMoney(balDebit)}</td>
                <td className="p-3 tabular-nums">{faMoney(balCredit)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </Layout>
  );
}

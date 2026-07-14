import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface Line { code: string; name: string; amount: number; }
interface IncomeStatement { income: Line[]; expense: Line[]; totalIncome: number; totalExpense: number; netIncome: number; }
interface BalanceSheet { assets: Line[]; liabilities: Line[]; equity: Line[]; retainedEarnings: number; totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean; }

function Section({ title, lines, total, totalLabel, accent }: { title: string; lines: Line[]; total: number; totalLabel: string; accent: string }) {
  return (
    <div>
      <div className={`mb-1 text-sm font-bold ${accent}`}>{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {lines.length === 0 && <tr><td className="py-1 text-slate-400">—</td></tr>}
          {lines.map((l) => (
            <tr key={l.code} className="border-t border-slate-50">
              <td className="py-1 text-slate-600"><span className="font-mono text-xs text-slate-400">{l.code}</span> {l.name}</td>
              <td className="py-1 text-left tabular-nums">{faMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-bold"><td className="py-1">{totalLabel}</td><td className="py-1 text-left tabular-nums">{faMoney(total)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

export function FinStatements() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const isQ = useQuery({
    queryKey: ['fin-income-statement', tid, from, to],
    queryFn: async () => (await api.get(`/${tid}/finance/income-statement`, { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } })).data as IncomeStatement,
    enabled: !!tid,
  });
  const bsQ = useQuery({
    queryKey: ['fin-balance-sheet', tid, to],
    queryFn: async () => (await api.get(`/${tid}/finance/balance-sheet`, { params: { ...(to ? { asOf: to } : {}) } })).data as BalanceSheet,
    enabled: !!tid,
  });
  const is = isQ.data;
  const bs = bsQ.data;

  return (
    <Layout title="صورت‌های مالی">
      <div className="card mb-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">از تاریخ (سود و زیان)</span><JDatePicker value={from} onChange={setFrom} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تا تاریخ / در تاریخ (ترازنامه)</span><JDatePicker value={to} onChange={setTo} /></label>
        </div>
        <p className="mt-2 text-xs text-slate-400">بر پایهٔ اسناد قطعی. ترازنامه انباشته تا «تا تاریخ» و سود و زیان برای بازهٔ انتخابی محاسبه می‌شود.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Income statement */}
        <div className="card">
          <h2 className="mb-3 text-base font-bold text-slate-800">صورت سود و زیان</h2>
          {isQ.isLoading || !is ? <div className="py-6 text-center text-slate-400">در حال بارگذاری...</div> : (
            <div className="space-y-4">
              <Section title="درآمدها" lines={is.income} total={is.totalIncome} totalLabel="جمع درآمد" accent="text-emerald-700" />
              <Section title="هزینه‌ها" lines={is.expense} total={is.totalExpense} totalLabel="جمع هزینه" accent="text-amber-700" />
              <div className={`flex items-center justify-between rounded-lg p-3 text-sm font-bold ${is.netIncome >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <span>{is.netIncome >= 0 ? 'سود دوره' : 'زیان دوره'}</span>
                <span className="tabular-nums">{faMoney(Math.abs(is.netIncome))}</span>
              </div>
            </div>
          )}
        </div>

        {/* Balance sheet */}
        <div className="card">
          <h2 className="mb-3 text-base font-bold text-slate-800">ترازنامه</h2>
          {bsQ.isLoading || !bs ? <div className="py-6 text-center text-slate-400">در حال بارگذاری...</div> : (
            <div className="space-y-4">
              <Section title="دارایی‌ها" lines={bs.assets} total={bs.totalAssets} totalLabel="جمع دارایی‌ها" accent="text-blue-700" />
              <Section title="بدهی‌ها" lines={bs.liabilities} total={bs.totalLiabilities} totalLabel="جمع بدهی‌ها" accent="text-rose-700" />
              <Section
                title="حقوق مالکانه"
                lines={[...bs.equity, { code: '—', name: 'سود (زیان) دوره جاری', amount: bs.retainedEarnings }]}
                total={bs.totalEquity}
                totalLabel="جمع حقوق مالکانه"
                accent="text-violet-700"
              />
              <div className={`flex items-center justify-between rounded-lg p-3 text-sm font-bold ${bs.balanced ? 'bg-slate-100 text-slate-700' : 'bg-rose-50 text-rose-700'}`}>
                <span>{bs.balanced ? '✓ ترازنامه متوازن است' : '⚠ عدم توازن'}</span>
                <span className="tabular-nums">دارایی {faMoney(bs.totalAssets)} = بدهی+سرمایه {faMoney(bs.totalLiabilities + bs.totalEquity)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

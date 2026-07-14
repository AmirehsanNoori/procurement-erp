import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faDate, faMoney } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';
import { JDatePicker } from '../components/JDatePicker';

interface Account { id: string; code: string; name: string; isPostable: boolean; }
interface Row { journalNumber: number; date: string; description: string | null; debit: number; credit: number; balance: number; }

export function FinLedger() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const accountsQ = useQuery({
    queryKey: ['fin-accounts', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/accounts`)).data.accounts as Account[],
    enabled: !!tid,
  });
  const options = (accountsQ.data ?? []).filter((a) => a.isPostable).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));

  const ledgerQ = useQuery({
    queryKey: ['fin-ledger', tid, accountId, from, to],
    queryFn: async () => (await api.get(`/${tid}/finance/ledger/${accountId}`, { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } })).data as { opening: number; closing: number; rows: Row[]; account: Account },
    enabled: !!tid && !!accountId,
  });

  return (
    <Layout title="دفتر کل">
      <div className="card mb-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-1"><span className="mb-1 block text-xs font-bold text-slate-600">حساب</span>
            <SearchableSelect value={accountId} onChange={setAccountId} options={options} placeholder="انتخاب حساب معین..." />
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">از تاریخ</span><JDatePicker value={from} onChange={setFrom} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تا تاریخ</span><JDatePicker value={to} onChange={setTo} /></label>
        </div>
      </div>

      {!accountId ? (
        <div className="card p-8 text-center text-slate-400">یک حساب انتخاب کنید تا گردش آن نمایش داده شود.</div>
      ) : ledgerQ.isLoading ? (
        <div className="card p-8 text-center text-slate-400">در حال بارگذاری...</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">سند</th><th className="p-3">تاریخ</th><th className="p-3">شرح</th><th className="p-3">بدهکار</th><th className="p-3">بستانکار</th><th className="p-3">مانده</th></tr></thead>
            <tbody>
              <tr className="border-t border-slate-100 bg-slate-50/50 font-semibold">
                <td className="p-3" colSpan={5}>مانده ابتدای دوره</td>
                <td className="p-3 tabular-nums">{faMoney(ledgerQ.data?.opening ?? 0)}</td>
              </tr>
              {(ledgerQ.data?.rows ?? []).map((r, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{r.journalNumber}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(r.date)}</td>
                  <td className="p-3">{r.description ?? '—'}</td>
                  <td className="p-3 tabular-nums">{r.debit ? faMoney(r.debit) : '—'}</td>
                  <td className="p-3 tabular-nums">{r.credit ? faMoney(r.credit) : '—'}</td>
                  <td className="p-3 tabular-nums font-semibold">{faMoney(r.balance)}</td>
                </tr>
              ))}
              {(ledgerQ.data?.rows ?? []).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">در این بازه گردشی ثبت نشده.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="p-3" colSpan={5}>مانده پایان دوره</td>
                <td className="p-3 tabular-nums">{faMoney(ledgerQ.data?.closing ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Layout>
  );
}

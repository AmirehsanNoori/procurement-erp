import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faDate, faMoney } from '../lib/format';

interface ExpContract { id: string; contractNumber: string; title: string; endDate: string; value: string; supplier: { name: string } | null; partyName: string | null; }
interface ExpGuarantee { id: string; type: string; guaranteeNumber: string | null; amount: string; expiryDate: string; contract: { contractNumber: string; title: string }; }
const GTYPE_FA: Record<string, string> = { performance: 'حسن انجام کار', advance: 'پیش‌پرداخت', bid: 'شرکت در مناقصه', warranty: 'تضمین کیفیت', retention: 'کسور وجه‌الضمان' };

const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

export function ContractsExpiring() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['contracts-expiring', tid, days],
    queryFn: async () => (await api.get(`/${tid}/contracts/expiring`, { params: { days } })).data as { contracts: ExpContract[]; guarantees: ExpGuarantee[] },
    enabled: !!tid,
  });

  return (
    <Layout title="پایش سررسید قراردادها">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-slate-600">بازهٔ هشدار:</span>
        {[30, 60, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={`rounded-lg px-3 py-1 ${days === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{d} روز</button>)}
      </div>

      {isLoading ? <div className="card p-8 text-center text-slate-400">در حال بارگذاری...</div> : (
        <div className="space-y-4">
          <div className="card p-0">
            <div className="border-b border-slate-100 p-3 text-sm font-bold text-slate-700">قراردادهای رو به انقضا ({data?.contracts.length ?? 0})</div>
            {(data?.contracts ?? []).length === 0 ? <div className="p-6 text-center text-emerald-600">قراردادی در این بازه منقضی نمی‌شود.</div> : (
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">شماره</th><th className="p-3">عنوان</th><th className="p-3">طرف قرارداد</th><th className="p-3">مبلغ</th><th className="p-3">پایان</th><th className="p-3">مانده</th></tr></thead>
                <tbody>
                  {(data?.contracts ?? []).map((c) => { const dl = daysLeft(c.endDate); return (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="p-3 font-bold">{c.contractNumber}</td>
                      <td className="p-3">{c.title}</td>
                      <td className="p-3">{c.supplier?.name ?? c.partyName ?? '—'}</td>
                      <td className="p-3 tabular-nums">{faMoney(c.value)}</td>
                      <td className="p-3 text-xs text-slate-500">{faDate(c.endDate)}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${dl < 0 ? 'bg-rose-100 text-rose-700' : dl < 15 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>{dl < 0 ? 'منقضی' : `${dl} روز`}</span></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            )}
          </div>

          <div className="card p-0">
            <div className="border-b border-slate-100 p-3 text-sm font-bold text-slate-700">ضمانت‌نامه‌های رو به انقضا ({data?.guarantees.length ?? 0})</div>
            {(data?.guarantees ?? []).length === 0 ? <div className="p-6 text-center text-emerald-600">ضمانت‌نامه‌ای در این بازه منقضی نمی‌شود.</div> : (
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">قرارداد</th><th className="p-3">نوع</th><th className="p-3">شماره</th><th className="p-3">مبلغ</th><th className="p-3">سررسید</th><th className="p-3">مانده</th></tr></thead>
                <tbody>
                  {(data?.guarantees ?? []).map((g) => { const dl = daysLeft(g.expiryDate); return (
                    <tr key={g.id} className="border-t border-slate-100">
                      <td className="p-3">{g.contract.contractNumber} <span className="text-xs text-slate-400">{g.contract.title}</span></td>
                      <td className="p-3 text-xs text-slate-500">{GTYPE_FA[g.type] ?? g.type}</td>
                      <td className="p-3">{g.guaranteeNumber ?? '—'}</td>
                      <td className="p-3 tabular-nums">{faMoney(g.amount)}</td>
                      <td className="p-3 text-xs text-slate-500">{faDate(g.expiryDate)}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${dl < 0 ? 'bg-rose-100 text-rose-700' : dl < 15 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>{dl < 0 ? 'منقضی' : `${dl} روز`}</span></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

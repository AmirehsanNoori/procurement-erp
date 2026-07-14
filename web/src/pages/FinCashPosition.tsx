import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney } from '../lib/format';

interface Row { code: string; name: string; balance: number; }

export function FinCashPosition() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data, isLoading } = useQuery({
    queryKey: ['fin-cash-position', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/cash-position`)).data as { rows: Row[]; total: number },
    enabled: !!tid,
  });
  const rows = data?.rows ?? [];

  return (
    <Layout title="نقدینگی">
      <p className="mb-3 text-sm text-slate-500">مانده حساب‌های نقد و بانک (بر پایهٔ اسناد قطعی).</p>
      <div className="mb-3 card">
        <div className="text-xs text-slate-500">مجموع نقدینگی</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-blue-700">{faMoney(data?.total ?? 0)}</div>
      </div>
      <div className="card overflow-x-auto p-0">
        {isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">حساب نقد/بانکی در کدینگ یافت نشد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">حساب</th><th className="p-3">مانده</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500">{r.code}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3 tabular-nums font-semibold">{faMoney(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold"><td className="p-3" colSpan={2}>جمع</td><td className="p-3 tabular-nums">{faMoney(data?.total ?? 0)}</td></tr>
            </tfoot>
          </table>
        )}
      </div>
    </Layout>
  );
}

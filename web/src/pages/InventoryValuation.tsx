import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney } from '../lib/format';

interface Row { productId: string; code: string; name: string; unit: string | null; quantity: number; avgCost: number; value: number; }

export function InventoryValuation() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data, isLoading } = useQuery({
    queryKey: ['inv-valuation', tid],
    queryFn: async () => (await api.get(`/${tid}/inventory/valuation`)).data as { rows: Row[]; totalValue: number },
    enabled: !!tid,
  });
  const rows = data?.rows ?? [];

  return (
    <Layout title="ارزش موجودی">
      <p className="mb-3 text-sm text-slate-500">ارزش ریالی موجودی به روش میانگین موزون متحرک (تجمیع همهٔ انبارها).</p>
      <div className="mb-3 card">
        <div className="text-xs text-slate-500">ارزش کل موجودی</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-blue-700">{faMoney(data?.totalValue ?? 0)}</div>
      </div>
      <div className="card overflow-x-auto p-0">
        {isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">موجودی ارزش‌داری وجود ندارد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">کالا</th><th className="p-3">موجودی</th><th className="p-3">بهای میانگین</th><th className="p-3">ارزش</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500">{r.code}</td>
                  <td className="p-3 font-semibold text-slate-800">{r.name}</td>
                  <td className="p-3 tabular-nums">{r.quantity} {r.unit ?? ''}</td>
                  <td className="p-3 tabular-nums text-slate-500">{faMoney(r.avgCost)}</td>
                  <td className="p-3 tabular-nums font-semibold">{faMoney(r.value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold"><td className="p-3" colSpan={4}>جمع کل</td><td className="p-3 tabular-nums">{faMoney(data?.totalValue ?? 0)}</td></tr>
            </tfoot>
          </table>
        )}
      </div>
    </Layout>
  );
}

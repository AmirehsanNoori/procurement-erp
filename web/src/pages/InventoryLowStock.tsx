import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface Row { productId: string; code: string; name: string; unit: string | null; onHand: number; minStock: number; shortfall: number; }

export function InventoryLowStock() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data, isLoading } = useQuery({
    queryKey: ['inv-low-stock', tid],
    queryFn: async () => (await api.get(`/${tid}/inventory/low-stock`)).data.rows as Row[],
    enabled: !!tid,
  });
  const rows = data ?? [];

  return (
    <Layout title="نقطهٔ سفارش">
      <p className="mb-3 text-sm text-slate-500">کالاهایی که موجودی کل آن‌ها زیر حداقل تعیین‌شده (minStock) است و باید سفارش خرید داده شوند.</p>
      <div className="card overflow-x-auto p-0">
        {isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : rows.length === 0 ? (
          <div className="p-8 text-center text-emerald-600">✓ همهٔ کالاها بالای حداقل موجودی هستند.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">کالا</th><th className="p-3">موجودی</th><th className="p-3">حداقل</th><th className="p-3">کسری</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500">{r.code}</td>
                  <td className="p-3 font-semibold text-slate-800">{r.name}</td>
                  <td className="p-3 tabular-nums text-rose-600 font-bold">{r.onHand} {r.unit ?? ''}</td>
                  <td className="p-3 tabular-nums text-slate-500">{r.minStock} {r.unit ?? ''}</td>
                  <td className="p-3"><span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">{r.shortfall} {r.unit ?? ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

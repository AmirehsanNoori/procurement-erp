import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faDate } from '../lib/format';

interface Receipt {
  id: string; receivedAt: string; note: string | null; invoiceNumber: string | null;
  warehouse: { name: string };
  items: { id: string; quantity: string; product: { code: string; name: string; unit: string | null } }[];
}

export function InventoryReceiptHistory() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data, isLoading } = useQuery({
    queryKey: ['inv-receipts', tid],
    queryFn: async () => (await api.get(`/${tid}/inventory/receipts`)).data.receipts as Receipt[],
    enabled: !!tid,
  });

  return (
    <Layout title="تاریخچه رسیدها">
      <div className="space-y-3">
        {isLoading ? <div className="card p-8 text-center text-slate-400">در حال بارگذاری...</div> : (data ?? []).length === 0 ? (
          <div className="card p-8 text-center text-slate-400">رسیدی ثبت نشده.</div>
        ) : (data ?? []).map((r) => (
          <div key={r.id} className="card">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-bold text-slate-800">رسید انبار {r.warehouse.name}</span>
                {r.invoiceNumber && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">فاکتور {r.invoiceNumber}</span>}
              </div>
              <span className="text-xs text-slate-500">{faDate(r.receivedAt)}</span>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="text-right text-slate-400"><th className="p-1 font-medium">کالا</th><th className="p-1 font-medium">تعداد</th></tr></thead>
              <tbody>
                {r.items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className="p-1"><span className="font-semibold">{it.product.name}</span> <span className="font-mono text-slate-400">{it.product.code}</span></td>
                    <td className="p-1 tabular-nums">{Number(it.quantity)} {it.product.unit ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Layout>
  );
}

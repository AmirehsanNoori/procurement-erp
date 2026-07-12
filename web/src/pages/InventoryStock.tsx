import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';

interface Level { id: string; quantity: string; product: { code: string; name: string; unit: string | null; minStock: string | null }; warehouse: { code: string; name: string }; productId: string; warehouseId: string; }
interface Movement { id: string; type: string; quantity: string; date: string | null; note: string | null; product: { code: string; name: string; unit: string | null }; warehouse: { name: string }; }

const TYPE_FA: Record<string, string> = { receipt: 'رسید', issue: 'حواله', adjustment: 'اصلاح', transfer_in: 'انتقال (ورود)', transfer_out: 'انتقال (خروج)' };
const TYPE_COLOR: Record<string, string> = { receipt: 'text-emerald-600', issue: 'text-rose-600', adjustment: 'text-amber-600', transfer_in: 'text-blue-600', transfer_out: 'text-blue-600' };

export function InventoryStock() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [mv, setMv] = useState({ productId: '', warehouseId: '', type: 'receipt', quantity: '', note: '' });
  const [err, setErr] = useState('');

  const levelsQ = useQuery({ queryKey: ['inv-stock', tid], queryFn: async () => (await api.get(`/${tid}/inventory/stock`)).data.levels as Level[], enabled: !!tid });
  const movesQ = useQuery({ queryKey: ['inv-moves', tid], queryFn: async () => (await api.get(`/${tid}/inventory/movements`)).data.movements as Movement[], enabled: !!tid });
  const productsQ = useQuery({ queryKey: ['inv-products-opt', tid], queryFn: async () => (await api.get(`/${tid}/inventory/products`)).data.products as { id: string; code: string; name: string }[], enabled: !!tid });
  const whQ = useQuery({ queryKey: ['inv-warehouses-opt', tid], queryFn: async () => (await api.get(`/${tid}/inventory/warehouses`)).data.warehouses as { id: string; code: string; name: string }[], enabled: !!tid });

  const record = useMutation({
    mutationFn: async () => api.post(`/${tid}/inventory/movements`, { ...mv, quantity: Number(mv.quantity || 0) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv-stock', tid] });
      qc.invalidateQueries({ queryKey: ['inv-moves', tid] });
      setMv({ productId: '', warehouseId: '', type: 'receipt', quantity: '', note: '' });
      setErr('');
    },
    onError: (e) => setErr(apiError(e)),
  });

  const canMove = can('warehouse.receive') || can('warehouse.issue') || can('warehouse.adjust');

  return (
    <Layout title="موجودی انبار">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Record movement */}
        {canMove && (
          <div className="card lg:col-span-1">
            <h2 className="mb-3 text-sm font-bold text-slate-700">ثبت حرکت کالا</h2>
            {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
            <div className="space-y-2">
              <SearchableSelect value={mv.productId} onChange={(v) => setMv({ ...mv, productId: v })} placeholder="کالا..." options={(productsQ.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
              <SearchableSelect value={mv.warehouseId} onChange={(v) => setMv({ ...mv, warehouseId: v })} placeholder="انبار..." options={(whQ.data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} />
              <select className="input" value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })}>
                <option value="receipt">رسید (ورود)</option>
                <option value="issue">حواله (خروج)</option>
                <option value="adjustment">اصلاح موجودی</option>
              </select>
              <input className="input" type="number" placeholder="تعداد" value={mv.quantity} onChange={(e) => setMv({ ...mv, quantity: e.target.value })} />
              <input className="input" placeholder="یادداشت (اختیاری)" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} />
              <button className="btn btn-primary w-full" disabled={record.isPending || !mv.productId || !mv.warehouseId || !mv.quantity} onClick={() => { setErr(''); record.mutate(); }}>ثبت حرکت</button>
            </div>
          </div>
        )}

        {/* Stock levels */}
        <div className={`card p-0 ${canMove ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="border-b border-slate-100 p-3 text-sm font-bold text-slate-700">موجودی فعلی</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کالا</th><th className="p-3">انبار</th><th className="p-3">موجودی</th><th className="p-3">واحد</th></tr></thead>
              <tbody>
                {(levelsQ.data ?? []).map((l) => {
                  const low = l.product.minStock != null && Number(l.quantity) < Number(l.product.minStock);
                  return (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="p-3"><span className="font-semibold">{l.product.name}</span> <span className="font-mono text-xs text-slate-400">{l.product.code}</span></td>
                      <td className="p-3">{l.warehouse.name}</td>
                      <td className={`p-3 font-bold tabular-nums ${low ? 'text-rose-600' : 'text-slate-800'}`}>{Number(l.quantity)}{low && <span className="mr-1 text-[10px]">کمبود</span>}</td>
                      <td className="p-3">{l.product.unit ?? '—'}</td>
                    </tr>
                  );
                })}
                {(levelsQ.data ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">موجودی‌ای ثبت نشده.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Movement history */}
      <div className="card mt-4 p-0">
        <div className="border-b border-slate-100 p-3 text-sm font-bold text-slate-700">تاریخچه حرکت‌ها</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">تاریخ</th><th className="p-3">نوع</th><th className="p-3">کالا</th><th className="p-3">انبار</th><th className="p-3">تعداد</th><th className="p-3">یادداشت</th></tr></thead>
            <tbody>
              {(movesQ.data ?? []).map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="p-3 text-xs text-slate-500">{faDate(m.date)}</td>
                  <td className={`p-3 font-semibold ${TYPE_COLOR[m.type] ?? ''}`}>{TYPE_FA[m.type] ?? m.type}</td>
                  <td className="p-3">{m.product.name}</td>
                  <td className="p-3">{m.warehouse.name}</td>
                  <td className="p-3 tabular-nums">{Number(m.quantity)} {m.product.unit ?? ''}</td>
                  <td className="p-3 text-xs text-slate-500">{m.note ?? '—'}</td>
                </tr>
              ))}
              {(movesQ.data ?? []).length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">حرکتی ثبت نشده.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

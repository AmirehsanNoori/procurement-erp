import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';

interface Stocktake { id: string; number: number; status: string; date: string; warehouse: { code: string; name: string }; _count: { items: number }; }
interface STItem { id: string; systemQty: string; countedQty: string | null; product: { code: string; name: string; unit: string | null }; }
interface STDetail extends Stocktake { items: STItem[]; }

export function InventoryStocktake() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [whId, setWhId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  const listQ = useQuery({ queryKey: ['inv-stocktakes', tid], queryFn: async () => (await api.get(`/${tid}/inventory/stocktakes`)).data.stocktakes as Stocktake[], enabled: !!tid });
  const whQ = useQuery({ queryKey: ['inv-warehouses-opt', tid], queryFn: async () => (await api.get(`/${tid}/inventory/warehouses`)).data.warehouses as { id: string; code: string; name: string }[], enabled: !!tid });
  const detailQ = useQuery({
    queryKey: ['inv-stocktake', tid, openId],
    queryFn: async () => (await api.get(`/${tid}/inventory/stocktakes/${openId}`)).data.stocktake as STDetail,
    enabled: !!tid && !!openId,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post(`/${tid}/inventory/stocktakes`, { warehouseId: whId })).data.stocktake as STDetail,
    onSuccess: (st) => { qc.invalidateQueries({ queryKey: ['inv-stocktakes', tid] }); setCreating(false); setWhId(''); setCounts({}); setOpenId(st.id); },
    onError: (e) => setErr(apiError(e)),
  });
  const saveCounts = useMutation({
    mutationFn: async () => api.patch(`/${tid}/inventory/stocktakes/${openId}/counts`, { counts: Object.entries(counts).filter(([, v]) => v !== '').map(([itemId, v]) => ({ itemId, countedQty: Number(v) })) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-stocktake', tid, openId] }),
    onError: (e) => setErr(apiError(e)),
  });
  const complete = useMutation({
    mutationFn: async () => (await api.post(`/${tid}/inventory/stocktakes/${openId}/complete`)).data,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['inv-stocktakes', tid] }); qc.invalidateQueries({ queryKey: ['inv-stock', tid] });
      const p = d?.posting;
      alert(`انبارگردانی نهایی شد. خالص مغایرت ارزشی: ${d?.netDelta ?? 0}. ${p?.status === 'created' ? `سند مغایرت #${p.journalNumber} ایجاد شد.` : ''}`);
      setOpenId(null);
    },
    onError: (e) => setErr(apiError(e)),
  });

  const canManage = can('warehouse.adjust');
  const detail = detailQ.data;

  return (
    <Layout title="انبارگردانی">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">شمارش فیزیکی موجودی و تطبیق خودکار مغایرت‌ها (به‌همراه سند حسابداری مغایرت).</p>
        {canManage && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ انبارگردانی جدید</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {listQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (listQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">انبارگردانی ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">شماره</th><th className="p-3">انبار</th><th className="p-3">تاریخ</th><th className="p-3">اقلام</th><th className="p-3">وضعیت</th><th className="p-3"></th></tr></thead>
            <tbody>
              {(listQ.data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{s.number}</td>
                  <td className="p-3">{s.warehouse.name}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(s.date)}</td>
                  <td className="p-3 tabular-nums text-slate-500">{s._count.items}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${s.status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{s.status === 'draft' ? 'در حال شمارش' : 'نهایی‌شده'}</span></td>
                  <td className="p-3"><button className="text-xs text-blue-600 hover:underline" onClick={() => { setErr(''); setCounts({}); setOpenId(s.id); }}>{s.status === 'draft' ? 'شمارش' : 'مشاهده'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New stocktake modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16" onClick={() => setCreating(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-base font-bold text-slate-800">انبارگردانی جدید</h2>
            {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
            <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">انبار</span>
              <SearchableSelect value={whId} onChange={setWhId} placeholder="انتخاب انبار..." options={(whQ.data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} />
            </label>
            <p className="mt-2 text-xs text-slate-400">موجودی فعلی این انبار به‌عنوان مبنای شمارش ثبت می‌شود.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setCreating(false)}>انصراف</button>
              <button className="btn btn-primary" disabled={!whId || create.isPending} onClick={() => { setErr(''); create.mutate(); }}>شروع شمارش</button>
            </div>
          </div>
        </div>
      )}

      {/* Count / view modal */}
      {openId && detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 overflow-y-auto" onClick={() => setOpenId(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-bold text-slate-800">انبارگردانی #{detail.number} — {detail.warehouse.name}</h2>
            <p className="mb-3 text-xs text-slate-500">{detail.status === 'draft' ? 'تعداد شمارش‌شده را وارد کنید؛ مغایرت خودکار محاسبه می‌شود.' : 'این انبارگردانی نهایی شده است.'}</p>
            {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
            <div className="max-h-[55vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white"><tr className="text-right text-slate-500"><th className="p-2">کالا</th><th className="p-2">سیستم</th><th className="p-2">شمارش</th><th className="p-2">مغایرت</th></tr></thead>
                <tbody>
                  {detail.items.map((it) => {
                    const c = detail.status === 'draft' ? (counts[it.id] ?? (it.countedQty != null ? String(Number(it.countedQty)) : '')) : (it.countedQty != null ? String(Number(it.countedQty)) : '');
                    const variance = c !== '' ? Number(c) - Number(it.systemQty) : null;
                    return (
                      <tr key={it.id} className="border-t border-slate-100">
                        <td className="p-2"><span className="font-semibold">{it.product.name}</span> <span className="font-mono text-xs text-slate-400">{it.product.code}</span></td>
                        <td className="p-2 tabular-nums text-slate-500">{Number(it.systemQty)} {it.product.unit ?? ''}</td>
                        <td className="p-2">
                          {detail.status === 'draft'
                            ? <input className="input w-24 px-2 py-1 tabular-nums" type="number" value={counts[it.id] ?? (it.countedQty != null ? String(Number(it.countedQty)) : '')} onChange={(e) => setCounts({ ...counts, [it.id]: e.target.value })} />
                            : <span className="tabular-nums">{c || '—'}</span>}
                        </td>
                        <td className={`p-2 tabular-nums font-semibold ${variance == null ? 'text-slate-300' : variance === 0 ? 'text-slate-400' : variance > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{variance == null ? '—' : (variance > 0 ? '+' : '') + variance}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {detail.status === 'draft' && canManage && (
              <div className="mt-4 flex justify-end gap-2">
                <button className="btn btn-outline" onClick={() => { setErr(''); saveCounts.mutate(); }} disabled={saveCounts.isPending}>ذخیرهٔ شمارش</button>
                <button className="btn btn-primary" onClick={() => { if (confirm('نهایی‌سازی انبارگردانی و ثبت مغایرت‌ها؟')) { setErr(''); saveCounts.mutate(undefined, { onSuccess: () => complete.mutate() }); } }} disabled={complete.isPending}>نهایی‌سازی و تطبیق</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

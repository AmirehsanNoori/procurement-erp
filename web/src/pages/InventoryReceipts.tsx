import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate, faMoney } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';

interface ReqItem { productId: string | null; category: string | null; description: string; quantity: string; unit: string | null; unitPrice: string | null; }
interface PendingInvoice {
  id: string; invoiceNumber: string; totalAmount: string; sentToWarehouseAt: string | null;
  supplier: { name: string } | null; request: { id: string; requestNumber: string; items: ReqItem[] } | null;
}
interface Line { productId: string; quantity: string; unitCost: string; }

export function InventoryReceipts() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [active, setActive] = useState<PendingInvoice | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '', unitCost: '' }]);
  const [err, setErr] = useState('');

  const pendingQ = useQuery({
    queryKey: ['inv-pending', tid],
    queryFn: async () => (await api.get(`/${tid}/inventory/pending-receipts`)).data.invoices as PendingInvoice[],
    enabled: !!tid,
  });
  const productsQ = useQuery({ queryKey: ['inv-products-opt', tid], queryFn: async () => (await api.get(`/${tid}/inventory/products`)).data.products as { id: string; code: string; name: string }[], enabled: !!tid });
  const whQ = useQuery({ queryKey: ['inv-warehouses-opt', tid], queryFn: async () => (await api.get(`/${tid}/inventory/warehouses`)).data.warehouses as { id: string; code: string; name: string }[], enabled: !!tid });

  const receive = useMutation({
    mutationFn: async () => api.post(`/${tid}/inventory/receive`, {
      invoiceId: active!.id,
      warehouseId,
      lines: lines.filter((l) => l.productId && Number(l.quantity) > 0).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: l.unitCost !== '' ? Number(l.unitCost) : undefined })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv-pending', tid] });
      qc.invalidateQueries({ queryKey: ['inv-stock', tid] });
      qc.invalidateQueries({ queryKey: ['inv-moves', tid] });
      qc.invalidateQueries({ queryKey: ['invoices', tid] });
      setActive(null); setWarehouseId(''); setLines([{ productId: '', quantity: '', unitCost: '' }]); setErr('');
    },
    onError: (e) => setErr(apiError(e)),
  });

  function open(inv: PendingInvoice) {
    setActive(inv); setWarehouseId(''); setErr('');
    // Pre-fill receipt lines from the request's catalog-linked items, incl. unit cost (Part 1 + valuation).
    const prefill = (inv.request?.items ?? []).filter((it) => it.productId).map((it) => ({ productId: it.productId as string, quantity: String(Number(it.quantity)), unitCost: it.unitPrice != null ? String(Number(it.unitPrice)) : '' }));
    setLines(prefill.length ? prefill : [{ productId: '', quantity: '', unitCost: '' }]);
  }
  const canSubmit = warehouseId && lines.some((l) => l.productId && Number(l.quantity) > 0);

  return (
    <Layout title="رسیدهای در انتظار">
      <p className="mb-3 text-sm text-slate-500">فاکتورهایی که تدارکات برای ثبت رسید به انبار فرستاده. با ثبت رسید، موجودی افزایش می‌یابد و فاکتور به تدارکات برمی‌گردد.</p>

      <div className="card overflow-x-auto p-0">
        {pendingQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">شماره فاکتور</th><th className="p-3">تأمین‌کننده</th><th className="p-3">درخواست</th><th className="p-3">مبلغ</th><th className="p-3">تاریخ ارسال</th><th className="p-3">عملیات</th></tr></thead>
            <tbody>
              {(pendingQ.data ?? []).map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{inv.invoiceNumber}</td>
                  <td className="p-3">{inv.supplier?.name ?? '—'}</td>
                  <td className="p-3 font-semibold text-blue-700">{inv.request?.requestNumber ?? '—'}</td>
                  <td className="p-3">{faMoney(inv.totalAmount)}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(inv.sentToWarehouseAt)}</td>
                  <td className="p-3"><button className="btn btn-primary px-3 py-1 text-xs" onClick={() => open(inv)}>ثبت رسید</button></td>
                </tr>
              ))}
              {(pendingQ.data ?? []).length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">رسید در انتظاری وجود ندارد.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12 overflow-y-auto" onClick={() => setActive(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-bold text-slate-800">ثبت رسید — فاکتور {active.invoiceNumber}</h2>
            <p className="mb-3 text-xs text-slate-500">{active.supplier?.name} {active.request?.requestNumber ? `— درخواست ${active.request.requestNumber}` : ''}</p>
            {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
            {active.request && active.request.items.length > 0 && (
              <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 p-2">
                <div className="mb-1 text-[11px] font-bold text-indigo-700">اقلام درخواست‌شده (مرجع):</div>
                <ul className="space-y-0.5 text-[11px] text-indigo-800">
                  {active.request.items.map((it, i) => (
                    <li key={i}>• {it.description} — {Number(it.quantity)} {it.unit ?? ''}{it.category ? ` (${it.category})` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
            <label className="mb-3 block"><span className="mb-1 block text-xs font-bold text-slate-600">انبار مقصد</span>
              <SearchableSelect value={warehouseId} onChange={setWarehouseId} placeholder="انتخاب انبار..." options={(whQ.data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} />
            </label>
            <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-slate-700">اقلام دریافتی</span><button className="btn btn-outline px-2 py-1 text-xs" onClick={() => setLines([...lines, { productId: '', quantity: '', unitCost: '' }])}>＋ قلم</button></div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1"><SearchableSelect value={l.productId} onChange={(v) => setLines(lines.map((x, j) => j === i ? { ...x, productId: v } : x))} placeholder="کالا..." options={(productsQ.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} /></div>
                  <input className="input w-20" type="number" placeholder="تعداد" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                  <input className="input w-28" type="number" placeholder="بهای واحد" value={l.unitCost} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitCost: e.target.value } : x))} />
                  <button className="text-rose-500 hover:text-rose-700" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">بهای واحد از قیمت درخواست پیش‌پر شده؛ برای ارزش‌گذاری موجودی (میانگین موزون) استفاده می‌شود.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setActive(null)}>انصراف</button>
              <button className="btn btn-primary" disabled={!canSubmit || receive.isPending} onClick={() => { setErr(''); receive.mutate(); }}>ثبت رسید و افزایش موجودی</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

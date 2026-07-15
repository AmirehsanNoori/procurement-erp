import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate, faMoney } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';
import { JDatePicker } from '../components/JDatePicker';

interface POItem { id?: string; productId: string | null; description: string; quantity: string; unit: string | null; unitPrice: string; taxAmount: string; }
interface PO { id: string; poNumber: string; status: string; orderDate: string; expectedDate: string | null; totalAmount: string; notes: string | null; supplierId: string | null; supplier: { name: string } | null; items: POItem[]; }
interface Match { ordered: number; orderedQty: number; invoiced: number; receivedQty: number; receivedValue: number; receiptsCount: number; matchStatus: string; invoices: { invoiceNumber: string; totalAmount: string }[]; }

const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', approved: 'تأییدشده', sent: 'ارسال‌شده', received: 'دریافت‌شده', closed: 'بسته‌شده', cancelled: 'لغوشده' };
const STATUS_COLOR: Record<string, string> = { draft: 'bg-slate-100 text-slate-600', approved: 'bg-blue-50 text-blue-700', sent: 'bg-indigo-50 text-indigo-700', received: 'bg-emerald-50 text-emerald-700', closed: 'bg-slate-200 text-slate-600', cancelled: 'bg-rose-50 text-rose-600' };
const MATCH_FA: Record<string, { t: string; c: string }> = {
  matched: { t: '✓ تطبیق سه‌طرفه کامل', c: 'bg-emerald-50 text-emerald-700' },
  variance: { t: '⚠ مغایرت', c: 'bg-amber-50 text-amber-700' },
  no_invoice: { t: 'بدون فاکتور', c: 'bg-slate-100 text-slate-500' },
  no_receipt: { t: 'بدون رسید', c: 'bg-slate-100 text-slate-500' },
};
const emptyItem: POItem = { productId: null, description: '', quantity: '1', unit: '', unitPrice: '0', taxAmount: '0' };

export function PurchaseOrders() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PO | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const listQ = useQuery({ queryKey: ['pos', tid, search], queryFn: async () => (await api.get(`/${tid}/purchase-orders`, { params: search ? { search } : {} })).data.orders as PO[], enabled: !!tid });
  const suppliersQ = useQuery({ queryKey: ['suppliers-opt', tid], queryFn: async () => (await api.get(`/${tid}/suppliers`)).data.suppliers as { id: string; name: string }[], enabled: !!tid });
  const productsQ = useQuery({ queryKey: ['inv-products-opt', tid], queryFn: async () => { try { return (await api.get(`/${tid}/inventory/products`)).data.products as { id: string; code: string; name: string; unit: string | null }[]; } catch { return []; } }, enabled: !!tid, retry: false });

  const status = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => api.post(`/${tid}/purchase-orders/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', tid] }),
    onError: (e) => setErr(apiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/purchase-orders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', tid] }),
    onError: (e) => setErr(apiError(e)),
  });

  const canCreate = can('purchase_orders.create');
  const canApprove = can('purchase_orders.approve');
  const canDelete = can('purchase_orders.delete');

  return (
    <Layout title="سفارش‌های خرید">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input className="input w-64" placeholder="جستجو (شماره یا تأمین‌کننده)..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {canCreate && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ سفارش خرید</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {listQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (listQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">سفارش خریدی ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">شماره</th><th className="p-3">تأمین‌کننده</th><th className="p-3">تاریخ</th><th className="p-3">مبلغ</th><th className="p-3">وضعیت</th><th className="p-3">عملیات</th></tr></thead>
            <tbody>
              {(listQ.data ?? []).map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{o.poNumber}</td>
                  <td className="p-3">{o.supplier?.name ?? '—'}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(o.orderDate)}</td>
                  <td className="p-3 tabular-nums">{faMoney(o.totalAmount)}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[o.status]}`}>{STATUS_FA[o.status] ?? o.status}</span></td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button className="text-slate-600 hover:underline" onClick={() => setDetail(o.id)}>تطبیق</button>
                      {o.status === 'draft' && canCreate && <button className="text-blue-600 hover:underline" onClick={() => { setErr(''); setEditing(o); }}>ویرایش</button>}
                      {o.status === 'draft' && canApprove && <button className="text-emerald-600 hover:underline" onClick={() => status.mutate({ id: o.id, status: 'approved' })}>تأیید</button>}
                      {o.status === 'approved' && canApprove && <button className="text-indigo-600 hover:underline" onClick={() => status.mutate({ id: o.id, status: 'sent' })}>ارسال</button>}
                      {['draft', 'cancelled'].includes(o.status) && canDelete && <button className="text-rose-500 hover:underline" onClick={() => { if (confirm('حذف سفارش خرید؟')) del.mutate(o.id); }}>حذف</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && (
        <POEditor tid={tid} po={editing} suppliers={suppliersQ.data ?? []} products={productsQ.data ?? []}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['pos', tid] }); setCreating(false); setEditing(null); }} />
      )}
      {detail && <MatchPanel tid={tid} poId={detail} onClose={() => setDetail(null)} />}
    </Layout>
  );
}

function MatchPanel({ tid, poId, onClose }: { tid: string; poId: string; onClose: () => void }) {
  const matchQ = useQuery({ queryKey: ['po-match', tid, poId], queryFn: async () => (await api.get(`/${tid}/purchase-orders/${poId}/match`)).data as Match, enabled: !!poId });
  const m = matchQ.data;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">تطبیق سه‌طرفه (سفارش / رسید / فاکتور)</h2>
        {!m ? <div className="py-6 text-center text-slate-400">در حال بارگذاری...</div> : (
          <div className="space-y-3">
            <div className={`rounded-lg p-3 text-center text-sm font-bold ${MATCH_FA[m.matchStatus]?.c ?? 'bg-slate-100'}`}>{MATCH_FA[m.matchStatus]?.t ?? m.matchStatus}</div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">سفارش</div><div className="mt-1 font-bold tabular-nums">{faMoney(m.ordered)}</div><div className="text-[11px] text-slate-400">{m.orderedQty} قلم</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">دریافت</div><div className="mt-1 font-bold tabular-nums">{faMoney(m.receivedValue)}</div><div className="text-[11px] text-slate-400">{m.receivedQty} واحد / {m.receiptsCount} رسید</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">فاکتور</div><div className="mt-1 font-bold tabular-nums">{faMoney(m.invoiced)}</div><div className="text-[11px] text-slate-400">{m.invoices.length} فاکتور</div></div>
            </div>
            {m.invoices.length > 0 && (
              <div className="text-xs text-slate-500">فاکتورها: {m.invoices.map((i) => `${i.invoiceNumber} (${faMoney(i.totalAmount)})`).join('، ')}</div>
            )}
            <p className="text-[11px] text-slate-400">فاکتورها از طریق فیلد «سفارش خرید» در فرم فاکتور به این سفارش متصل می‌شوند.</p>
          </div>
        )}
        <div className="mt-4 flex justify-end"><button className="btn btn-outline" onClick={onClose}>بستن</button></div>
      </div>
    </div>
  );
}

function POEditor({ tid, po, suppliers, products, onClose, onSaved }: {
  tid: string; po: PO | null; suppliers: { id: string; name: string }[]; products: { id: string; code: string; name: string; unit: string | null }[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!po;
  const [poNumber, setPoNumber] = useState(po?.poNumber ?? '');
  const [supplierId, setSupplierId] = useState(po?.supplierId ?? '');
  const [orderDate, setOrderDate] = useState((po?.orderDate ?? new Date().toISOString()).slice(0, 10));
  const [expectedDate, setExpectedDate] = useState(po?.expectedDate ? po.expectedDate.slice(0, 10) : '');
  const [notes, setNotes] = useState(po?.notes ?? '');
  const [items, setItems] = useState<POItem[]>(po?.items?.length ? po.items.map((i) => ({ ...i, quantity: String(Number(i.quantity)), unitPrice: String(Number(i.unitPrice)), taxAmount: String(Number(i.taxAmount)) })) : [{ ...emptyItem }]);
  const [err, setErr] = useState('');

  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) + (Number(it.taxAmount) || 0), 0);
  const upd = (i: number, p: Partial<POItem>) => setItems(items.map((x, j) => j === i ? { ...x, ...p } : x));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        poNumber, supplierId: supplierId || null, orderDate, expectedDate: expectedDate || null, notes: notes || null,
        items: items.filter((it) => it.description && Number(it.quantity) > 0).map((it) => ({ productId: it.productId || null, description: it.description, quantity: Number(it.quantity), unit: it.unit || null, unitPrice: Number(it.unitPrice) || 0, taxAmount: Number(it.taxAmount) || 0 })),
      };
      if (isEdit) return api.patch(`/${tid}/purchase-orders/${po!.id}`, payload);
      return api.post(`/${tid}/purchase-orders`, payload);
    },
    onSuccess: onSaved,
    onError: (e) => setErr(apiError(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">{isEdit ? 'ویرایش سفارش خرید' : 'سفارش خرید جدید'}</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">شماره سفارش</span><input className="input w-full" value={poNumber} disabled={isEdit} onChange={(e) => setPoNumber(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تأمین‌کننده</span><SearchableSelect value={supplierId} onChange={setSupplierId} placeholder="انتخاب..." options={[{ value: '', label: '—' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ سفارش</span><JDatePicker value={orderDate} onChange={setOrderDate} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ تحویل موردانتظار</span><JDatePicker value={expectedDate} onChange={setExpectedDate} /></label>
        </div>

        <div className="mt-3 mb-1 flex items-center justify-between"><span className="text-xs font-bold text-slate-700">اقلام</span><button className="btn btn-outline px-2 py-1 text-xs" onClick={() => setItems([...items, { ...emptyItem }])}>＋ قلم</button></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-right text-slate-400"><th className="p-1">کالا</th><th className="p-1">شرح</th><th className="p-1">تعداد</th><th className="p-1">واحد</th><th className="p-1">بهای واحد</th><th className="p-1">مالیات</th><th className="p-1">جمع</th><th className="p-1"></th></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="p-1"><div className="min-w-[8rem]"><SearchableSelect value={it.productId ?? ''} onChange={(v) => { const p = products.find((x) => x.id === v); upd(i, { productId: v || null, description: it.description || p?.name || '', unit: it.unit || p?.unit || '' }); }} placeholder="—" options={[{ value: '', label: '— آزاد —' }, ...products.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))]} /></div></td>
                  <td className="p-1"><input className="input w-full px-1 py-1" value={it.description} onChange={(e) => upd(i, { description: e.target.value })} /></td>
                  <td className="p-1"><input className="input w-16 px-1 py-1 tabular-nums" type="number" value={it.quantity} onChange={(e) => upd(i, { quantity: e.target.value })} /></td>
                  <td className="p-1"><input className="input w-14 px-1 py-1" value={it.unit ?? ''} onChange={(e) => upd(i, { unit: e.target.value })} /></td>
                  <td className="p-1"><input className="input w-24 px-1 py-1 tabular-nums" type="number" value={it.unitPrice} onChange={(e) => upd(i, { unitPrice: e.target.value })} /></td>
                  <td className="p-1"><input className="input w-20 px-1 py-1 tabular-nums" type="number" value={it.taxAmount} onChange={(e) => upd(i, { taxAmount: e.target.value })} /></td>
                  <td className="p-1 tabular-nums">{faMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) + (Number(it.taxAmount) || 0))}</td>
                  <td className="p-1">{items.length > 1 && <button className="text-rose-500" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-slate-200 font-bold"><td className="p-1" colSpan={6}>جمع کل</td><td className="p-1 tabular-nums">{faMoney(total)}</td><td /></tr></tfoot>
          </table>
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-xs font-bold text-slate-600">یادداشت</span><input className="input w-full" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !poNumber || !items.some((it) => it.description && Number(it.quantity) > 0)} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
        </div>
      </div>
    </div>
  );
}

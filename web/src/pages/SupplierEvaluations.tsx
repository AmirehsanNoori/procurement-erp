import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';

interface Row { supplierId: string; name: string; count: number; quality: number; delivery: number; price: number; overall: number; }
interface Evaluation { id: string; period: string | null; qualityScore: number; deliveryScore: number; priceScore: number; overallScore: string; note: string | null; createdAt: string; }

function Stars({ v }: { v: number }) {
  return <span className="tabular-nums">{v ? `${v.toFixed(2)} ` : '— '}<span className="text-amber-500">{'★'.repeat(Math.round(v))}{'☆'.repeat(Math.max(0, 5 - Math.round(v)))}</span></span>;
}

export function SupplierEvaluations() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [err, setErr] = useState('');

  const summaryQ = useQuery({ queryKey: ['sup-eval-summary', tid], queryFn: async () => (await api.get(`/${tid}/suppliers/evaluations/summary`)).data.rows as Row[], enabled: !!tid });
  const canEval = can('suppliers.edit');

  return (
    <Layout title="ارزیابی تأمین‌کنندگان">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">کارت امتیاز تأمین‌کنندگان بر پایهٔ کیفیت، تحویل و قیمت (۱ تا ۵).</p>
        {canEval && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setAdding(true); }}>＋ ثبت ارزیابی</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {summaryQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (summaryQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">تأمین‌کننده‌ای یافت نشد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">تأمین‌کننده</th><th className="p-3">کیفیت</th><th className="p-3">تحویل</th><th className="p-3">قیمت</th><th className="p-3">امتیاز کل</th><th className="p-3">تعداد</th><th className="p-3"></th></tr></thead>
            <tbody>
              {(summaryQ.data ?? []).map((r) => (
                <tr key={r.supplierId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-800">{r.name}</td>
                  <td className="p-3 text-xs">{r.quality || '—'}</td>
                  <td className="p-3 text-xs">{r.delivery || '—'}</td>
                  <td className="p-3 text-xs">{r.price || '—'}</td>
                  <td className="p-3"><Stars v={r.overall} /></td>
                  <td className="p-3 text-xs text-slate-500">{r.count}</td>
                  <td className="p-3">{r.count > 0 && <button className="text-xs text-blue-600 hover:underline" onClick={() => setDetail(r)}>تاریخچه</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && <EvalModal tid={tid} suppliers={(summaryQ.data ?? []).map((r) => ({ id: r.supplierId, name: r.name }))} onClose={() => setAdding(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['sup-eval-summary', tid] }); setAdding(false); }} />}
      {detail && <HistoryModal tid={tid} supplier={detail} onClose={() => setDetail(null)} onChanged={() => qc.invalidateQueries({ queryKey: ['sup-eval-summary', tid] })} />}
    </Layout>
  );
}

function EvalModal({ tid, suppliers, onClose, onSaved }: { tid: string; suppliers: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [supplierId, setSupplierId] = useState('');
  const [period, setPeriod] = useState('');
  const [quality, setQuality] = useState('3');
  const [delivery, setDelivery] = useState('3');
  const [price, setPrice] = useState('3');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: async () => api.post(`/${tid}/suppliers/${supplierId}/evaluations`, { period: period || null, qualityScore: Number(quality), deliveryScore: Number(delivery), priceScore: Number(price), note: note || null }),
    onSuccess: onSaved,
    onError: (e) => setErr(apiError(e)),
  });
  const Sel = ({ label, v, set }: { label: string; v: string; set: (s: string) => void }) => (
    <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      <select className="input w-full" value={v} onChange={(e) => set(e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">ثبت ارزیابی تأمین‌کننده</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تأمین‌کننده</span><SearchableSelect value={supplierId} onChange={setSupplierId} placeholder="انتخاب..." options={suppliers.map((s) => ({ value: s.id, label: s.name }))} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">دوره (اختیاری)</span><input className="input w-full" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="مثلاً بهار ۱۴۰۵" /></label>
          <div className="grid grid-cols-3 gap-2">
            <Sel label="کیفیت" v={quality} set={setQuality} />
            <Sel label="تحویل" v={delivery} set={setDelivery} />
            <Sel label="قیمت" v={price} set={setPrice} />
          </div>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">توضیح</span><input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !supplierId} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ tid, supplier, onClose, onChanged }: { tid: string; supplier: Row; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sup-evals', tid, supplier.supplierId], queryFn: async () => (await api.get(`/${tid}/suppliers/${supplier.supplierId}/evaluations`)).data.evaluations as Evaluation[], enabled: true });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/suppliers/${supplier.supplierId}/evaluations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sup-evals', tid, supplier.supplierId] }); onChanged(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">تاریخچهٔ ارزیابی — {supplier.name}</h2>
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-right text-slate-400"><th className="p-2">تاریخ</th><th className="p-2">دوره</th><th className="p-2">کیفیت</th><th className="p-2">تحویل</th><th className="p-2">قیمت</th><th className="p-2">کل</th><th className="p-2"></th></tr></thead>
            <tbody>
              {(q.data ?? []).map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="p-2 text-xs text-slate-500">{faDate(e.createdAt)}</td>
                  <td className="p-2 text-xs">{e.period ?? '—'}</td>
                  <td className="p-2 tabular-nums">{e.qualityScore}</td>
                  <td className="p-2 tabular-nums">{e.deliveryScore}</td>
                  <td className="p-2 tabular-nums">{e.priceScore}</td>
                  <td className="p-2 tabular-nums font-semibold">{Number(e.overallScore).toFixed(2)}</td>
                  <td className="p-2"><button className="text-xs text-rose-500 hover:underline" onClick={() => { if (confirm('حذف ارزیابی؟')) del.mutate(e.id); }}>حذف</button></td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 && <tr><td colSpan={7} className="p-4 text-center text-slate-400">ارزیابی‌ای ثبت نشده.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end"><button className="btn btn-outline" onClick={onClose}>بستن</button></div>
      </div>
    </div>
  );
}

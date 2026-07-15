import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate, faMoney } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';
import { JDatePicker } from '../components/JDatePicker';

interface Amendment { id: string; amendmentNumber: string; date: string; description: string | null; valueChange: string | null; newEndDate: string | null; }
interface Guarantee { id: string; type: string; guaranteeNumber: string | null; amount: string; bankName: string | null; issueDate: string | null; expiryDate: string | null; status: string; }
interface Contract {
  id: string; contractNumber: string; title: string; type: string; status: string; partyName: string | null;
  supplierId: string | null; supplier: { name: string } | null; value: string; currency: string;
  startDate: string | null; endDate: string | null; autoRenew: boolean; renewalNoticeDays: number | null;
  description: string | null; notes: string | null;
  amendments?: Amendment[]; guarantees?: Guarantee[]; _count?: { amendments: number; guarantees: number };
}

const TYPE_FA: Record<string, string> = { purchase: 'خرید', service: 'خدمات', lease: 'اجاره', framework: 'چارچوبی', other: 'سایر' };
const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', active: 'فعال', suspended: 'معلق', expired: 'منقضی', terminated: 'فسخ‌شده', renewed: 'تمدیدشده', closed: 'بسته‌شده' };
const STATUS_COLOR: Record<string, string> = { draft: 'bg-slate-100 text-slate-600', active: 'bg-emerald-50 text-emerald-700', suspended: 'bg-amber-50 text-amber-700', expired: 'bg-rose-50 text-rose-600', terminated: 'bg-rose-50 text-rose-600', renewed: 'bg-blue-50 text-blue-700', closed: 'bg-slate-200 text-slate-600' };
const GTYPE_FA: Record<string, string> = { performance: 'حسن انجام کار', advance: 'پیش‌پرداخت', bid: 'شرکت در مناقصه', warranty: 'تضمین کیفیت', retention: 'کسور وجه‌الضمان' };
const GSTATUS_FA: Record<string, string> = { active: 'فعال', released: 'آزادشده', expired: 'منقضی', claimed: 'ضبط‌شده' };

export function Contracts() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contract | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const listQ = useQuery({ queryKey: ['contracts', tid, search], queryFn: async () => (await api.get(`/${tid}/contracts`, { params: search ? { search } : {} })).data.contracts as Contract[], enabled: !!tid });
  const suppliersQ = useQuery({ queryKey: ['suppliers-opt', tid], queryFn: async () => (await api.get(`/${tid}/suppliers`)).data.suppliers as { id: string; name: string }[], enabled: !!tid });

  const status = useMutation({ mutationFn: async ({ id, status }: { id: string; status: string }) => api.post(`/${tid}/contracts/${id}/status`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts', tid] }), onError: (e) => setErr(apiError(e)) });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/contracts/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts', tid] }), onError: (e) => setErr(apiError(e)) });

  const canCreate = can('contracts.create');
  const canApprove = can('contracts.approve');
  const canDelete = can('contracts.delete');

  return (
    <Layout title="قراردادها">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input className="input w-64" placeholder="جستجو (شماره، عنوان، طرف قرارداد)..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {canCreate && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ قرارداد جدید</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {listQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (listQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">قراردادی ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">شماره</th><th className="p-3">عنوان</th><th className="p-3">طرف قرارداد</th><th className="p-3">نوع</th><th className="p-3">مبلغ</th><th className="p-3">پایان</th><th className="p-3">وضعیت</th><th className="p-3">عملیات</th></tr></thead>
            <tbody>
              {(listQ.data ?? []).map((c) => {
                const soon = c.endDate && c.status === 'active' && new Date(c.endDate).getTime() - Date.now() < (c.renewalNoticeDays ?? 30) * 86400000;
                return (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-bold">{c.contractNumber}</td>
                    <td className="p-3">{c.title}</td>
                    <td className="p-3">{c.supplier?.name ?? c.partyName ?? '—'}</td>
                    <td className="p-3 text-xs text-slate-500">{TYPE_FA[c.type] ?? c.type}</td>
                    <td className="p-3 tabular-nums">{faMoney(c.value)}</td>
                    <td className={`p-3 text-xs ${soon ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{faDate(c.endDate)}{soon && ' ⏰'}</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[c.status]}`}>{STATUS_FA[c.status] ?? c.status}</span></td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button className="text-slate-600 hover:underline" onClick={() => setDetailId(c.id)}>جزئیات</button>
                        {canCreate && <button className="text-blue-600 hover:underline" onClick={() => { setErr(''); setEditing(c); }}>ویرایش</button>}
                        {c.status === 'draft' && canApprove && <button className="text-emerald-600 hover:underline" onClick={() => status.mutate({ id: c.id, status: 'active' })}>فعال‌سازی</button>}
                        {canDelete && <button className="text-rose-500 hover:underline" onClick={() => { if (confirm('حذف قرارداد؟')) del.mutate(c.id); }}>حذف</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && <ContractEditor tid={tid} contract={editing} suppliers={suppliersQ.data ?? []} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { qc.invalidateQueries({ queryKey: ['contracts', tid] }); setCreating(false); setEditing(null); }} />}
      {detailId && <ContractDetail tid={tid} contractId={detailId} canEdit={can('contracts.edit')} onClose={() => setDetailId(null)} />}
    </Layout>
  );
}

function ContractEditor({ tid, contract, suppliers, onClose, onSaved }: { tid: string; contract: Contract | null; suppliers: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!contract;
  const [f, setF] = useState({
    contractNumber: contract?.contractNumber ?? '', title: contract?.title ?? '', type: contract?.type ?? 'purchase',
    supplierId: contract?.supplierId ?? '', partyName: contract?.partyName ?? '', value: contract ? String(Number(contract.value)) : '',
    startDate: contract?.startDate?.slice(0, 10) ?? '', endDate: contract?.endDate?.slice(0, 10) ?? '',
    autoRenew: contract?.autoRenew ?? false, renewalNoticeDays: contract?.renewalNoticeDays != null ? String(contract.renewalNoticeDays) : '30',
    description: contract?.description ?? '',
  });
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...f, value: Number(f.value || 0), supplierId: f.supplierId || null, partyName: f.partyName || null, startDate: f.startDate || null, endDate: f.endDate || null, renewalNoticeDays: f.renewalNoticeDays ? Number(f.renewalNoticeDays) : null, description: f.description || null };
      if (isEdit) return api.patch(`/${tid}/contracts/${contract!.id}`, payload);
      return api.post(`/${tid}/contracts`, payload);
    },
    onSuccess: onSaved,
    onError: (e) => setErr(apiError(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">{isEdit ? 'ویرایش قرارداد' : 'قرارداد جدید'}</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">شماره قرارداد</span><input className="input w-full" value={f.contractNumber} disabled={isEdit} onChange={(e) => setF({ ...f, contractNumber: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">عنوان</span><input className="input w-full" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نوع</span><select className="input w-full" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TYPE_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تأمین‌کننده (طرف قرارداد)</span><SearchableSelect value={f.supplierId} onChange={(v) => setF({ ...f, supplierId: v })} placeholder="—" options={[{ value: '', label: '— (یا نام آزاد)' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} /></label>
          {!f.supplierId && <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نام طرف قرارداد (آزاد)</span><input className="input w-full" value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} /></label>}
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">مبلغ قرارداد</span><input className="input w-full tabular-nums" type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ شروع</span><JDatePicker value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ پایان</span><JDatePicker value={f.endDate} onChange={(v) => setF({ ...f, endDate: v })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">اخطار تمدید (روز پیش از پایان)</span><input className="input w-full" type="number" value={f.renewalNoticeDays} onChange={(e) => setF({ ...f, renewalNoticeDays: e.target.value })} /></label>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.autoRenew} onChange={(e) => setF({ ...f, autoRenew: e.target.checked })} /><span>تمدید خودکار</span></label>
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-xs font-bold text-slate-600">توضیحات</span><textarea className="input min-h-[60px] w-full" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !f.contractNumber || !f.title} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
        </div>
      </div>
    </div>
  );
}

function ContractDetail({ tid, contractId, canEdit, onClose }: { tid: string; contractId: string; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'amend' | 'guar'>('amend');
  const q = useQuery({ queryKey: ['contract', tid, contractId], queryFn: async () => (await api.get(`/${tid}/contracts/${contractId}`)).data.contract as Contract, enabled: true });
  const c = q.data;
  const inval = () => qc.invalidateQueries({ queryKey: ['contract', tid, contractId] });

  const [amend, setAmend] = useState({ amendmentNumber: '', valueChange: '', newEndDate: '', description: '', applyToContract: true });
  const addAmend = useMutation({ mutationFn: async () => api.post(`/${tid}/contracts/${contractId}/amendments`, { amendmentNumber: amend.amendmentNumber, valueChange: amend.valueChange ? Number(amend.valueChange) : null, newEndDate: amend.newEndDate || null, description: amend.description || null, applyToContract: amend.applyToContract }), onSuccess: () => { inval(); setAmend({ amendmentNumber: '', valueChange: '', newEndDate: '', description: '', applyToContract: true }); } });
  const delAmend = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/contracts/${contractId}/amendments/${id}`), onSuccess: inval });

  const [guar, setGuar] = useState({ type: 'performance', guaranteeNumber: '', amount: '', bankName: '', expiryDate: '' });
  const addGuar = useMutation({ mutationFn: async () => api.post(`/${tid}/contracts/${contractId}/guarantees`, { type: guar.type, guaranteeNumber: guar.guaranteeNumber || null, amount: Number(guar.amount || 0), bankName: guar.bankName || null, expiryDate: guar.expiryDate || null }), onSuccess: () => { inval(); setGuar({ type: 'performance', guaranteeNumber: '', amount: '', bankName: '', expiryDate: '' }); } });
  const setGuarStatus = useMutation({ mutationFn: async ({ id, status }: { id: string; status: string }) => api.patch(`/${tid}/contracts/${contractId}/guarantees/${id}`, { status }), onSuccess: inval });
  const delGuar = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/contracts/${contractId}/guarantees/${id}`), onSuccess: inval });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {!c ? <div className="py-6 text-center text-slate-400">در حال بارگذاری...</div> : (
          <>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-800">{c.contractNumber} — {c.title}</h2>
                <p className="mt-1 text-xs text-slate-500">{c.supplier?.name ?? c.partyName ?? '—'} · {TYPE_FA[c.type]} · {faMoney(c.value)} · {faDate(c.startDate)} تا {faDate(c.endDate)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[c.status]}`}>{STATUS_FA[c.status]}</span>
            </div>
            <div className="mb-3 flex gap-1 border-b border-slate-100">
              <button onClick={() => setTab('amend')} className={`px-3 py-2 text-sm ${tab === 'amend' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-slate-500'}`}>متمم‌ها ({c.amendments?.length ?? 0})</button>
              <button onClick={() => setTab('guar')} className={`px-3 py-2 text-sm ${tab === 'guar' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-slate-500'}`}>ضمانت‌نامه‌ها ({c.guarantees?.length ?? 0})</button>
            </div>

            {tab === 'amend' && (
              <div>
                {canEdit && (
                  <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
                    <input className="input px-2 py-1 text-xs" placeholder="شماره متمم" value={amend.amendmentNumber} onChange={(e) => setAmend({ ...amend, amendmentNumber: e.target.value })} />
                    <input className="input px-2 py-1 text-xs tabular-nums" type="number" placeholder="تغییر مبلغ (±)" value={amend.valueChange} onChange={(e) => setAmend({ ...amend, valueChange: e.target.value })} />
                    <div className="text-xs"><JDatePicker value={amend.newEndDate} onChange={(v) => setAmend({ ...amend, newEndDate: v })} placeholder="پایان جدید" /></div>
                    <input className="input px-2 py-1 text-xs" placeholder="توضیح" value={amend.description} onChange={(e) => setAmend({ ...amend, description: e.target.value })} />
                    <button className="btn btn-primary px-2 py-1 text-xs" disabled={!amend.amendmentNumber || addAmend.isPending} onClick={() => addAmend.mutate()}>افزودن متمم</button>
                  </div>
                )}
                <table className="w-full text-xs">
                  <thead><tr className="text-right text-slate-400"><th className="p-2">شماره</th><th className="p-2">تاریخ</th><th className="p-2">تغییر مبلغ</th><th className="p-2">پایان جدید</th><th className="p-2">توضیح</th><th className="p-2"></th></tr></thead>
                  <tbody>
                    {(c.amendments ?? []).map((a) => (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="p-2 font-semibold">{a.amendmentNumber}</td>
                        <td className="p-2 text-slate-500">{faDate(a.date)}</td>
                        <td className="p-2 tabular-nums">{a.valueChange ? faMoney(a.valueChange) : '—'}</td>
                        <td className="p-2 text-slate-500">{a.newEndDate ? faDate(a.newEndDate) : '—'}</td>
                        <td className="p-2 text-slate-500">{a.description ?? '—'}</td>
                        <td className="p-2">{canEdit && <button className="text-rose-500" onClick={() => delAmend.mutate(a.id)}>✕</button>}</td>
                      </tr>
                    ))}
                    {(c.amendments ?? []).length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">متممی ثبت نشده.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'guar' && (
              <div>
                {canEdit && (
                  <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-6">
                    <select className="input px-2 py-1 text-xs" value={guar.type} onChange={(e) => setGuar({ ...guar, type: e.target.value })}>{Object.entries(GTYPE_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <input className="input px-2 py-1 text-xs" placeholder="شماره" value={guar.guaranteeNumber} onChange={(e) => setGuar({ ...guar, guaranteeNumber: e.target.value })} />
                    <input className="input px-2 py-1 text-xs tabular-nums" type="number" placeholder="مبلغ" value={guar.amount} onChange={(e) => setGuar({ ...guar, amount: e.target.value })} />
                    <input className="input px-2 py-1 text-xs" placeholder="بانک" value={guar.bankName} onChange={(e) => setGuar({ ...guar, bankName: e.target.value })} />
                    <div className="text-xs"><JDatePicker value={guar.expiryDate} onChange={(v) => setGuar({ ...guar, expiryDate: v })} placeholder="سررسید" /></div>
                    <button className="btn btn-primary px-2 py-1 text-xs" disabled={addGuar.isPending} onClick={() => addGuar.mutate()}>افزودن</button>
                  </div>
                )}
                <table className="w-full text-xs">
                  <thead><tr className="text-right text-slate-400"><th className="p-2">نوع</th><th className="p-2">شماره</th><th className="p-2">مبلغ</th><th className="p-2">بانک</th><th className="p-2">سررسید</th><th className="p-2">وضعیت</th><th className="p-2"></th></tr></thead>
                  <tbody>
                    {(c.guarantees ?? []).map((g) => {
                      const soon = g.expiryDate && g.status === 'active' && new Date(g.expiryDate).getTime() - Date.now() < 30 * 86400000;
                      return (
                        <tr key={g.id} className="border-t border-slate-100">
                          <td className="p-2">{GTYPE_FA[g.type] ?? g.type}</td>
                          <td className="p-2">{g.guaranteeNumber ?? '—'}</td>
                          <td className="p-2 tabular-nums">{faMoney(g.amount)}</td>
                          <td className="p-2 text-slate-500">{g.bankName ?? '—'}</td>
                          <td className={`p-2 ${soon ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{g.expiryDate ? faDate(g.expiryDate) : '—'}{soon && ' ⏰'}</td>
                          <td className="p-2">{canEdit ? <select className="input px-1 py-0.5 text-xs" value={g.status} onChange={(e) => setGuarStatus.mutate({ id: g.id, status: e.target.value })}>{Object.entries(GSTATUS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : GSTATUS_FA[g.status]}</td>
                          <td className="p-2">{canEdit && <button className="text-rose-500" onClick={() => delGuar.mutate(g.id)}>✕</button>}</td>
                        </tr>
                      );
                    })}
                    {(c.guarantees ?? []).length === 0 && <tr><td colSpan={7} className="p-4 text-center text-slate-400">ضمانت‌نامه‌ای ثبت نشده.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <div className="mt-4 flex justify-end"><button className="btn btn-outline" onClick={onClose}>بستن</button></div>
      </div>
    </div>
  );
}

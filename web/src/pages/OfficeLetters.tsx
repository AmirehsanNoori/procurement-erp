import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface Letter {
  id: string; letterNumber: string; direction: string; subject: string; correspondent: string | null;
  letterDate: string | null; priority: string; status: string; referenceNumber: string | null; body: string | null;
}
const DIR_FA: Record<string, string> = { incoming: 'وارده', outgoing: 'صادره', internal: 'داخلی' };
const DIR_COLOR: Record<string, string> = { incoming: 'bg-blue-50 text-blue-700', outgoing: 'bg-emerald-50 text-emerald-700', internal: 'bg-slate-100 text-slate-600' };
const PRIO_FA: Record<string, string> = { normal: 'عادی', important: 'مهم', urgent: 'فوری' };
const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', registered: 'ثبت‌شده', sent: 'ارسال‌شده', archived: 'بایگانی' };

export function OfficeLetters() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [direction, setDirection] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Letter | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const listQ = useQuery({ queryKey: ['office-letters', tid, direction, search], queryFn: async () => (await api.get(`/${tid}/office/letters`, { params: { ...(direction ? { direction } : {}), ...(search ? { search } : {}) } })).data.letters as Letter[], enabled: !!tid });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/office/letters/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['office-letters', tid] }), onError: (e) => setErr(apiError(e)) });
  const canCreate = can('office.create');
  const canDelete = can('office.delete');

  return (
    <Layout title="دبیرخانه (نامه‌ها)">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {[['', 'همه'], ['incoming', 'وارده'], ['outgoing', 'صادره'], ['internal', 'داخلی']].map(([v, l]) => (
            <button key={v} onClick={() => setDirection(v)} className={`rounded-lg px-3 py-1 text-sm ${direction === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input w-48" placeholder="جستجو..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {canCreate && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ ثبت نامه</button>}
        </div>
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {listQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (listQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">نامه‌ای ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">شماره</th><th className="p-3">نوع</th><th className="p-3">موضوع</th><th className="p-3">طرف مکاتبه</th><th className="p-3">تاریخ</th><th className="p-3">اولویت</th><th className="p-3">وضعیت</th>{(canCreate || canDelete) && <th className="p-3"></th>}</tr></thead>
            <tbody>
              {(listQ.data ?? []).map((l) => (
                <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{l.letterNumber}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${DIR_COLOR[l.direction]}`}>{DIR_FA[l.direction]}</span></td>
                  <td className="p-3">{l.subject}</td>
                  <td className="p-3">{l.correspondent ?? '—'}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(l.letterDate)}</td>
                  <td className="p-3 text-xs">{PRIO_FA[l.priority]}</td>
                  <td className="p-3 text-xs text-slate-500">{STATUS_FA[l.status]}</td>
                  {(canCreate || canDelete) && (
                    <td className="p-3"><div className="flex gap-3 text-xs">
                      {canCreate && <button className="text-blue-600 hover:underline" onClick={() => { setErr(''); setEditing(l); }}>ویرایش</button>}
                      {canDelete && <button className="text-rose-500 hover:underline" onClick={() => { if (confirm('حذف نامه؟')) del.mutate(l.id); }}>حذف</button>}
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && <LetterEditor tid={tid} letter={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { qc.invalidateQueries({ queryKey: ['office-letters', tid] }); setCreating(false); setEditing(null); }} />}
    </Layout>
  );
}

function LetterEditor({ tid, letter, onClose, onSaved }: { tid: string; letter: Letter | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!letter;
  const [f, setF] = useState({
    letterNumber: letter?.letterNumber ?? '', direction: letter?.direction ?? 'incoming', subject: letter?.subject ?? '',
    correspondent: letter?.correspondent ?? '', letterDate: letter?.letterDate?.slice(0, 10) ?? '', priority: letter?.priority ?? 'normal',
    status: letter?.status ?? 'registered', referenceNumber: letter?.referenceNumber ?? '', body: letter?.body ?? '',
  });
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const p = { ...f, correspondent: f.correspondent || null, letterDate: f.letterDate || null, referenceNumber: f.referenceNumber || null, body: f.body || null };
      if (isEdit) return api.patch(`/${tid}/office/letters/${letter!.id}`, p);
      return api.post(`/${tid}/office/letters`, p);
    },
    onSuccess: onSaved, onError: (e) => setErr(apiError(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">{isEdit ? 'ویرایش نامه' : 'ثبت نامه'}</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">شماره نامه</span><input className="input w-full" value={f.letterNumber} disabled={isEdit} onChange={(e) => setF({ ...f, letterNumber: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نوع</span><select className="input w-full" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>{Object.entries(DIR_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">موضوع</span><input className="input w-full" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">طرف مکاتبه (فرستنده/گیرنده)</span><input className="input w-full" value={f.correspondent} onChange={(e) => setF({ ...f, correspondent: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ نامه</span><JDatePicker value={f.letterDate} onChange={(v) => setF({ ...f, letterDate: v })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">اولویت</span><select className="input w-full" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIO_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">وضعیت</span><select className="input w-full" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(STATUS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">شماره عطف/پیرو</span><input className="input w-full" value={f.referenceNumber} onChange={(e) => setF({ ...f, referenceNumber: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">متن نامه</span><textarea className="input min-h-[80px] w-full" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !f.letterNumber || !f.subject} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
        </div>
      </div>
    </div>
  );
}

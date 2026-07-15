import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface Action { id: string; description: string; assignee: string | null; dueDate: string | null; done: boolean; }
interface Meeting { id: string; title: string; date: string | null; location: string | null; organizer: string | null; attendees: string | null; agenda: string | null; minutes: string | null; status: string; actions?: Action[]; _count?: { actions: number }; }
const STATUS_FA: Record<string, string> = { scheduled: 'برنامه‌ریزی‌شده', held: 'برگزارشده', cancelled: 'لغوشده' };
const STATUS_COLOR: Record<string, string> = { scheduled: 'bg-blue-50 text-blue-700', held: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-rose-50 text-rose-600' };

export function OfficeMeetings() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const listQ = useQuery({ queryKey: ['office-meetings', tid], queryFn: async () => (await api.get(`/${tid}/office/meetings`)).data.meetings as Meeting[], enabled: !!tid });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/office/meetings/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['office-meetings', tid] }), onError: (e) => setErr(apiError(e)) });
  const canCreate = can('office.create');
  const canDelete = can('office.delete');

  return (
    <Layout title="جلسات">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">مدیریت جلسات، دستور کار، صورت‌جلسه و مصوبات (اقدامات).</p>
        {canCreate && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ جلسه جدید</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {listQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (listQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">جلسه‌ای ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">عنوان</th><th className="p-3">تاریخ</th><th className="p-3">محل</th><th className="p-3">اقدامات</th><th className="p-3">وضعیت</th><th className="p-3"></th></tr></thead>
            <tbody>
              {(listQ.data ?? []).map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-semibold">{m.title}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(m.date)}</td>
                  <td className="p-3">{m.location ?? '—'}</td>
                  <td className="p-3 tabular-nums text-slate-500">{m._count?.actions ?? 0}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[m.status]}`}>{STATUS_FA[m.status]}</span></td>
                  <td className="p-3"><div className="flex gap-3 text-xs">
                    <button className="text-blue-600 hover:underline" onClick={() => setOpenId(m.id)}>جزئیات</button>
                    {canDelete && <button className="text-rose-500 hover:underline" onClick={() => { if (confirm('حذف جلسه؟')) del.mutate(m.id); }}>حذف</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && <MeetingEditor tid={tid} meeting={null} onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['office-meetings', tid] }); setCreating(false); }} />}
      {openId && <MeetingDetail tid={tid} meetingId={openId} canEdit={can('office.edit')} onClose={() => setOpenId(null)} onChanged={() => qc.invalidateQueries({ queryKey: ['office-meetings', tid] })} />}
    </Layout>
  );
}

function MeetingEditor({ tid, meeting, onClose, onSaved }: { tid: string; meeting: Meeting | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!meeting;
  const [f, setF] = useState({ title: meeting?.title ?? '', date: meeting?.date?.slice(0, 10) ?? '', location: meeting?.location ?? '', organizer: meeting?.organizer ?? '', attendees: meeting?.attendees ?? '', agenda: meeting?.agenda ?? '', minutes: meeting?.minutes ?? '', status: meeting?.status ?? 'scheduled' });
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const p = { ...f, date: f.date || null, location: f.location || null, organizer: f.organizer || null, attendees: f.attendees || null, agenda: f.agenda || null, minutes: f.minutes || null };
      if (isEdit) return api.patch(`/${tid}/office/meetings/${meeting!.id}`, p);
      return api.post(`/${tid}/office/meetings`, p);
    },
    onSuccess: onSaved, onError: (e) => setErr(apiError(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">{isEdit ? 'ویرایش جلسه' : 'جلسه جدید'}</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">عنوان</span><input className="input w-full" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ</span><JDatePicker value={f.date} onChange={(v) => setF({ ...f, date: v })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">محل</span><input className="input w-full" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">دبیر/رئیس جلسه</span><input className="input w-full" value={f.organizer} onChange={(e) => setF({ ...f, organizer: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">وضعیت</span><select className="input w-full" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(STATUS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">حاضرین</span><input className="input w-full" value={f.attendees} onChange={(e) => setF({ ...f, attendees: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">دستور کار</span><textarea className="input min-h-[60px] w-full" value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">صورت‌جلسه</span><textarea className="input min-h-[80px] w-full" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !f.title} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
        </div>
      </div>
    </div>
  );
}

function MeetingDetail({ tid, meetingId, canEdit, onClose, onChanged }: { tid: string; meetingId: string; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [act, setAct] = useState({ description: '', assignee: '', dueDate: '' });
  const q = useQuery({ queryKey: ['office-meeting', tid, meetingId], queryFn: async () => (await api.get(`/${tid}/office/meetings/${meetingId}`)).data.meeting as Meeting, enabled: true });
  const m = q.data;
  const inval = () => { qc.invalidateQueries({ queryKey: ['office-meeting', tid, meetingId] }); onChanged(); };
  const addAct = useMutation({ mutationFn: async () => api.post(`/${tid}/office/meetings/${meetingId}/actions`, { description: act.description, assignee: act.assignee || null, dueDate: act.dueDate || null }), onSuccess: () => { inval(); setAct({ description: '', assignee: '', dueDate: '' }); } });
  const toggleAct = useMutation({ mutationFn: async ({ id, done }: { id: string; done: boolean }) => api.patch(`/${tid}/office/meetings/${meetingId}/actions/${id}`, { done }), onSuccess: inval });
  const delAct = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/office/meetings/${meetingId}/actions/${id}`), onSuccess: inval });

  if (editing && m) return <MeetingEditor tid={tid} meeting={m} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); inval(); }} />;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {!m ? <div className="py-6 text-center text-slate-400">در حال بارگذاری...</div> : (
          <>
            <div className="mb-2 flex items-start justify-between">
              <div><h2 className="text-base font-bold text-slate-800">{m.title}</h2><p className="mt-1 text-xs text-slate-500">{faDate(m.date)} · {m.location ?? '—'} · {STATUS_FA[m.status]}</p></div>
              {canEdit && <button className="text-xs text-blue-600 hover:underline" onClick={() => setEditing(true)}>ویرایش جلسه</button>}
            </div>
            {m.attendees && <p className="mb-2 text-xs text-slate-500">حاضرین: {m.attendees}</p>}
            {m.agenda && <div className="mb-2"><div className="text-xs font-bold text-slate-600">دستور کار</div><div className="whitespace-pre-wrap text-sm text-slate-700">{m.agenda}</div></div>}
            {m.minutes && <div className="mb-3 rounded-lg bg-slate-50 p-3"><div className="text-xs font-bold text-slate-600">صورت‌جلسه</div><div className="whitespace-pre-wrap text-sm text-slate-700">{m.minutes}</div></div>}

            <div className="mb-2 text-sm font-bold text-slate-700">مصوبات / اقدامات</div>
            {canEdit && (
              <div className="mb-2 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-4">
                <input className="input px-2 py-1 text-xs sm:col-span-2" placeholder="شرح اقدام" value={act.description} onChange={(e) => setAct({ ...act, description: e.target.value })} />
                <input className="input px-2 py-1 text-xs" placeholder="مسئول" value={act.assignee} onChange={(e) => setAct({ ...act, assignee: e.target.value })} />
                <button className="btn btn-primary px-2 py-1 text-xs" disabled={!act.description || addAct.isPending} onClick={() => addAct.mutate()}>افزودن</button>
              </div>
            )}
            <ul className="space-y-1">
              {(m.actions ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-sm">
                  <input type="checkbox" checked={a.done} disabled={!canEdit} onChange={(e) => toggleAct.mutate({ id: a.id, done: e.target.checked })} />
                  <span className={`flex-1 ${a.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{a.description}{a.assignee ? ` — ${a.assignee}` : ''}</span>
                  {canEdit && <button className="text-xs text-rose-400" onClick={() => delAct.mutate(a.id)}>✕</button>}
                </li>
              ))}
              {(m.actions ?? []).length === 0 && <li className="py-2 text-center text-xs text-slate-400">اقدامی ثبت نشده.</li>}
            </ul>
          </>
        )}
        <div className="mt-4 flex justify-end"><button className="btn btn-outline" onClick={onClose}>بستن</button></div>
      </div>
    </div>
  );
}

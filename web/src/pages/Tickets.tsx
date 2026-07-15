import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';

interface Comment { id: string; body: string; createdAt: string; authorName: string | null; }
interface Ticket {
  id: string; number: number; subject: string; description: string | null; category: string; priority: string; status: string;
  requesterName: string | null; assigneeName: string | null; assigneeId: string | null; dueDate: string | null; createdAt: string; comments?: Comment[];
}
interface Agent { id: string; fullName: string; }

const CAT_FA: Record<string, string> = { it: 'فناوری اطلاعات', hr: 'منابع انسانی', facilities: 'تأسیسات', finance: 'مالی', other: 'سایر' };
const PRIO_FA: Record<string, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد', urgent: 'فوری' };
const PRIO_COLOR: Record<string, string> = { low: 'bg-slate-100 text-slate-600', medium: 'bg-blue-50 text-blue-700', high: 'bg-amber-50 text-amber-700', urgent: 'bg-rose-50 text-rose-600' };
const STATUS_FA: Record<string, string> = { open: 'باز', in_progress: 'در حال بررسی', resolved: 'حل‌شده', closed: 'بسته‌شده', cancelled: 'لغوشده' };
const STATUS_COLOR: Record<string, string> = { open: 'bg-blue-50 text-blue-700', in_progress: 'bg-amber-50 text-amber-700', resolved: 'bg-emerald-50 text-emerald-700', closed: 'bg-slate-200 text-slate-500', cancelled: 'bg-rose-50 text-rose-600' };

export function Tickets() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const listQ = useQuery({ queryKey: ['tickets', tid, status, search], queryFn: async () => (await api.get(`/${tid}/ticketing`, { params: { ...(status ? { status } : {}), ...(search ? { search } : {}) } })).data.tickets as Ticket[], enabled: !!tid });
  const agentsQ = useQuery({ queryKey: ['ticket-agents', tid], queryFn: async () => (await api.get(`/${tid}/ticketing/agents`)).data.agents as Agent[], enabled: !!tid });

  const canCreate = can('ticketing.create');

  return (
    <Layout title="تیکت‌ها">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {[['', 'همه'], ['open', 'باز'], ['in_progress', 'در حال بررسی'], ['resolved', 'حل‌شده'], ['closed', 'بسته']].map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)} className={`rounded-lg px-3 py-1 text-sm ${status === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input w-48" placeholder="جستجوی موضوع..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {canCreate && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ تیکت جدید</button>}
        </div>
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {listQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (listQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">تیکتی یافت نشد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">#</th><th className="p-3">موضوع</th><th className="p-3">دسته</th><th className="p-3">اولویت</th><th className="p-3">مسئول</th><th className="p-3">وضعیت</th><th className="p-3">تاریخ</th></tr></thead>
            <tbody>
              {(listQ.data ?? []).map((t) => (
                <tr key={t.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpenId(t.id)}>
                  <td className="p-3 font-bold">{t.number}</td>
                  <td className="p-3">{t.subject}</td>
                  <td className="p-3 text-xs text-slate-500">{CAT_FA[t.category]}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${PRIO_COLOR[t.priority]}`}>{PRIO_FA[t.priority]}</span></td>
                  <td className="p-3 text-xs">{t.assigneeName ?? '—'}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[t.status]}`}>{STATUS_FA[t.status]}</span></td>
                  <td className="p-3 text-xs text-slate-500">{faDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && <TicketCreate tid={tid} agents={agentsQ.data ?? []} onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['tickets', tid] }); setCreating(false); }} />}
      {openId && <TicketDetail tid={tid} ticketId={openId} agents={agentsQ.data ?? []} canEdit={can('ticketing.edit')} onClose={() => setOpenId(null)} onChanged={() => qc.invalidateQueries({ queryKey: ['tickets', tid] })} />}
    </Layout>
  );
}

function TicketCreate({ tid, agents, onClose, onSaved }: { tid: string; agents: Agent[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ subject: '', description: '', category: 'it', priority: 'medium', assigneeId: '' });
  const [err, setErr] = useState('');
  const save = useMutation({ mutationFn: async () => api.post(`/${tid}/ticketing`, { ...f, assigneeId: f.assigneeId || null, description: f.description || null }), onSuccess: onSaved, onError: (e) => setErr(apiError(e)) });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">تیکت جدید</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">موضوع</span><input className="input w-full" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">شرح</span><textarea className="input min-h-[80px] w-full" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">دسته</span><select className="input w-full" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CAT_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">اولویت</span><select className="input w-full" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIO_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">مسئول (اختیاری)</span><SearchableSelect value={f.assigneeId} onChange={(v) => setF({ ...f, assigneeId: v })} placeholder="—" options={[{ value: '', label: '—' }, ...agents.map((a) => ({ value: a.id, label: a.fullName }))]} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !f.subject} onClick={() => { setErr(''); save.mutate(); }}>ثبت</button>
        </div>
      </div>
    </div>
  );
}

function TicketDetail({ tid, ticketId, agents, canEdit, onClose, onChanged }: { tid: string; ticketId: string; agents: Agent[]; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const q = useQuery({ queryKey: ['ticket', tid, ticketId], queryFn: async () => (await api.get(`/${tid}/ticketing/${ticketId}`)).data.ticket as Ticket, enabled: true });
  const t = q.data;
  const inval = () => { qc.invalidateQueries({ queryKey: ['ticket', tid, ticketId] }); onChanged(); };
  const upd = useMutation({ mutationFn: async (patch: Partial<Ticket>) => api.patch(`/${tid}/ticketing/${ticketId}`, patch), onSuccess: inval });
  const addComment = useMutation({ mutationFn: async () => api.post(`/${tid}/ticketing/${ticketId}/comments`, { body: comment }), onSuccess: () => { setComment(''); qc.invalidateQueries({ queryKey: ['ticket', tid, ticketId] }); } });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {!t ? <div className="py-6 text-center text-slate-400">در حال بارگذاری...</div> : (
          <>
            <div className="mb-2 flex items-start justify-between">
              <div><h2 className="text-base font-bold text-slate-800">#{t.number} — {t.subject}</h2><p className="mt-1 text-xs text-slate-500">درخواست‌کننده: {t.requesterName ?? '—'} · {faDate(t.createdAt)}</p></div>
            </div>
            {t.description && <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">{t.description}</div>}

            {canEdit && (
              <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-100 p-3 sm:grid-cols-3">
                <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-500">وضعیت</span><select className="input w-full px-2 py-1 text-xs" value={t.status} onChange={(e) => upd.mutate({ status: e.target.value })}>{Object.entries(STATUS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-500">اولویت</span><select className="input w-full px-2 py-1 text-xs" value={t.priority} onChange={(e) => upd.mutate({ priority: e.target.value })}>{Object.entries(PRIO_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-500">مسئول</span><select className="input w-full px-2 py-1 text-xs" value={t.assigneeId ?? ''} onChange={(e) => upd.mutate({ assigneeId: e.target.value || null })}><option value="">—</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select></label>
              </div>
            )}
            {!canEdit && <div className="mb-3 flex gap-2 text-xs"><span className={`rounded-full px-2 py-0.5 ${STATUS_COLOR[t.status]}`}>{STATUS_FA[t.status]}</span><span className={`rounded-full px-2 py-0.5 ${PRIO_COLOR[t.priority]}`}>{PRIO_FA[t.priority]}</span><span>مسئول: {t.assigneeName ?? '—'}</span></div>}

            <div className="mb-2 text-sm font-bold text-slate-700">گفتگو</div>
            <div className="max-h-[35vh] space-y-2 overflow-y-auto">
              {(t.comments ?? []).map((c) => (
                <div key={c.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                  <div className="mb-0.5 flex justify-between text-[11px] text-slate-400"><span className="font-semibold text-slate-600">{c.authorName ?? '—'}</span><span>{faDate(c.createdAt)}</span></div>
                  <div className="whitespace-pre-wrap text-slate-700">{c.body}</div>
                </div>
              ))}
              {(t.comments ?? []).length === 0 && <div className="py-4 text-center text-xs text-slate-400">هنوز پیامی ثبت نشده.</div>}
            </div>
            <div className="mt-3 flex gap-2">
              <input className="input flex-1" placeholder="پاسخ خود را بنویسید..." value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && comment.trim()) addComment.mutate(); }} />
              <button className="btn btn-primary" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>ارسال</button>
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end"><button className="btn btn-outline" onClick={onClose}>بستن</button></div>
      </div>
    </div>
  );
}

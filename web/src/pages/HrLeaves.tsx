import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';
import { JDatePicker } from '../components/JDatePicker';

interface Leave { id: string; type: string; startDate: string; endDate: string; days: string; reason: string | null; status: string; employee: { fullName: string; employeeCode: string }; }
interface Balance { employeeId: string; employeeCode: string; fullName: string; entitlement: number; used: number; remaining: number; }
const TYPE_FA: Record<string, string> = { annual: 'استحقاقی', sick: 'استعلاجی', unpaid: 'بدون‌حقوق', mission: 'مأموریت', other: 'سایر' };
const STATUS_FA: Record<string, string> = { pending: 'در انتظار', approved: 'تأییدشده', rejected: 'ردشده' };
const STATUS_COLOR: Record<string, string> = { pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-600' };

export function HrLeaves() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [tab, setTab] = useState<'requests' | 'balances'>('requests');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');

  const leavesQ = useQuery({ queryKey: ['hr-leaves', tid], queryFn: async () => (await api.get(`/${tid}/hr/leaves`)).data.leaves as Leave[], enabled: !!tid && tab === 'requests' });
  const balancesQ = useQuery({ queryKey: ['hr-balances', tid], queryFn: async () => (await api.get(`/${tid}/hr/leave-balances`)).data.rows as Balance[], enabled: !!tid && tab === 'balances' });
  const employeesQ = useQuery({ queryKey: ['hr-employees-opt', tid], queryFn: async () => (await api.get(`/${tid}/hr/employees`)).data.employees as { id: string; fullName: string; employeeCode: string }[], enabled: !!tid });

  const decide = useMutation({ mutationFn: async ({ id, status }: { id: string; status: string }) => api.post(`/${tid}/hr/leaves/${id}/decide`, { status }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leaves', tid] }); qc.invalidateQueries({ queryKey: ['hr-balances', tid] }); }, onError: (e) => setErr(apiError(e)) });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/hr/leaves/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-leaves', tid] }), onError: (e) => setErr(apiError(e)) });

  const canApprove = can('hr.approve');
  const canCreate = can('hr.create');
  const canDelete = can('hr.delete');

  return (
    <Layout title="مرخصی‌ها">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1">
          <button onClick={() => setTab('requests')} className={`rounded-lg px-3 py-1 text-sm ${tab === 'requests' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>درخواست‌ها</button>
          <button onClick={() => setTab('balances')} className={`rounded-lg px-3 py-1 text-sm ${tab === 'balances' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>مانده مرخصی</button>
        </div>
        {canCreate && tab === 'requests' && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setAdding(true); }}>＋ ثبت مرخصی</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      {tab === 'requests' && (
        <div className="card overflow-x-auto p-0">
          {leavesQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (leavesQ.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-slate-400">درخواستی ثبت نشده.</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کارمند</th><th className="p-3">نوع</th><th className="p-3">از</th><th className="p-3">تا</th><th className="p-3">روز</th><th className="p-3">وضعیت</th><th className="p-3">عملیات</th></tr></thead>
              <tbody>
                {(leavesQ.data ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-semibold">{l.employee.fullName}</td>
                    <td className="p-3 text-xs text-slate-500">{TYPE_FA[l.type]}</td>
                    <td className="p-3 text-xs text-slate-500">{faDate(l.startDate)}</td>
                    <td className="p-3 text-xs text-slate-500">{faDate(l.endDate)}</td>
                    <td className="p-3 tabular-nums">{Number(l.days)}</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[l.status]}`}>{STATUS_FA[l.status]}</span></td>
                    <td className="p-3"><div className="flex gap-2 text-xs">
                      {l.status === 'pending' && canApprove && <>
                        <button className="text-emerald-600 hover:underline" onClick={() => decide.mutate({ id: l.id, status: 'approved' })}>تأیید</button>
                        <button className="text-rose-600 hover:underline" onClick={() => decide.mutate({ id: l.id, status: 'rejected' })}>رد</button>
                      </>}
                      {canDelete && <button className="text-rose-400 hover:underline" onClick={() => { if (confirm('حذف؟')) del.mutate(l.id); }}>حذف</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'balances' && (
        <div className="card overflow-x-auto p-0">
          {balancesQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">کارمند</th><th className="p-3">سقف سالانه</th><th className="p-3">استفاده‌شده</th><th className="p-3">مانده</th></tr></thead>
              <tbody>
                {(balancesQ.data ?? []).map((b) => (
                  <tr key={b.employeeId} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-500">{b.employeeCode}</td>
                    <td className="p-3 font-semibold">{b.fullName}</td>
                    <td className="p-3 tabular-nums">{b.entitlement}</td>
                    <td className="p-3 tabular-nums text-amber-700">{b.used}</td>
                    <td className={`p-3 tabular-nums font-bold ${b.remaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{b.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {adding && <LeaveModal tid={tid} employees={employeesQ.data ?? []} onClose={() => setAdding(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['hr-leaves', tid] }); setAdding(false); }} />}
    </Layout>
  );
}

function LeaveModal({ tid, employees, onClose, onSaved }: { tid: string; employees: { id: string; fullName: string; employeeCode: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ employeeId: '', type: 'annual', startDate: '', endDate: '', days: '', reason: '' });
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: async () => api.post(`/${tid}/hr/leaves`, { employeeId: f.employeeId, type: f.type, startDate: f.startDate, endDate: f.endDate, days: Number(f.days), reason: f.reason || null }),
    onSuccess: onSaved, onError: (e) => setErr(apiError(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">ثبت مرخصی</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">کارمند</span><SearchableSelect value={f.employeeId} onChange={(v) => setF({ ...f, employeeId: v })} placeholder="انتخاب..." options={employees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.fullName}` }))} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نوع</span><select className="input w-full" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TYPE_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">از تاریخ</span><JDatePicker value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} /></label>
            <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تا تاریخ</span><JDatePicker value={f.endDate} onChange={(v) => setF({ ...f, endDate: v })} /></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تعداد روز</span><input className="input w-full tabular-nums" type="number" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">دلیل</span><input className="input w-full" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !f.employeeId || !f.startDate || !f.endDate || !(Number(f.days) > 0)} onClick={() => { setErr(''); save.mutate(); }}>ثبت</button>
        </div>
      </div>
    </div>
  );
}

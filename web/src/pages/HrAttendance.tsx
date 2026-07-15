import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { JDatePicker } from '../components/JDatePicker';

interface Employee { id: string; fullName: string; employeeCode: string; }
interface Att { employeeId: string; date: string; status: string; hours: string | null; }
const STATUS_FA: Record<string, string> = { present: 'حاضر', absent: 'غایب', leave: 'مرخصی', mission: 'مأموریت', holiday: 'تعطیل' };
const todayIso = () => new Date().toISOString().slice(0, 10);

export function HrAttendance() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<Record<string, { status: string; hours: string }>>({});
  const [err, setErr] = useState('');

  const employeesQ = useQuery({ queryKey: ['hr-employees-att', tid], queryFn: async () => (await api.get(`/${tid}/hr/employees`, { params: { status: 'active' } })).data.employees as Employee[], enabled: !!tid });
  const existingQ = useQuery({ queryKey: ['hr-att', tid, date], queryFn: async () => (await api.get(`/${tid}/hr/attendance`, { params: { from: date, to: date } })).data.attendance as Att[], enabled: !!tid && !!date });

  useEffect(() => {
    const map: Record<string, { status: string; hours: string }> = {};
    for (const a of existingQ.data ?? []) map[a.employeeId] = { status: a.status, hours: a.hours != null ? String(Number(a.hours)) : '' };
    setRows(map);
  }, [existingQ.data, date]);

  const save = useMutation({
    mutationFn: async () => {
      const records = (employeesQ.data ?? []).map((e) => { const r = rows[e.id] ?? { status: 'present', hours: '' }; return { employeeId: e.id, date, status: r.status, hours: r.hours !== '' ? Number(r.hours) : null }; });
      return api.post(`/${tid}/hr/attendance`, { records });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-att', tid, date] }); setErr(''); },
    onError: (e) => setErr(apiError(e)),
  });
  const canEdit = can('hr.edit');
  const setRow = (id: string, patch: Partial<{ status: string; hours: string }>) => {
    const base = rows[id] ?? { status: 'present', hours: '' };
    setRows({ ...rows, [id]: { ...base, ...patch } });
  };

  return (
    <Layout title="حضور و غیاب">
      <div className="card mb-3 flex flex-wrap items-end justify-between gap-2">
        <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ</span><div className="w-48"><JDatePicker value={date} onChange={setDate} /></div></label>
        {canEdit && <button className="btn btn-primary" disabled={save.isPending || (employeesQ.data ?? []).length === 0} onClick={() => { setErr(''); save.mutate(); }}>ذخیرهٔ حضور و غیاب روز</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {employeesQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (employeesQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">کارمند فعالی وجود ندارد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">کارمند</th><th className="p-3">وضعیت</th><th className="p-3">ساعت کارکرد</th></tr></thead>
            <tbody>
              {(employeesQ.data ?? []).map((e) => {
                const r = rows[e.id] ?? { status: 'present', hours: '' };
                return (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="p-3 font-mono text-slate-500">{e.employeeCode}</td>
                    <td className="p-3 font-semibold">{e.fullName}</td>
                    <td className="p-3">
                      {canEdit ? <select className="input px-2 py-1" value={r.status} onChange={(ev) => setRow(e.id, { status: ev.target.value })}>{Object.entries(STATUS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : STATUS_FA[r.status]}
                    </td>
                    <td className="p-3">
                      {canEdit ? <input className="input w-24 px-2 py-1 tabular-nums" type="number" placeholder="ساعت" value={r.hours} onChange={(ev) => setRow(e.id, { hours: ev.target.value })} /> : (r.hours || '—')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

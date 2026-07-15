import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate, faMoney } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';
import { JDatePicker } from '../components/JDatePicker';

interface Dept { id: string; name: string; }
interface Employee {
  id: string; employeeCode: string; fullName: string; nationalId: string | null; position: string | null;
  departmentId: string | null; department: { name: string } | null; employmentType: string; status: string;
  hireDate: string | null; baseSalary: string | null; phone: string | null; email: string | null; annualLeaveEntitlement: number; notes: string | null;
}
const ETYPE_FA: Record<string, string> = { full_time: 'تمام‌وقت', part_time: 'پاره‌وقت', contract: 'قراردادی' };
const STATUS_FA: Record<string, string> = { active: 'فعال', on_leave: 'در مرخصی', terminated: 'خاتمه‌یافته' };
const STATUS_COLOR: Record<string, string> = { active: 'bg-emerald-50 text-emerald-700', on_leave: 'bg-amber-50 text-amber-700', terminated: 'bg-slate-200 text-slate-500' };

export function HrEmployees() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const listQ = useQuery({ queryKey: ['hr-employees', tid, search], queryFn: async () => (await api.get(`/${tid}/hr/employees`, { params: search ? { search } : {} })).data.employees as Employee[], enabled: !!tid });
  const deptsQ = useQuery({ queryKey: ['hr-depts', tid], queryFn: async () => (await api.get(`/${tid}/hr/departments`)).data.departments as Dept[], enabled: !!tid });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/hr/employees/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-employees', tid] }), onError: (e) => setErr(apiError(e)) });

  const canCreate = can('hr.create');
  const canDelete = can('hr.delete');

  return (
    <Layout title="کارکنان">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input className="input w-64" placeholder="جستجو (کد، نام، سمت)..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {canCreate && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ کارمند جدید</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {listQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (listQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">کارمندی ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">نام</th><th className="p-3">سمت</th><th className="p-3">دپارتمان</th><th className="p-3">نوع</th><th className="p-3">استخدام</th><th className="p-3">وضعیت</th>{(canCreate || canDelete) && <th className="p-3"></th>}</tr></thead>
            <tbody>
              {(listQ.data ?? []).map((e) => (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500">{e.employeeCode}</td>
                  <td className="p-3 font-semibold text-slate-800">{e.fullName}</td>
                  <td className="p-3">{e.position ?? '—'}</td>
                  <td className="p-3">{e.department?.name ?? '—'}</td>
                  <td className="p-3 text-xs text-slate-500">{ETYPE_FA[e.employmentType]}</td>
                  <td className="p-3 text-xs text-slate-500">{faDate(e.hireDate)}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[e.status]}`}>{STATUS_FA[e.status]}</span></td>
                  {(canCreate || canDelete) && (
                    <td className="p-3"><div className="flex gap-3 text-xs">
                      {canCreate && <button className="text-blue-600 hover:underline" onClick={() => { setErr(''); setEditing(e); }}>ویرایش</button>}
                      {canDelete && <button className="text-rose-500 hover:underline" onClick={() => { if (confirm('حذف کارمند؟')) del.mutate(e.id); }}>حذف</button>}
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && <EmpEditor tid={tid} emp={editing} depts={deptsQ.data ?? []} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { qc.invalidateQueries({ queryKey: ['hr-employees', tid] }); setCreating(false); setEditing(null); }} />}
    </Layout>
  );
}

function EmpEditor({ tid, emp, depts, onClose, onSaved }: { tid: string; emp: Employee | null; depts: Dept[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!emp;
  const [f, setF] = useState({
    employeeCode: emp?.employeeCode ?? '', fullName: emp?.fullName ?? '', nationalId: emp?.nationalId ?? '', position: emp?.position ?? '',
    departmentId: emp?.departmentId ?? '', employmentType: emp?.employmentType ?? 'full_time', status: emp?.status ?? 'active',
    hireDate: emp?.hireDate?.slice(0, 10) ?? '', baseSalary: emp?.baseSalary ? String(Number(emp.baseSalary)) : '', phone: emp?.phone ?? '', email: emp?.email ?? '',
    annualLeaveEntitlement: emp ? String(emp.annualLeaveEntitlement) : '26',
  });
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const p = { ...f, departmentId: f.departmentId || null, nationalId: f.nationalId || null, position: f.position || null, hireDate: f.hireDate || null, baseSalary: f.baseSalary ? Number(f.baseSalary) : null, phone: f.phone || null, email: f.email || null, annualLeaveEntitlement: Number(f.annualLeaveEntitlement || 0) };
      if (isEdit) return api.patch(`/${tid}/hr/employees/${emp!.id}`, p);
      return api.post(`/${tid}/hr/employees`, p);
    },
    onSuccess: onSaved, onError: (e) => setErr(apiError(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">{isEdit ? 'ویرایش کارمند' : 'کارمند جدید'}</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">کد پرسنلی</span><input className="input w-full" value={f.employeeCode} disabled={isEdit} onChange={(e) => setF({ ...f, employeeCode: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نام و نام خانوادگی</span><input className="input w-full" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">کد ملی</span><input className="input w-full" value={f.nationalId} onChange={(e) => setF({ ...f, nationalId: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">سمت</span><input className="input w-full" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">دپارتمان</span><SearchableSelect value={f.departmentId} onChange={(v) => setF({ ...f, departmentId: v })} placeholder="—" options={[{ value: '', label: '—' }, ...depts.map((d) => ({ value: d.id, label: d.name }))]} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نوع استخدام</span><select className="input w-full" value={f.employmentType} onChange={(e) => setF({ ...f, employmentType: e.target.value })}>{Object.entries(ETYPE_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">وضعیت</span><select className="input w-full" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(STATUS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ استخدام</span><JDatePicker value={f.hireDate} onChange={(v) => setF({ ...f, hireDate: v })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">حقوق پایه</span><input className="input w-full tabular-nums" type="number" value={f.baseSalary} onChange={(e) => setF({ ...f, baseSalary: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">سقف مرخصی سالانه (روز)</span><input className="input w-full" type="number" value={f.annualLeaveEntitlement} onChange={(e) => setF({ ...f, annualLeaveEntitlement: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تلفن</span><input className="input w-full" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">ایمیل</span><input className="input w-full" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !f.employeeCode || !f.fullName} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
        </div>
        {emp?.baseSalary && <p className="mt-2 text-[11px] text-slate-400">حقوق فعلی: {faMoney(emp.baseSalary)}</p>}
      </div>
    </div>
  );
}

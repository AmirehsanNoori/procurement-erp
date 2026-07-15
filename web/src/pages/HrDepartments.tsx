import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';

interface Dept { id: string; code: string; name: string; _count: { employees: number }; }

export function HrDepartments() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const q = useQuery({ queryKey: ['hr-depts', tid], queryFn: async () => (await api.get(`/${tid}/hr/departments`)).data.departments as Dept[], enabled: !!tid });
  const add = useMutation({ mutationFn: async () => api.post(`/${tid}/hr/departments`, { code, name }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-depts', tid] }); setCode(''); setName(''); }, onError: (e) => setErr(apiError(e)) });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/${tid}/hr/departments/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-depts', tid] }), onError: (e) => setErr(apiError(e)) });
  const canManage = can('hr.create');
  const canDelete = can('hr.delete');

  return (
    <Layout title="دپارتمان‌ها">
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
      {canManage && (
        <div className="card mb-3 flex flex-wrap items-end gap-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">کد</span><input className="input w-28" value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="block flex-1"><span className="mb-1 block text-xs font-bold text-slate-600">نام دپارتمان</span><input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={!code || !name || add.isPending} onClick={() => { setErr(''); add.mutate(); }}>افزودن</button>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        {q.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (q.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">دپارتمانی ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">نام</th><th className="p-3">کارکنان</th>{canDelete && <th className="p-3"></th>}</tr></thead>
            <tbody>
              {(q.data ?? []).map((d) => (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500">{d.code}</td>
                  <td className="p-3 font-semibold text-slate-800">{d.name}</td>
                  <td className="p-3 tabular-nums text-slate-500">{d._count.employees}</td>
                  {canDelete && <td className="p-3"><button className="text-xs text-rose-500 hover:underline" onClick={() => { if (confirm('حذف دپارتمان؟')) del.mutate(d.id); }}>حذف</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';

interface CostCenter { id: string; code: string; name: string; isActive: boolean; }

export function FinCostCenters() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const q = useQuery({
    queryKey: ['fin-cost-centers', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/cost-centers`)).data.costCenters as CostCenter[],
    enabled: !!tid,
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/finance/cost-centers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-cost-centers', tid] }),
    onError: (e) => setErr(apiError(e)),
  });
  const canManage = can('finance.create');
  const canEdit = can('finance.edit');
  const canDelete = can('finance.delete');

  return (
    <Layout title="مراکز هزینه">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">بُعد تحلیلی برای گزارش‌گیری. در هر سطر سند می‌توان یک مرکز هزینه (واحد، پروژه، ...) انتخاب کرد.</p>
        {canManage && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ مرکز هزینه</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {q.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (q.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">مرکز هزینه‌ای ثبت نشده.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">نام</th><th className="p-3">وضعیت</th>{(canEdit || canDelete) && <th className="p-3"></th>}</tr></thead>
            <tbody>
              {(q.data ?? []).map((c) => (
                <tr key={c.id} className={`border-t border-slate-100 hover:bg-slate-50 ${!c.isActive ? 'opacity-50' : ''}`}>
                  <td className="p-3 font-mono text-slate-600">{c.code}</td>
                  <td className="p-3 font-semibold text-slate-800">{c.name}</td>
                  <td className="p-3 text-xs">{c.isActive ? <span className="text-emerald-600">فعال</span> : <span className="text-slate-400">غیرفعال</span>}</td>
                  {(canEdit || canDelete) && (
                    <td className="p-3">
                      <div className="flex gap-3 text-xs">
                        {canEdit && <button className="text-blue-600 hover:underline" onClick={() => { setErr(''); setEditing(c); }}>ویرایش</button>}
                        {canDelete && <button className="text-rose-500 hover:underline" disabled={del.isPending} onClick={() => { if (confirm('حذف مرکز هزینه؟')) { setErr(''); del.mutate(c.id); } }}>حذف</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && (
        <Editor tid={tid} cc={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { qc.invalidateQueries({ queryKey: ['fin-cost-centers', tid] }); setCreating(false); setEditing(null); }} />
      )}
    </Layout>
  );
}

function Editor({ tid, cc, onClose, onSaved }: { tid: string; cc: CostCenter | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!cc;
  const [code, setCode] = useState(cc?.code ?? '');
  const [name, setName] = useState(cc?.name ?? '');
  const [isActive, setIsActive] = useState(cc?.isActive ?? true);
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: async () => isEdit ? api.patch(`/${tid}/finance/cost-centers/${cc!.id}`, { name, isActive }) : api.post(`/${tid}/finance/cost-centers`, { code, name }),
    onSuccess: onSaved,
    onError: (e) => setErr(apiError(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">{isEdit ? 'ویرایش مرکز هزینه' : 'مرکز هزینهٔ جدید'}</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">کد</span><input className="input w-full" value={code} disabled={isEdit} onChange={(e) => setCode(e.target.value)} placeholder="مثلاً CC-01" /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نام</span><input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً واحد فناوری اطلاعات" /></label>
          {isEdit && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /><span>فعال</span></label>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !name || (!isEdit && !code)} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
        </div>
      </div>
    </div>
  );
}

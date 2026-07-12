import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';

interface Warehouse { id: string; code: string; name: string; location: string | null; isActive: boolean; }
const empty = { code: '', name: '', location: '' };

export function InventoryWarehouses() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [err, setErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inv-warehouses', tid],
    queryFn: async () => (await api.get(`/${tid}/inventory/warehouses`)).data.warehouses as Warehouse[],
    enabled: !!tid,
  });
  const save = useMutation({
    mutationFn: async () => (editId ? api.patch(`/${tid}/inventory/warehouses/${editId}`, form) : api.post(`/${tid}/inventory/warehouses`, form)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inv-warehouses', tid] }); setOpen(false); },
    onError: (e) => setErr(apiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/inventory/warehouses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-warehouses', tid] }),
  });

  function openCreate() { setEditId(null); setForm({ ...empty }); setErr(''); setOpen(true); }
  function openEdit(w: Warehouse) { setEditId(w.id); setForm({ code: w.code, name: w.name, location: w.location ?? '' }); setErr(''); setOpen(true); }
  function submit(e: FormEvent) { e.preventDefault(); setErr(''); save.mutate(); }

  return (
    <Layout title="انبارها">
      <div className="mb-3 flex items-center justify-end">
        {can('warehouse.create') && <button className="btn btn-primary" onClick={openCreate}>＋ انبار جدید</button>}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-sm font-bold text-slate-800">{editId ? 'ویرایش انبار' : 'انبار جدید'}</h2>
            <form onSubmit={submit} className="grid gap-3">
              {err && <div className="text-sm text-rose-600">{err}</div>}
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">کد انبار</span><input className="input" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نام انبار</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">موقعیت</span><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
              <div className="flex gap-2 pt-1"><button className="btn btn-primary" disabled={save.isPending}>ذخیره</button><button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>انصراف</button></div>
            </form>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        {isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">نام</th><th className="p-3">موقعیت</th><th className="p-3">عملیات</th></tr></thead>
            <tbody>
              {(data ?? []).map((w) => (
                <tr key={w.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs">{w.code}</td><td className="p-3 font-semibold">{w.name}</td><td className="p-3">{w.location ?? '—'}</td>
                  <td className="p-3"><div className="flex gap-1">
                    {can('warehouse.edit') && <button className="btn btn-outline px-2 py-1" onClick={() => openEdit(w)}>✏</button>}
                    {can('warehouse.delete') && <button className="btn btn-outline px-2 py-1 text-rose-600" onClick={() => { if (confirm('حذف انبار؟')) del.mutate(w.id); }}>🗑</button>}
                  </div></td>
                </tr>
              ))}
              {(data ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">انباری ثبت نشده.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

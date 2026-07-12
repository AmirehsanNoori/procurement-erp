import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';

interface Product {
  id: string; code: string; name: string; category: string | null; unit: string | null;
  barcode: string | null; minStock: string | null; isActive: boolean; notes: string | null;
}
const empty = { code: '', name: '', category: '', unit: '', barcode: '', minStock: '', notes: '' };

export function InventoryProducts() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [err, setErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inv-products', tid, search],
    queryFn: async () => (await api.get(`/${tid}/inventory/products`, { params: { search: search || undefined } })).data.products as Product[],
    enabled: !!tid,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, minStock: form.minStock ? Number(form.minStock) : null };
      return editId ? api.patch(`/${tid}/inventory/products/${editId}`, payload) : api.post(`/${tid}/inventory/products`, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inv-products', tid] }); setOpen(false); },
    onError: (e) => setErr(apiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/inventory/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-products', tid] }),
  });

  function openCreate() { setEditId(null); setForm({ ...empty }); setErr(''); setOpen(true); }
  function openEdit(p: Product) {
    setEditId(p.id);
    setForm({ code: p.code, name: p.name, category: p.category ?? '', unit: p.unit ?? '', barcode: p.barcode ?? '', minStock: p.minStock != null ? String(Number(p.minStock)) : '', notes: p.notes ?? '' });
    setErr(''); setOpen(true);
  }
  function submit(e: FormEvent) { e.preventDefault(); setErr(''); save.mutate(); }

  return (
    <Layout title="کالاها">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input className="input max-w-xs" placeholder="جستجوی کالا (کد، نام، بارکد)..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {can('warehouse.create') && <button className="btn btn-primary" onClick={openCreate}>＋ کالای جدید</button>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-sm font-bold text-slate-800">{editId ? 'ویرایش کالا' : 'کالای جدید'}</h2>
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
              {err && <div className="sm:col-span-2 text-sm text-rose-600">{err}</div>}
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">کد کالا</span><input className="input" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نام کالا</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">دسته‌بندی</span><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">واحد شمارش</span><input className="input" placeholder="عدد، کیلوگرم..." value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">بارکد</span><input className="input" dir="ltr" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">حداقل موجودی</span><input className="input" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">یادداشت</span><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              <div className="sm:col-span-2 flex gap-2 pt-1">
                <button className="btn btn-primary" disabled={save.isPending}>ذخیره</button>
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>انصراف</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        {isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500">
              <th className="p-3">کد</th><th className="p-3">نام</th><th className="p-3">دسته</th><th className="p-3">واحد</th><th className="p-3">حداقل موجودی</th><th className="p-3">عملیات</th>
            </tr></thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs">{p.code}</td>
                  <td className="p-3 font-semibold">{p.name}</td>
                  <td className="p-3">{p.category ?? '—'}</td>
                  <td className="p-3">{p.unit ?? '—'}</td>
                  <td className="p-3">{p.minStock != null ? Number(p.minStock) : '—'}</td>
                  <td className="p-3"><div className="flex gap-1">
                    {can('warehouse.edit') && <button className="btn btn-outline px-2 py-1" onClick={() => openEdit(p)}>✏</button>}
                    {can('warehouse.delete') && <button className="btn btn-outline px-2 py-1 text-rose-600" onClick={() => { if (confirm('حذف کالا؟')) del.mutate(p.id); }}>🗑</button>}
                  </div></td>
                </tr>
              ))}
              {(data ?? []).length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">کالایی ثبت نشده.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

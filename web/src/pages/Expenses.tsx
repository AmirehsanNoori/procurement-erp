import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate } from '../lib/format';

interface ExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  expenseDate: string | null;
  receiptRef: string | null;
}

interface ExpenseReport {
  id: string;
  reportNumber: string | null;
  title: string;
  submittedBy: string | null;
  department: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalAmount: number;
  currency: string;
  status: string;
  notes: string | null;
  createdAt: string;
  items?: ExpenseItem[];
  _count?: { items: number };
}

const STATUSES = ['پیش‌نویس', 'ارسال شده', 'تأیید شده', 'رد شده', 'پرداخت شده'];
const CATEGORIES = ['حمل‌ونقل', 'پذیرایی', 'اقامت', 'ارتباطات', 'اداری', 'سایر'];

const STATUS_COLOR: Record<string, string> = {
  'پیش‌نویس': 'bg-slate-100 text-slate-600',
  'ارسال شده': 'bg-amber-100 text-amber-700',
  'تأیید شده': 'bg-emerald-100 text-emerald-700',
  'رد شده': 'bg-rose-100 text-rose-700',
  'پرداخت شده': 'bg-blue-100 text-blue-700',
};

const CATEGORY_ICON: Record<string, string> = {
  'حمل‌ونقل': '🚗',
  'پذیرایی': '🍽️',
  'اقامت': '🏨',
  'ارتباطات': '📞',
  'اداری': '📋',
  'سایر': '📦',
};

const emptyForm = {
  reportNumber: '', title: '', submittedBy: '', department: '',
  periodStart: '', periodEnd: '', currency: 'ریال', status: 'پیش‌نویس', notes: '',
};

const emptyItem = { category: 'سایر', description: '', amount: 0, expenseDate: '', receiptRef: '' };

export function Expenses() {
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const tid = currentTenantId ?? '';

  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({ ...emptyItem });
  const [error, setError] = useState('');

  const listQ = useQuery({
    queryKey: ['expenses', tid, statusFilter],
    queryFn: async () => {
      const res = await api.get(`/${tid}/expenses`, { params: { status: statusFilter || undefined } });
      return res.data.reports as ExpenseReport[];
    },
    enabled: !!tid,
  });

  const detailQ = useQuery({
    queryKey: ['expense-detail', tid, detailId],
    queryFn: async () => {
      const res = await api.get(`/${tid}/expenses/${detailId}`);
      return res.data.report as ExpenseReport;
    },
    enabled: !!tid && !!detailId,
  });

  const saveMut = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = { ...data, reportNumber: data.reportNumber || null, submittedBy: data.submittedBy || null, department: data.department || null, periodStart: data.periodStart || null, periodEnd: data.periodEnd || null, notes: data.notes || null };
      if (editId) return api.patch(`/${tid}/expenses/${editId}`, payload).then((r) => r.data);
      return api.post(`/${tid}/expenses`, payload).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', tid] });
      closeForm();
    },
    onError: (e) => setError(apiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/${tid}/expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', tid] }),
    onError: (e) => setError(apiError(e)),
  });

  const addItemMut = useMutation({
    mutationFn: (rId: string) => api.post(`/${tid}/expenses/${rId}/items`, { ...itemForm, amount: Number(itemForm.amount), expenseDate: itemForm.expenseDate || null, receiptRef: itemForm.receiptRef || null }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-detail', tid, detailId] });
      qc.invalidateQueries({ queryKey: ['expenses', tid] });
      setItemForm({ ...emptyItem });
    },
    onError: (e) => setError(apiError(e)),
  });

  const delItemMut = useMutation({
    mutationFn: ({ rId, iId }: { rId: string; iId: string }) => api.delete(`/${tid}/expenses/${rId}/items/${iId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-detail', tid, detailId] });
      qc.invalidateQueries({ queryKey: ['expenses', tid] });
    },
  });

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyForm });
    setError('');
    setShowForm(true);
  }

  function openEdit(r: ExpenseReport) {
    setEditId(r.id);
    setForm({
      reportNumber: r.reportNumber ?? '', title: r.title, submittedBy: r.submittedBy ?? '',
      department: r.department ?? '', periodStart: r.periodStart ? r.periodStart.slice(0, 10) : '',
      periodEnd: r.periodEnd ? r.periodEnd.slice(0, 10) : '', currency: r.currency,
      status: r.status, notes: r.notes ?? '',
    });
    setError('');
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditId(null); setError(''); }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('عنوان الزامی است'); return; }
    saveMut.mutate(form);
  }

  const detail = detailQ.data;
  const reports = listQ.data ?? [];

  // Category breakdown for detail view
  const categoryTotals = detail?.items?.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + Number(item.amount);
    return acc;
  }, {}) ?? {};

  return (
    <Layout title="گزارش‌های هزینه">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">گزارش‌های هزینه</h1>
            <p className="text-sm text-slate-500 mt-1">ثبت و پیگیری هزینه‌های سازمانی</p>
          </div>
          <button onClick={openCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
            + گزارش جدید
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex gap-3 flex-wrap">
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">همه وضعیت‌ها</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">{error}</div>}

        {/* Summary cards */}
        {reports.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {STATUSES.map((s) => {
              const count = reports.filter((r) => r.status === s).length;
              if (count === 0) return null;
              const total = reports.filter((r) => r.status === s).reduce((sum, r) => sum + Number(r.totalAmount), 0);
              return (
                <div key={s} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className={`inline-block px-2 py-0.5 rounded-full text-xs mb-2 ${STATUS_COLOR[s]}`}>{s}</div>
                  <div className="text-xl font-bold text-slate-800">{count} گزارش</div>
                  <div className="text-xs text-slate-500 mt-1">{faMoney(total)} ریال</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reports Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          {listQ.isLoading ? (
            <div className="text-center py-12 text-slate-400">در حال بارگذاری...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-slate-400">هیچ گزارشی یافت نشد</div>
          ) : (
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3 text-right font-medium text-slate-600">شماره</th>
                  <th className="p-3 text-right font-medium text-slate-600">عنوان</th>
                  <th className="p-3 text-right font-medium text-slate-600">ارسال‌کننده</th>
                  <th className="p-3 text-right font-medium text-slate-600">دوره</th>
                  <th className="p-3 text-right font-medium text-slate-600">مجموع</th>
                  <th className="p-3 text-right font-medium text-slate-600">آیتم‌ها</th>
                  <th className="p-3 text-right font-medium text-slate-600">وضعیت</th>
                  <th className="p-3 text-right font-medium text-slate-600">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs text-slate-600">{r.reportNumber || '—'}</td>
                    <td className="p-3">
                      <button onClick={() => setDetailId(r.id === detailId ? null : r.id)} className="font-semibold text-slate-800 hover:text-indigo-700">
                        {r.title}
                      </button>
                    </td>
                    <td className="p-3 text-slate-600">{r.submittedBy || '—'}</td>
                    <td className="p-3 text-xs text-slate-500">
                      {r.periodStart ? faDate(r.periodStart) : ''} {r.periodEnd ? `← ${faDate(r.periodEnd)}` : ''}
                    </td>
                    <td className="p-3 font-bold tabular-nums">{faMoney(Number(r.totalAmount))}</td>
                    <td className="p-3 text-slate-500">{r._count?.items ?? 0}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[r.status] ?? 'bg-slate-100'}`}>{r.status}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(r)} className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded">ویرایش</button>
                        <button onClick={() => { if (confirm('حذف شود؟')) deleteMut.mutate(r.id); }} className="px-2 py-1 text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 rounded">حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail Panel */}
        {detailId && detail && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{detail.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[detail.status]}`}>{detail.status}</span>
                  {detail.department && <span className="text-xs text-slate-500">{detail.department}</span>}
                </div>
              </div>
              <div className="text-left">
                <div className="text-2xl font-bold text-slate-800">{faMoney(Number(detail.totalAmount))} <span className="text-sm text-slate-400">{detail.currency}</span></div>
              </div>
            </div>

            {/* Category chart */}
            {Object.keys(categoryTotals).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(categoryTotals).map(([cat, total]) => (
                  <div key={cat} className="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                    <span className="text-xl">{CATEGORY_ICON[cat] ?? '📦'}</span>
                    <div>
                      <div className="text-xs text-slate-500">{cat}</div>
                      <div className="font-bold text-slate-800">{faMoney(total)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add item form */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">+ افزودن آیتم هزینه</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <select className="input" value={itemForm.category} onChange={(e) => setItemForm((p) => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="input" placeholder="شرح *" value={itemForm.description} onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))} />
                <input type="number" className="input" placeholder="مبلغ" value={itemForm.amount} onChange={(e) => setItemForm((p) => ({ ...p, amount: Number(e.target.value) }))} />
                <input type="date" className="input" value={itemForm.expenseDate} onChange={(e) => setItemForm((p) => ({ ...p, expenseDate: e.target.value }))} />
                <input className="input" placeholder="شماره رسید" value={itemForm.receiptRef} onChange={(e) => setItemForm((p) => ({ ...p, receiptRef: e.target.value }))} />
                <button
                  className="btn btn-primary text-xs px-3 py-1.5"
                  disabled={addItemMut.isPending || !itemForm.description}
                  onClick={() => addItemMut.mutate(detailId)}
                >
                  + افزودن
                </button>
              </div>
            </div>

            {/* Items list */}
            <div className="space-y-2">
              {(detail.items ?? []).map((item) => (
                <div key={item.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-2.5 text-sm">
                  <span className="text-lg">{CATEGORY_ICON[item.category] ?? '📦'}</span>
                  <span className="font-medium text-slate-700">{item.description}</span>
                  <span className="text-xs text-slate-400">{item.category}</span>
                  {item.expenseDate && <span className="text-xs text-slate-400">{faDate(item.expenseDate)}</span>}
                  {item.receiptRef && <span className="text-xs text-slate-400">رسید: {item.receiptRef}</span>}
                  <span className="mr-auto font-bold text-slate-800">{faMoney(Number(item.amount))}</span>
                  <button
                    onClick={() => { if (confirm('حذف؟')) delItemMut.mutate({ rId: detailId, iId: item.id }); }}
                    className="text-rose-400 hover:text-rose-600 text-xs"
                  >
                    حذف
                  </button>
                </div>
              ))}
              {(detail.items ?? []).length === 0 && (
                <div className="text-center py-4 text-sm text-slate-400">آیتمی ثبت نشده</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{editId ? 'ویرایش گزارش' : 'گزارش هزینه جدید'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">شماره گزارش</label>
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={form.reportNumber} onChange={(e) => setForm((p) => ({ ...p, reportNumber: e.target.value }))} placeholder="اختیاری" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">وضعیت</label>
                  <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">عنوان *</label>
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ارسال‌کننده</label>
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={form.submittedBy} onChange={(e) => setForm((p) => ({ ...p, submittedBy: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">بخش / دپارتمان</label>
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">شروع دوره</label>
                  <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={form.periodStart} onChange={(e) => setForm((p) => ({ ...p, periodStart: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">پایان دوره</label>
                  <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={form.periodEnd} onChange={(e) => setForm((p) => ({ ...p, periodEnd: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">یادداشت</label>
                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">انصراف</button>
                <button type="submit" disabled={saveMut.isPending} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50">
                  {saveMut.isPending ? 'در حال ذخیره...' : 'ذخیره'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

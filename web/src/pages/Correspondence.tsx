import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface Letter {
  id: string;
  letterNumber: string | null;
  direction: 'صادره' | 'وارده';
  subject: string;
  body: string | null;
  senderName: string | null;
  recipientName: string | null;
  letterDate: string | null;
  receivedDate: string | null;
  priority: string;
  status: string;
  notes: string | null;
  createdAt: string;
  request: { id: string; requestNumber: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
}

const DIRECTIONS = ['صادره', 'وارده'];
const PRIORITIES = ['عادی', 'فوری', 'خیلی‌فوری'];
const STATUSES = ['ثبت شده', 'در جریان', 'بایگانی', 'پاسخ داده شده'];

const STATUS_COLOR: Record<string, string> = {
  'ثبت شده': 'bg-slate-100 text-slate-600',
  'در جریان': 'bg-amber-100 text-amber-700',
  'بایگانی': 'bg-slate-200 text-slate-500',
  'پاسخ داده شده': 'bg-emerald-100 text-emerald-700',
};

const PRIORITY_COLOR: Record<string, string> = {
  'عادی': 'bg-slate-100 text-slate-600',
  'فوری': 'bg-orange-100 text-orange-700',
  'خیلی‌فوری': 'bg-rose-100 text-rose-700',
};

const DIRECTION_COLOR: Record<string, string> = {
  'صادره': 'bg-blue-100 text-blue-700',
  'وارده': 'bg-indigo-100 text-indigo-700',
};

const emptyForm = {
  letterNumber: '',
  direction: 'وارده' as 'صادره' | 'وارده',
  subject: '',
  body: '',
  senderName: '',
  recipientName: '',
  letterDate: '',
  receivedDate: '',
  priority: 'عادی',
  status: 'ثبت شده',
  notes: '',
  relatedRequestId: '',
  relatedInvoiceId: '',
};

export function Correspondence() {
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const tid = currentTenantId ?? '';

  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewLetter, setViewLetter] = useState<Letter | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState('');

  const listQ = useQuery({
    queryKey: ['correspondence', tid, search, dirFilter, statusFilter],
    queryFn: async () => {
      const res = await api.get(`/${tid}/correspondence`, {
        params: { search: search || undefined, direction: dirFilter || undefined, status: statusFilter || undefined },
      });
      return res.data.letters as Letter[];
    },
    enabled: !!tid,
  });

  const saveMut = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        ...data,
        letterNumber: data.letterNumber || null,
        body: data.body || null,
        senderName: data.senderName || null,
        recipientName: data.recipientName || null,
        letterDate: data.letterDate || null,
        receivedDate: data.receivedDate || null,
        notes: data.notes || null,
        relatedRequestId: data.relatedRequestId || null,
        relatedInvoiceId: data.relatedInvoiceId || null,
      };
      if (editId) return api.patch(`/${tid}/correspondence/${editId}`, payload).then((r) => r.data);
      return api.post(`/${tid}/correspondence`, payload).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['correspondence', tid] });
      closeForm();
    },
    onError: (e) => setError(apiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/${tid}/correspondence/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['correspondence', tid] }),
    onError: (e) => setError(apiError(e)),
  });

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyForm });
    setError('');
    setShowForm(true);
  }

  function openEdit(l: Letter) {
    setEditId(l.id);
    setForm({
      letterNumber: l.letterNumber ?? '',
      direction: l.direction,
      subject: l.subject,
      body: l.body ?? '',
      senderName: l.senderName ?? '',
      recipientName: l.recipientName ?? '',
      letterDate: l.letterDate ? l.letterDate.slice(0, 10) : '',
      receivedDate: l.receivedDate ? l.receivedDate.slice(0, 10) : '',
      priority: l.priority,
      status: l.status,
      notes: l.notes ?? '',
      relatedRequestId: l.request?.id ?? '',
      relatedInvoiceId: l.invoice?.id ?? '',
    });
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setError('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.subject.trim()) { setError('موضوع الزامی است'); return; }
    saveMut.mutate(form);
  }

  const letters = listQ.data ?? [];

  return (
    <Layout title="مکاتبات اداری">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">مکاتبات اداری</h1>
            <p className="text-sm text-slate-500 mt-1">ثبت و پیگیری نامه‌های صادره و وارده سازمان</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            + نامه جدید
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3">
          <input
            className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="جستجو در موضوع، شماره، فرستنده..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={dirFilter}
            onChange={(e) => setDirFilter(e.target.value)}
          >
            <option value="">همه نوع‌ها</option>
            {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">همه وضعیت‌ها</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">{error}</div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          {listQ.isLoading ? (
            <div className="text-center py-12 text-slate-400">در حال بارگذاری...</div>
          ) : letters.length === 0 ? (
            <div className="text-center py-12 text-slate-400">هیچ نامه‌ای یافت نشد</div>
          ) : (
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3 text-right font-medium text-slate-600">شماره</th>
                  <th className="p-3 text-right font-medium text-slate-600">نوع</th>
                  <th className="p-3 text-right font-medium text-slate-600">موضوع</th>
                  <th className="p-3 text-right font-medium text-slate-600">فرستنده / گیرنده</th>
                  <th className="p-3 text-right font-medium text-slate-600">تاریخ نامه</th>
                  <th className="p-3 text-right font-medium text-slate-600">اولویت</th>
                  <th className="p-3 text-right font-medium text-slate-600">وضعیت</th>
                  <th className="p-3 text-right font-medium text-slate-600">درخواست</th>
                  <th className="p-3 text-right font-medium text-slate-600">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {letters.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs text-slate-600">{l.letterNumber || '—'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${DIRECTION_COLOR[l.direction] ?? 'bg-slate-100'}`}>
                        {l.direction}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setViewLetter(l)}
                        className="font-medium text-slate-800 hover:text-indigo-700 text-right"
                      >
                        {l.subject}
                      </button>
                    </td>
                    <td className="p-3 text-slate-600 text-xs">
                      {l.direction === 'وارده' ? (l.senderName || '—') : (l.recipientName || '—')}
                    </td>
                    <td className="p-3 text-slate-600">{faDate(l.letterDate)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${PRIORITY_COLOR[l.priority] ?? 'bg-slate-100'}`}>
                        {l.priority}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[l.status] ?? 'bg-slate-100'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {l.request ? (
                        <span className="text-xs font-semibold text-blue-700">{l.request.requestNumber}</span>
                      ) : '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(l)}
                          className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                        >
                          ویرایش
                        </button>
                        <button
                          onClick={() => { if (confirm('حذف شود؟')) deleteMut.mutate(l.id); }}
                          className="px-2 py-1 text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 rounded"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* View Letter Modal */}
      {viewLetter && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${DIRECTION_COLOR[viewLetter.direction]}`}>
                    {viewLetter.direction}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${PRIORITY_COLOR[viewLetter.priority]}`}>
                    {viewLetter.priority}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[viewLetter.status]}`}>
                    {viewLetter.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-800 mt-2">{viewLetter.subject}</h2>
                {viewLetter.letterNumber && (
                  <p className="text-xs text-slate-400">شماره: {viewLetter.letterNumber}</p>
                )}
              </div>
              <button onClick={() => setViewLetter(null)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">فرستنده: </span>
                  <span className="font-medium">{viewLetter.senderName || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">گیرنده: </span>
                  <span className="font-medium">{viewLetter.recipientName || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">تاریخ نامه: </span>
                  <span className="font-medium">{faDate(viewLetter.letterDate)}</span>
                </div>
                <div>
                  <span className="text-slate-500">تاریخ دریافت: </span>
                  <span className="font-medium">{faDate(viewLetter.receivedDate)}</span>
                </div>
                {viewLetter.request && (
                  <div>
                    <span className="text-slate-500">درخواست مرتبط: </span>
                    <span className="font-semibold text-blue-700">{viewLetter.request.requestNumber}</span>
                  </div>
                )}
                {viewLetter.invoice && (
                  <div>
                    <span className="text-slate-500">فاکتور مرتبط: </span>
                    <span className="font-semibold text-blue-700">{viewLetter.invoice.invoiceNumber}</span>
                  </div>
                )}
              </div>
              {viewLetter.body && (
                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap">
                  {viewLetter.body}
                </div>
              )}
              {viewLetter.notes && (
                <div>
                  <span className="text-xs text-slate-500 block mb-1">یادداشت:</span>
                  <p className="text-sm text-slate-600">{viewLetter.notes}</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => { setViewLetter(null); openEdit(viewLetter); }}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                ویرایش
              </button>
              <button onClick={() => setViewLetter(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{editId ? 'ویرایش نامه' : 'ثبت نامه جدید'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">نوع نامه</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.direction}
                    onChange={(e) => setForm((p) => ({ ...p, direction: e.target.value as 'صادره' | 'وارده' }))}
                  >
                    {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">شماره نامه</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.letterNumber}
                    onChange={(e) => setForm((p) => ({ ...p, letterNumber: e.target.value }))}
                    placeholder="اختیاری"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">موضوع *</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.subject}
                    onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    placeholder="موضوع نامه"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">فرستنده</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.senderName}
                    onChange={(e) => setForm((p) => ({ ...p, senderName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">گیرنده</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.recipientName}
                    onChange={(e) => setForm((p) => ({ ...p, recipientName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">تاریخ نامه</label>
                  <JDatePicker
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.letterDate}
                    onChange={(v) => setForm((p) => ({ ...p, letterDate: v }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">تاریخ دریافت</label>
                  <JDatePicker
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.receivedDate}
                    onChange={(v) => setForm((p) => ({ ...p, receivedDate: v }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">اولویت</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                  >
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">وضعیت</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">متن نامه</label>
                  <textarea
                    rows={5}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                    value={form.body}
                    onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                    placeholder="متن نامه..."
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">یادداشت</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={saveMut.isPending}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                >
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

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate, faMoney } from '../lib/format';
import { Pagination } from '../components/Pagination';
import { JDatePicker } from '../components/JDatePicker';
import { SearchableSelect } from '../components/SearchableSelect';
import { ExcelButton } from '../components/ExcelButton';
import { EntityAttachments } from '../components/EntityAttachments';
import { EntityTimeline } from '../components/EntityTimeline';

const STATUS_COLORS: Record<string, string> = {
  'جدید': 'bg-blue-100 text-blue-700',
  'در بررسی': 'bg-amber-100 text-amber-700',
  'تأیید شده': 'bg-emerald-100 text-emerald-700',
  'در انتظار پیش‌فاکتور': 'bg-violet-100 text-violet-700',
  'سفارش داده شده': 'bg-sky-100 text-sky-700',
  'تحویل شده': 'bg-teal-100 text-teal-700',
  'کنسل شده': 'bg-rose-100 text-rose-700',
};

interface RequestRow {
  id: string;
  requestNumber: string;
  title: string | null;
  description: string | null;
  status: string;
  estimatedAmount: string | null;
  supplier: { id: string; name: string } | null;
  assignee: { id: string; fullName: string } | null;
  followUpDate: string | null;
  archived: boolean;
  _count?: { quotations: number };
}

interface RequestDetail extends RequestRow {
  orderNo: string | null;
  category: string | null;
  notes: string | null;
  deliveryDate: string | null;
  quotations: { id: string; quotationNumber: string; amount: string; status: string }[];
  invoices: { id: string; invoiceNumber: string; totalAmount: string; status: string }[];
}

interface DocRef {
  id: string;
  originalFilename: string | null;
  filename: string;
  mimeType: string | null;
  size: number;
  category: string | null;
}

interface CompareQuotation {
  id: string;
  quotationNumber: string | null;
  amount: string;
  advancePaymentAmount: string | null;
  advancePaymentDate: string | null;
  status: string;
  followUpDate: string | null;
  notes: string | null;
  paymentBatchNumber: string | null;
  accountingReference: string | null;
  supplier: { name: string } | null;
  budget: { name: string | null; monthJalali: number; yearJalali: number } | null;
}

interface RequestsResponse {
  requests: RequestRow[];
  total: number;
  page: number;
  totalPages: number;
}

const STATUSES = [
  'جدید', 'در بررسی', 'تأیید شده', 'در انتظار پیش‌فاکتور',
  'سفارش داده شده', 'تحویل شده', 'در حال تعمیر یا بررسی توسط ورکشاپ',
  'در انتظار اطلاعات بیشتر', 'کنسل شده',
];

const emptyForm = {
  requestNumber: '', title: '', description: '', estimatedAmount: '',
  status: 'جدید', category: '', orderNo: '', notes: '', supplierId: '',
  assigneeId: '',
  followUpDate: '', deliveryDate: '',
};

function docIcon(mime: string | null): string {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  return '📄';
}



export function Requests({ archived = false }: { archived?: boolean }) {
  const { t } = useTranslation();
  const { currentTenantId, can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editReq, setEditReq] = useState<RequestRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [linkId, setLinkId] = useState<string | null>(null);
  const [compareReqId, setCompareReqId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [dragId, setDragId] = useState<string | null>(null);

  const tid = currentTenantId!;
  const listKey = ['requests', tid, search, archived, page];

  useEffect(() => { setPage(1); }, [search, archived]);

  const { data, isLoading, error } = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const res = await api.get(`/${tid}/requests`, {
        params: { search: search || undefined, archived: archived ? 'true' : undefined, page, limit: 50 },
      });
      return res.data as RequestsResponse;
    },
    enabled: Boolean(tid),
  });

  const suppliersQ = useQuery({
    queryKey: ['suppliers-opt', tid],
    queryFn: async () => (await api.get(`/${tid}/suppliers`)).data.suppliers as { id: string; name: string }[],
    enabled: Boolean(tid),
  });

  const usersQ = useQuery({
    queryKey: ['assignable-users', tid],
    queryFn: async () => (await api.get(`/${tid}/requests/assignable-users`)).data.users as { id: string; fullName: string }[],
    enabled: Boolean(tid),
  });

  const kanbanQ = useQuery({
    queryKey: ['requests-kanban', tid, search],
    queryFn: async () => (await api.get(`/${tid}/requests`, {
      params: { archived: false, search: search || undefined, limit: 500 },
    })).data.requests as RequestRow[],
    enabled: Boolean(tid) && viewMode === 'kanban' && !archived,
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      api.patch(`/${tid}/requests/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests', tid] });
      qc.invalidateQueries({ queryKey: ['requests-kanban', tid] });
    },
  });

  const linkQ = useQuery({
    queryKey: ['request-detail', tid, linkId],
    queryFn: async () => (await api.get(`/${tid}/requests/${linkId}`)).data.request as RequestDetail,
    enabled: Boolean(linkId && tid),
  });

  const compareQ = useQuery({
    queryKey: ['req-compare', tid, compareReqId],
    queryFn: async () => (await api.get(`/${tid}/requests/${compareReqId}/quotations`)).data.quotations as CompareQuotation[],
    enabled: Boolean(compareReqId && tid),
  });

  const docsQ = useQuery({
    queryKey: ['request-docs', tid, linkId],
    queryFn: async () => (await api.get(`/${tid}/documents`, {
      params: { entityType: 'request', entityId: linkId },
    })).data as { documents: DocRef[]; total: number },
    enabled: Boolean(linkId && tid),
  });

  function openCreate() {
    setEditReq(null);
    setForm({ ...emptyForm });
    setFormError('');
    setShowForm(true);
  }

  function openEdit(r: RequestRow) {
    setEditReq(r);
    setForm({
      requestNumber: r.requestNumber,
      title: r.title ?? '',
      description: r.description ?? '',
      estimatedAmount: r.estimatedAmount ?? '',
      status: r.status,
      category: '',
      orderNo: '',
      notes: '',
      supplierId: r.supplier?.id ?? '',
      assigneeId: r.assignee?.id ?? '',
      followUpDate: r.followUpDate ? r.followUpDate.slice(0, 10) : '',
      deliveryDate: '',
    });
    setFormError('');
    setShowForm(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        requestNumber: form.requestNumber,
        title: form.title || null,
        description: form.description || null,
        estimatedAmount: form.estimatedAmount ? Number(form.estimatedAmount) : null,
        status: form.status,
        category: form.category || null,
        orderNo: form.orderNo || null,
        notes: form.notes || null,
        supplierId: form.supplierId || null,
        assigneeId: form.assigneeId || null,
        followUpDate: form.followUpDate || null,
        deliveryDate: form.deliveryDate || null,
      };
      if (editReq) return api.patch(`/${tid}/requests/${editReq.id}`, payload);
      return api.post(`/${tid}/requests`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests', tid] });
      setShowForm(false);
    },
    onError: (err) => setFormError(apiError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/requests/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests', tid] }),
  });

  const archiveMut = useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore: boolean }) =>
      api.post(`/${tid}/requests/${id}/${restore ? 'restore' : 'archive'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests', tid] }),
  });

  async function downloadReqDoc(docId: string, filename: string) {
    const res = await api.get(`/${tid}/documents/${docId}/file`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    saveMut.mutate();
  }

  return (
    <Layout title={archived ? t('requests.archiveTitle') : t('requests.title')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input
          className="input max-w-xs"
          placeholder={t('requests.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-2">
          {!archived && (
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                onClick={() => setViewMode('table')}
              >{t('requests.viewTable', '☰ جدول')}</button>
              <button
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                onClick={() => setViewMode('kanban')}
              >{t('requests.viewKanban', '⊞ کانبان')}</button>
            </div>
          )}
          <ExcelButton store="requests" />
          {!archived && can('requests.create') && (
            <button className="btn btn-primary" onClick={openCreate}>{t('requests.addNew')}</button>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-sm font-bold text-slate-800">
              {editReq ? t('requests.form.editTitle') : t('requests.form.newTitle')}
            </h2>
            <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
              {formError && <div className="sm:col-span-2 text-sm text-rose-600">{formError}</div>}

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.requestNumber')}</span>
                <input className="input" value={form.requestNumber} onChange={(e) => setForm({ ...form, requestNumber: e.target.value })} required />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.orderNo')}</span>
                <input className="input" dir="ltr" value={form.orderNo} onChange={(e) => setForm({ ...form, orderNo: e.target.value })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.title')}</span>
                <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value, title: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.status')}</span>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.category')}</span>
                <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.estimatedAmount')}</span>
                <input className="input" type="number" value={form.estimatedAmount} onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.supplier')}</span>
                <SearchableSelect
                  value={form.supplierId}
                  onChange={(v) => setForm({ ...form, supplierId: v })}
                  placeholder="—"
                  options={[{ value: '', label: '—' }, ...(suppliersQ.data ?? []).map((s) => ({ value: s.id, label: s.name }))]}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.assignee', 'مسئول (اساین)')}</span>
                <select className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                  <option value="">{t('requests.form.unassigned', 'بدون مسئول')}</option>
                  {(usersQ.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.followUpDate')}</span>
                <JDatePicker className="input" value={form.followUpDate} onChange={(v) => setForm({ ...form, followUpDate: v })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.deliveryDate')}</span>
                <JDatePicker className="input" value={form.deliveryDate} onChange={(v) => setForm({ ...form, deliveryDate: v })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.form.notes')}</span>
                <textarea className="input min-h-[70px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>

              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">📎 فایل‌ها</span>
                <EntityAttachments entityType="request" entityId={editReq?.id ?? null} />
              </div>

              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">📜 تاریخچه</span>
                <EntityTimeline entityType="request" entityId={editReq?.id ?? null} />
              </div>

              <div className="sm:col-span-2 flex gap-2 pt-1">
                <button className="btn btn-primary" disabled={saveMut.isPending}>
                  {saveMut.isPending ? t('common.saving') : t('common.save')}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kanban board */}
      {viewMode === 'kanban' && !archived && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {(['جدید', 'در بررسی', 'تأیید شده', 'در انتظار پیش‌فاکتور', 'سفارش داده شده', 'تحویل شده', 'کنسل شده'] as const).map((col) => {
              const cards = (kanbanQ.data ?? []).filter((r) => r.status === col);
              const colColor = STATUS_COLORS[col] ?? 'bg-slate-100 text-slate-600';
              return (
                <div
                  key={col}
                  className="w-52 flex-shrink-0"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData('reqId');
                    if (id) statusMut.mutate({ id, status: col });
                  }}
                >
                  <div className={`mb-2 flex items-center justify-between rounded-lg px-3 py-2 ${colColor}`}>
                    <span className="text-xs font-bold">{col}</span>
                    <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold">{cards.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {cards.map((r) => (
                      <div
                        key={r.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('reqId', r.id); setDragId(r.id); }}
                        onDragEnd={() => setDragId(null)}
                        className={`rounded-lg border bg-white p-3 shadow-sm cursor-grab hover:shadow-md transition-shadow ${dragId === r.id ? 'opacity-40 scale-95' : ''}`}
                      >
                        <div className="text-xs font-bold text-blue-700">{r.requestNumber}</div>
                        {r.description && <div className="mt-0.5 text-[11px] text-slate-600 line-clamp-2">{r.description}</div>}
                        {r.supplier && <div className="mt-1 text-[10px] text-slate-400">{r.supplier.name}</div>}
                        {r.assignee && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700">
                            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-indigo-200 text-[7px]">{r.assignee.fullName.charAt(0)}</span>
                            {r.assignee.fullName}
                          </div>
                        )}
                        <div className="mt-1 flex items-center justify-between">
                          {r.estimatedAmount && <span className="text-[10px] font-bold text-emerald-700">{faMoney(r.estimatedAmount)}</span>}
                          {(r._count?.quotations ?? 0) > 0 && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-700">{r._count!.quotations} {t('quotations.title')}</span>
                          )}
                        </div>
                        {r.followUpDate && (
                          <div className={`mt-1 text-[9px] ${new Date(r.followUpDate) < new Date() ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                            📅 {faDate(r.followUpDate)}
                          </div>
                        )}
                        <div className="mt-2 flex gap-1">
                          {can('requests.edit') && (
                            <button className="btn btn-outline px-1.5 py-0.5 text-[10px]" onClick={() => openEdit(r)}>✏</button>
                          )}
                          <button className="btn btn-outline px-1.5 py-0.5 text-[10px]" onClick={() => setLinkId(linkId === r.id ? null : r.id)}>🔗</button>
                        </div>
                      </div>
                    ))}
                    {kanbanQ.isFetching && cards.length === 0 && (
                      <div className="rounded-lg border-2 border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">{t('common.loading')}</div>
                    )}
                    {!kanbanQ.isFetching && cards.length === 0 && (
                      <div className="rounded-lg border-2 border-dashed border-slate-100 py-6 text-center text-[10px] text-slate-300">—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table view */}
      {(viewMode === 'table' || archived) && <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500">{apiError(error)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-3">{t('requests.cols.number')}</th>
                <th className="p-3">{t('requests.cols.title')}</th>
                <th className="p-3">{t('requests.form.estimatedAmount')}</th>
                <th className="p-3">{t('requests.cols.supplier')}</th>
                <th className="p-3">{t('requests.cols.assignee', 'مسئول')}</th>
                <th className="p-3">{t('requests.cols.status')}</th>
                <th className="p-3">{t('requests.cols.date')}</th>
                <th className="p-3">{t('quotations.title')}</th>
                <th className="p-3">{t('requests.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.requests ?? []).map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{r.requestNumber}</td>
                  <td className="p-3">{r.description ?? '—'}</td>
                  <td className="p-3">{r.estimatedAmount ? faMoney(r.estimatedAmount) : '—'}</td>
                  <td className="p-3">{r.supplier?.name ?? '—'}</td>
                  <td className="p-3">
                    {r.assignee ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-200 text-[9px]">{r.assignee.fullName.charAt(0)}</span>
                        {r.assignee.fullName}
                      </span>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                  </td>
                  <td className="p-3">{faDate(r.followUpDate)}</td>
                  <td className="p-3">{r._count?.quotations ?? 0}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline px-2 py-1 text-xs"
                        title={t('requests.actions.links')}
                        onClick={() => setLinkId(linkId === r.id ? null : r.id)}
                      >🔗</button>
                      {can('requests.edit') && !archived && (
                        <button className="btn btn-outline px-2 py-1" onClick={() => openEdit(r)} title={t('common.edit')}>✏</button>
                      )}
                      {can('requests.archive') && !archived && (
                        <button
                          className="btn btn-outline px-2 py-1 text-amber-600"
                          title={t('common.archive')}
                          onClick={() => { if (confirm(t('requests.confirm.archive'))) archiveMut.mutate({ id: r.id, restore: false }); }}
                        >🗄</button>
                      )}
                      {can('requests.archive') && archived && (
                        <button
                          className="btn btn-outline px-2 py-1 text-emerald-600"
                          title={t('common.restore')}
                          onClick={() => archiveMut.mutate({ id: r.id, restore: true })}
                        >↩</button>
                      )}
                      {can('requests.delete') && (
                        <button
                          className="btn btn-outline px-2 py-1 text-rose-600"
                          onClick={() => { if (confirm(t('common.delete') + '؟')) deleteMut.mutate(r.id); }}
                        >🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.requests ?? []).length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">{t('requests.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>}

      {(viewMode === 'table' || archived) && data && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          onPageChange={setPage}
          label={t('requests.cols.number')}
        />
      )}

      {/* Linked entities modal */}
      {linkId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 overflow-y-auto" onClick={() => setLinkId(null)}>
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-800">{linkQ.data?.requestNumber ?? '...'}</h2>
                <p className="text-xs text-slate-500">{t('requests.linked.title')}</p>
              </div>
              <button className="btn btn-outline px-2 py-1.5" onClick={() => setLinkId(null)}>✕</button>
            </div>
            {linkQ.isLoading ? (
              <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
            ) : linkQ.data ? (
              <div className="p-5 space-y-4">
                {/* Request meta */}
                <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-600">
                  {linkQ.data.orderNo && <div>{t('requests.form.orderNo')}: <b>{linkQ.data.orderNo}</b></div>}
                  {linkQ.data.category && <div>{t('requests.form.category')}: <b>{linkQ.data.category}</b></div>}
                  {linkQ.data.supplier && <div>{t('requests.form.supplier')}: <b>{linkQ.data.supplier.name}</b></div>}
                  {linkQ.data.deliveryDate && <div>{t('requests.form.deliveryDate')}: <b>{faDate(linkQ.data.deliveryDate)}</b></div>}
                  {linkQ.data.notes && <div className="sm:col-span-2 text-slate-500">{linkQ.data.notes}</div>}
                </div>

                {/* Linked quotations */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-700">
                      {t('requests.linked.quotations')} ({linkQ.data.quotations.length})
                    </div>
                    {linkQ.data.quotations.length >= 2 && (
                      <button
                        className="btn btn-outline text-xs px-2 py-1"
                        onClick={() => setCompareReqId(linkId)}
                      >{t('requests.actions.compareQuotes')}</button>
                    )}
                  </div>
                  {linkQ.data.quotations.length === 0 ? (
                    <div className="text-xs text-slate-400">{t('requests.linked.noQuotations')}</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-slate-50 text-right text-slate-500">
                          <th className="p-2">{t('common.number')}</th><th className="p-2">{t('common.amount')}</th><th className="p-2">{t('common.status')}</th>
                        </tr></thead>
                        <tbody>
                          {linkQ.data.quotations.map((q) => (
                            <tr key={q.id} className="border-t border-slate-100">
                              <td className="p-2 font-bold">{q.quotationNumber ?? q.id.slice(-5)}</td>
                              <td className="p-2">{Number(q.amount).toLocaleString('fa-IR')}</td>
                              <td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{q.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Linked invoices */}
                <div>
                  <div className="mb-1.5 text-xs font-bold text-slate-700">
                    {t('requests.linked.invoices')} ({linkQ.data.invoices.length})
                  </div>
                  {linkQ.data.invoices.length === 0 ? (
                    <div className="text-xs text-slate-400">{t('requests.linked.noInvoices')}</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-slate-50 text-right text-slate-500">
                          <th className="p-2">{t('common.number')}</th><th className="p-2">{t('invoices.cols.amount')}</th><th className="p-2">{t('common.status')}</th>
                        </tr></thead>
                        <tbody>
                          {linkQ.data.invoices.map((inv) => (
                            <tr key={inv.id} className="border-t border-slate-100">
                              <td className="p-2 font-bold">{inv.invoiceNumber}</td>
                              <td className="p-2">{Number(inv.totalAmount).toLocaleString('fa-IR')}</td>
                              <td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{inv.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Linked documents */}
                {can('document_center.view_document') && (
                  <div>
                    <div className="mb-1.5 text-xs font-bold text-slate-700">
                      {t('requests.linked.documents')} {docsQ.data ? `(${docsQ.data.total})` : ''}
                    </div>
                    {docsQ.isLoading ? (
                      <div className="text-xs text-slate-400">{t('common.loading')}</div>
                    ) : (docsQ.data?.documents ?? []).length === 0 ? (
                      <div className="text-xs text-slate-400">{t('requests.linked.noDocs')}</div>
                    ) : (
                      <div className="space-y-1">
                        {(docsQ.data?.documents ?? []).map((doc) => (
                          <div key={doc.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                            <span>{docIcon(doc.mimeType)}</span>
                            <span className="flex-1 truncate text-slate-700">{doc.originalFilename ?? doc.filename}</span>
                            {doc.category && (
                              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">{doc.category}</span>
                            )}
                            <button
                              className="text-slate-400 hover:text-blue-600"
                              title={t('common.download')}
                              onClick={() => downloadReqDoc(doc.id, doc.originalFilename ?? doc.filename)}
                            >⬇️</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
      {/* Quotation comparison modal */}
      {compareReqId && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-10 overflow-y-auto"
          onClick={() => setCompareReqId(null)}
        >
          <div
            className="w-full max-w-4xl rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-800">{t('requests.compare.title')}</h2>
              <button className="btn btn-outline px-2 py-1.5" onClick={() => setCompareReqId(null)}>✕</button>
            </div>

            {compareQ.isLoading ? (
              <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
            ) : (compareQ.data ?? []).length === 0 ? (
              <div className="p-8 text-center text-slate-400">{t('requests.empty')}</div>
            ) : (() => {
              const qs = compareQ.data!;
              const minAmount = Math.min(...qs.map((q) => Number(q.amount)));
              const rows: [string, (q: CompareQuotation) => string][] = [
                [t('requests.compare.attrs.supplier'), (q) => q.supplier?.name ?? '—'],
                [t('requests.compare.attrs.amount'), (q) => Number(q.amount).toLocaleString('fa-IR')],
                [t('requests.compare.attrs.advance'), (q) => q.advancePaymentAmount ? Number(q.advancePaymentAmount).toLocaleString('fa-IR') : '—'],
                [t('requests.compare.attrs.status'), (q) => q.status],
                [t('requests.compare.attrs.followUp'), (q) => faDate(q.followUpDate)],
                [t('requests.compare.attrs.budget'), (q) => q.budget ? (q.budget.name ?? `${q.budget.monthJalali}/${q.budget.yearJalali}`) : '—'],
                [t('requests.compare.attrs.batch'), (q) => q.paymentBatchNumber ?? '—'],
                [t('requests.compare.attrs.accountingRef'), (q) => q.accountingReference ?? '—'],
                [t('requests.compare.attrs.notes'), (q) => q.notes ?? '—'],
              ];
              return (
                <div className="p-5 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="border border-slate-200 bg-slate-50 p-2 text-right text-slate-500 font-semibold min-w-[120px]">{t('common.name')}</th>
                        {qs.map((q) => (
                          <th key={q.id} className="border border-slate-200 bg-slate-50 p-2 text-center font-bold text-slate-700 min-w-[150px]">
                            {q.quotationNumber ?? q.id.slice(-6)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(([label, getter]) => (
                        <tr key={label} className="hover:bg-slate-50">
                          <td className="border border-slate-200 bg-slate-50 p-2 font-semibold text-slate-600">{label}</td>
                          {qs.map((q) => {
                            const val = getter(q);
                            const isLowest = label === t('requests.compare.attrs.amount') && Number(q.amount) === minAmount;
                            return (
                              <td
                                key={q.id}
                                className={`border border-slate-200 p-2 text-center ${isLowest ? 'bg-emerald-50 font-bold text-emerald-700' : ''}`}
                              >{val}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-slate-400">{t('requests.compare.legend')}</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </Layout>
  );
}

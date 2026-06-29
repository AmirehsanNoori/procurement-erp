import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate, JMONTHS } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';
import { SearchableSelect } from '../components/SearchableSelect';
import { ExcelButton } from '../components/ExcelButton';
import { EntityAttachments } from '../components/EntityAttachments';
import { EntityTimeline } from '../components/EntityTimeline';

const STATUS_COLORS: Record<string, string> = {
  'در انتظار سفارش': 'bg-amber-100 text-amber-700',
  'تأیید شده': 'bg-emerald-100 text-emerald-700',
  'رد شده': 'bg-rose-100 text-rose-700',
  'آرشیو': 'bg-slate-100 text-slate-600',
  'تبدیل شده': 'bg-blue-100 text-blue-700',
  'بازنده RFQ': 'bg-rose-50 text-rose-500',
};

interface Quotation {
  id: string; quotationNumber: string | null; amount: string; currency: string; status: string;
  advancePaymentAmount: string | null; advancePaymentDate: string | null;
  followUpDate: string | null; archived: boolean; notes: string | null;
  paymentBatchNumber: string | null; accountingReference: string | null;
  supplier: { id: string; name: string } | null;
  request: { id: string; requestNumber: string } | null;
  budget: { id: string; name: string | null; monthJalali: number; yearJalali: number } | null;
}

const STATUSES = ['در انتظار سفارش', 'تأیید شده', 'رد شده', 'آرشیو'];

const emptyForm = {
  quotationNumber: '', supplierId: '', requestId: '', budgetId: '',
  amount: '', advancePaymentAmount: '', advancePaymentDate: '',
  status: 'در انتظار سفارش', followUpDate: '', notes: '',
  paymentBatchNumber: '', accountingReference: '',
};

type FormState = typeof emptyForm;

interface ConvInst { amount: string; monthKey: string; dueDate: string }
interface ConvertState {
  q: Quotation;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  netAmount: string;
  vatAmount: string;
  budgetId: string;
  // accounting
  sentToAccounting: boolean;
  accountingSubmissionDate: string;
  accountingReference: string;
  batch: string;
  // follow-up + notes
  followUpDate: string;
  notes: string;
  installments: ConvInst[];
}

function emptyConvert(q: Quotation): ConvertState {
  return {
    q,
    invoiceNumber: '',
    invoiceDate: '',
    dueDate: '',
    netAmount: String(q.amount),
    vatAmount: '0',
    budgetId: q.budget?.id ?? '',
    sentToAccounting: false,
    accountingSubmissionDate: '',
    accountingReference: q.accountingReference ?? '',
    batch: q.paymentBatchNumber ?? '',
    followUpDate: q.followUpDate ? q.followUpDate.slice(0, 10) : '',
    notes: q.notes ?? '',
    installments: [],
  };
}

export function Quotations({ archived = false }: { archived?: boolean }) {
  const { t } = useTranslation();
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editQuot, setEditQuot] = useState<Quotation | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [err, setErr] = useState('');
  const [convert, setConvert] = useState<ConvertState | null>(null);
  const [convErr, setConvErr] = useState('');

  const listKey = ['quotations', tid, archived, search, statusFilter];
  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: async () => (await api.get(`/${tid}/quotations`, { params: { archived, search: search || undefined, status: statusFilter || undefined } })).data.quotations as Quotation[],
    enabled: Boolean(tid),
  });

  const suppliersQ = useQuery({ queryKey: ['suppliers-opt', tid], queryFn: async () => (await api.get(`/${tid}/suppliers`)).data.suppliers as { id: string; name: string }[], enabled: Boolean(tid) });
  // Include archived requests: once a request gets its first quotation it is
  // archived, but we must still be able to add further quotations to it.
  const requestsQ = useQuery({ queryKey: ['requests-opt', tid], queryFn: async () => (await api.get(`/${tid}/requests`, { params: { archived: 'all', limit: 200 } })).data.requests as { id: string; requestNumber: string; description: string | null }[], enabled: Boolean(tid) && !archived });
  const budgetsQ = useQuery({ queryKey: ['budgets-opt', tid], queryFn: async () => (await api.get(`/${tid}/budgets`)).data.budgets as { id: string; name: string | null; monthJalali: number; yearJalali: number }[], enabled: Boolean(tid) });

  const budgetOpts = (budgetsQ.data ?? []).map((b) => ({ id: b.id, label: b.name || `${b.monthJalali}/${b.yearJalali}` }));

  function openCreate() {
    setEditQuot(null);
    setForm({ ...emptyForm });
    setErr('');
    setOpen(true);
  }

  function openEdit(q: Quotation) {
    setEditQuot(q);
    setForm({
      quotationNumber: q.quotationNumber ?? '',
      supplierId: q.supplier?.id ?? '',
      requestId: q.request?.id ?? '',
      budgetId: q.budget?.id ?? '',
      amount: q.amount,
      advancePaymentAmount: q.advancePaymentAmount ?? '',
      advancePaymentDate: q.advancePaymentDate ? q.advancePaymentDate.slice(0, 10) : '',
      status: q.status,
      followUpDate: q.followUpDate ? q.followUpDate.slice(0, 10) : '',
      notes: q.notes ?? '',
      paymentBatchNumber: q.paymentBatchNumber ?? '',
      accountingReference: q.accountingReference ?? '',
    });
    setErr('');
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        quotationNumber: form.quotationNumber || null,
        supplierId: form.supplierId || null,
        requestId: form.requestId || null,
        budgetId: form.budgetId || null,
        amount: Number(form.amount || 0),
        advancePaymentAmount: form.advancePaymentAmount ? Number(form.advancePaymentAmount) : null,
        advancePaymentDate: form.advancePaymentDate || null,
        status: form.status,
        followUpDate: form.followUpDate || null,
        notes: form.notes || null,
        paymentBatchNumber: form.paymentBatchNumber || null,
        accountingReference: form.accountingReference || null,
      };
      if (editQuot) return api.patch(`/${tid}/quotations/${editQuot.id}`, payload);
      return api.post(`/${tid}/quotations`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', tid] });
      qc.invalidateQueries({ queryKey: ['requests', tid] });
      setOpen(false);
    },
    onError: (e) => setErr(apiError(e)),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/quotations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations', tid] }),
  });

  const archiveMut = useMutation({
    mutationFn: async (id: string) => api.post(`/${tid}/quotations/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations', tid] }),
  });

  const convertMut = useMutation({
    mutationFn: async () => {
      const c = convert!;
      const insts = c.installments.filter((i) => Number(i.amount) > 0);
      return api.post(`/${tid}/quotations/${c.q.id}/convert-to-invoice`, {
        invoiceNumber: c.invoiceNumber,
        invoiceDate: c.invoiceDate || undefined,
        dueDate: c.dueDate,
        netAmount: Number(c.netAmount || 0),
        vatAmount: Number(c.vatAmount || 0),
        budgetId: c.budgetId || undefined,
        sentToAccounting: c.sentToAccounting,
        accountingSubmissionDate: c.accountingSubmissionDate || undefined,
        accountingReference: c.accountingReference || undefined,
        batch: c.batch || undefined,
        followUpDate: c.followUpDate || undefined,
        notes: c.notes || undefined,
        installments: insts.length ? insts.map((i) => ({ amount: Number(i.amount), monthKey: i.monthKey || undefined, dueDate: i.dueDate || undefined })) : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', tid] });
      qc.invalidateQueries({ queryKey: ['invoices', tid] });
      setConvert(null);
    },
    onError: (e) => setConvErr(apiError(e)),
  });

  const convInstTotal = convert ? convert.installments.reduce((s, i) => s + Number(i.amount || 0), 0) : 0;
  const convGrandTotal = convert ? Number(convert.netAmount || 0) + Number(convert.vatAmount || 0) : 0;

  function submit(e: FormEvent) { e.preventDefault(); setErr(''); saveMut.mutate(); }

  return (
    <Layout title={archived ? t('quotations.archiveTitle') : t('quotations.title')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-xs" placeholder={t('quotations.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input max-w-[12rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">همه وضعیت‌ها</option>
            {['در انتظار سفارش', 'تأیید شده', 'رد شده', 'تبدیل شده', 'بازنده RFQ', 'آرشیو'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ExcelButton store="quotations" />
          {!archived && can('quotations.create') && (
            <button className="btn btn-primary" onClick={openCreate}>{t('quotations.addNew')}</button>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-sm font-bold text-slate-800">
              {editQuot ? t('quotations.form.editTitle') : t('quotations.form.newTitle')}
            </h2>
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
              {err && <div className="sm:col-span-2 text-sm text-rose-600">{err}</div>}

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.cols.number')}</span>
                <input className="input" dir="ltr" value={form.quotationNumber} onChange={(e) => setForm({ ...form, quotationNumber: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.supplierId')}</span>
                <SearchableSelect
                  value={form.supplierId}
                  onChange={(v) => setForm({ ...form, supplierId: v })}
                  required
                  options={(suppliersQ.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.requestId')}</span>
                <SearchableSelect
                  value={form.requestId}
                  onChange={(v) => setForm({ ...form, requestId: v })}
                  placeholder="—"
                  options={[{ value: '', label: '— بدون درخواست —' }, ...(requestsQ.data ?? []).map((r) => ({ value: r.id, label: `${r.requestNumber}${r.description ? ' — ' + r.description.slice(0, 30) : ''}` }))]}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.cols.budget')}</span>
                <SearchableSelect
                  value={form.budgetId}
                  onChange={(v) => setForm({ ...form, budgetId: v })}
                  placeholder="—"
                  options={[{ value: '', label: '— بدون بودجه —' }, ...budgetOpts.map((b) => ({ value: b.id, label: b.label }))]}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.amount')}</span>
                <input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.status')}</span>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.advancePaymentAmount')}</span>
                <input className="input" type="number" value={form.advancePaymentAmount} onChange={(e) => setForm({ ...form, advancePaymentAmount: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.advancePaymentDate')}</span>
                <JDatePicker className="input" value={form.advancePaymentDate} onChange={(v) => setForm({ ...form, advancePaymentDate: v })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.followUpDate')}</span>
                <JDatePicker className="input" value={form.followUpDate} onChange={(v) => setForm({ ...form, followUpDate: v })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.batchNumber')}</span>
                <input className="input" dir="ltr" value={form.paymentBatchNumber} onChange={(e) => setForm({ ...form, paymentBatchNumber: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.accountingRef')}</span>
                <input className="input" dir="ltr" value={form.accountingReference} onChange={(e) => setForm({ ...form, accountingReference: e.target.value })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('quotations.form.notes')}</span>
                <textarea className="input min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>

              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">📎 فایل‌ها</span>
                <EntityAttachments entityType="quotation" entityId={editQuot?.id ?? null} />
              </div>

              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">📜 تاریخچه</span>
                <EntityTimeline entityType="quotation" entityId={editQuot?.id ?? null} />
              </div>

              <div className="sm:col-span-2 flex gap-2 pt-1">
                <button className="btn btn-primary" disabled={saveMut.isPending}>
                  {saveMut.isPending ? t('common.saving') : t('common.save')}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quotation table */}
      <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-3">{t('quotations.cols.number')}</th>
                <th className="p-3">{t('quotations.cols.supplier')}</th>
                <th className="p-3">{t('quotations.cols.amount')}</th>
                <th className="p-3">{t('quotations.cols.advance')}</th>
                <th className="p-3">{t('quotations.cols.status')}</th>
                <th className="p-3">{t('quotations.cols.request')}</th>
                <th className="p-3">{t('quotations.cols.budget')}</th>
                <th className="p-3">{t('quotations.form.followUpDate', 'پیگیری')}</th>
                <th className="p-3">{t('quotations.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((q) => (
                <tr key={q.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{q.quotationNumber ?? '—'}</td>
                  <td className="p-3">{q.supplier?.name ?? '—'}</td>
                  <td className="p-3">{faMoney(q.amount)}</td>
                  <td className="p-3">{Number(q.advancePaymentAmount) ? faMoney(q.advancePaymentAmount) : '—'}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[q.status] ?? 'bg-slate-100 text-slate-600'}`}>{q.status}</span>
                  </td>
                  <td className="p-3 font-semibold text-blue-700">{q.request?.requestNumber ?? '—'}</td>
                  <td className="p-3">{q.budget ? (q.budget.name || `${JMONTHS[q.budget.monthJalali]} ${q.budget.yearJalali}`) : '—'}</td>
                  <td className={`p-3 text-xs ${q.followUpDate && new Date(q.followUpDate) < new Date() ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>{faDate(q.followUpDate)}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {!archived && can('quotations.edit') && (
                        <button className="btn btn-outline px-2 py-1" title={t('common.edit')} onClick={() => openEdit(q)}>✏</button>
                      )}
                      {!archived && can('invoices.create') && (
                        <button className="btn btn-outline px-2 py-1" title={t('quotations.convertToInvoice')} onClick={() => { setConvErr(''); setConvert(emptyConvert(q)); }}>🔁</button>
                      )}
                      {!archived && can('quotations.archive') && (
                        <button className="btn btn-outline px-2 py-1 text-amber-600" title={t('common.archive')} onClick={() => { if (confirm(t('quotations.confirmArchive'))) archiveMut.mutate(q.id); }}>🗄</button>
                      )}
                      {!archived && can('quotations.delete') && (
                        <button className="btn btn-outline px-2 py-1 text-rose-600" title={t('common.delete')} onClick={() => { if (confirm(t('common.delete') + '؟')) delMut.mutate(q.id); }}>🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">{t('quotations.empty')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Convert to invoice modal */}
      {convert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConvert(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-bold">{t('quotations.convertToInvoice')}</h2>
            <p className="mb-3 text-xs text-slate-500">{t('quotations.cols.number')} {convert.q.quotationNumber ?? '—'} — {convert.q.supplier?.name}</p>
            {convErr && <div className="mb-2 text-sm text-rose-600">{convErr}</div>}

            {/* 1) General */}
            <div className="rounded-lg border border-slate-200 p-3 mb-3">
              <div className="mb-2 text-xs font-bold text-slate-700">۱) اطلاعات عمومی</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.invoiceNumber')}</span>
                  <input className="input" dir="ltr" value={convert.invoiceNumber} onChange={(e) => setConvert({ ...convert, invoiceNumber: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">تاریخ فاکتور</span>
                  <JDatePicker className="input" value={convert.invoiceDate} onChange={(v) => setConvert({ ...convert, invoiceDate: v })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.dueDate')}</span>
                  <JDatePicker className="input" value={convert.dueDate} onChange={(v) => setConvert({ ...convert, dueDate: v })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.budgetId')}</span>
                  <SearchableSelect
                    value={convert.budgetId}
                    onChange={(v) => setConvert({ ...convert, budgetId: v })}
                    placeholder="—"
                    options={[{ value: '', label: '—' }, ...budgetOpts.map((b) => ({ value: b.id, label: b.label }))]}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">مبلغ خالص</span>
                  <input className="input" type="number" value={convert.netAmount} onChange={(e) => setConvert({ ...convert, netAmount: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">مالیات (VAT)</span>
                  <input className="input" type="number" value={convert.vatAmount} onChange={(e) => setConvert({ ...convert, vatAmount: e.target.value })} />
                </label>
              </div>
              <div className="mt-2 text-xs text-slate-600">جمع کل: <b className="text-slate-800">{faMoney(convGrandTotal)}</b></div>
            </div>

            {/* 2) Accounting */}
            <div className="rounded-lg border border-slate-200 p-3 mb-3">
              <div className="mb-2 text-xs font-bold text-slate-700">۲) اطلاعات حسابداری</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">ارسال به حسابداری</span>
                  <select className="input" value={convert.sentToAccounting ? 'yes' : ''} onChange={(e) => setConvert({ ...convert, sentToAccounting: e.target.value === 'yes' })}>
                    <option value="">خیر</option>
                    <option value="yes">بله</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">تاریخ ارسال</span>
                  <JDatePicker className="input" value={convert.accountingSubmissionDate} onChange={(v) => setConvert({ ...convert, accountingSubmissionDate: v })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">رفرنس حسابداری</span>
                  <input className="input" dir="ltr" value={convert.accountingReference} onChange={(e) => setConvert({ ...convert, accountingReference: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-600">دسته پرداخت (APAY)</span>
                  <input className="input" dir="ltr" value={convert.batch} onChange={(e) => setConvert({ ...convert, batch: e.target.value })} />
                </label>
              </div>
            </div>

            {/* 3) Follow-up & installments */}
            <div className="rounded-lg border border-slate-200 p-3 mb-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">۳) پیگیری و اقساط</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setConvert({ ...convert, installments: [...convert.installments, { amount: '', monthKey: '', dueDate: '' }] })}>＋ قسط</button>
              </div>
              <label className="block mb-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">تاریخ پیگیری</span>
                <JDatePicker className="input" value={convert.followUpDate} onChange={(v) => setConvert({ ...convert, followUpDate: v })} />
              </label>
              {convert.installments.map((inst, idx) => (
                <div key={idx} className="mb-2 flex items-end gap-2">
                  <label className="block flex-1">
                    <span className="mb-1 block text-[10px] text-slate-500">مبلغ</span>
                    <input className="input" type="number" value={inst.amount} onChange={(e) => setConvert({ ...convert, installments: convert.installments.map((r, i) => i === idx ? { ...r, amount: e.target.value } : r) })} />
                  </label>
                  <label className="block w-32">
                    <span className="mb-1 block text-[10px] text-slate-500">ماه (1404/01)</span>
                    <input className="input" dir="ltr" value={inst.monthKey} onChange={(e) => setConvert({ ...convert, installments: convert.installments.map((r, i) => i === idx ? { ...r, monthKey: e.target.value } : r) })} />
                  </label>
                  <label className="block w-36">
                    <span className="mb-1 block text-[10px] text-slate-500">سررسید</span>
                    <JDatePicker className="input" value={inst.dueDate} onChange={(v) => setConvert({ ...convert, installments: convert.installments.map((r, i) => i === idx ? { ...r, dueDate: v } : r) })} />
                  </label>
                  <button type="button" className="btn btn-outline px-2 py-1 text-rose-600" onClick={() => setConvert({ ...convert, installments: convert.installments.filter((_, i) => i !== idx) })}>🗑</button>
                </div>
              ))}
              {convert.installments.length > 0 && Math.abs(convInstTotal - convGrandTotal) > 1 && (
                <div className="text-xs text-rose-600">⚠️ مجموع اقساط ({faMoney(convInstTotal)}) با جمع فاکتور ({faMoney(convGrandTotal)}) برابر نیست.</div>
              )}
            </div>

            <label className="block mb-3">
              <span className="mb-1 block text-xs font-bold text-slate-600">یادداشت</span>
              <textarea className="input min-h-[50px]" value={convert.notes} onChange={(e) => setConvert({ ...convert, notes: e.target.value })} />
            </label>

            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 mb-3">📎 فایل‌های پیوست پیش‌فاکتور به‌صورت خودکار به فاکتور جدید منتقل می‌شوند.</div>

            <div className="mt-2 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setConvert(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" disabled={!convert.invoiceNumber || !convert.dueDate || convertMut.isPending} onClick={() => convertMut.mutate()}>{t('quotations.convertToInvoice')}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

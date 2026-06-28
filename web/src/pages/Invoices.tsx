import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate, JMONTHS } from '../lib/format';
import { Pagination } from '../components/Pagination';
import { JDatePicker } from '../components/JDatePicker';

interface Invoice {
  id: string; invoiceNumber: string; status: string; totalAmount: string; dueDate: string | null;
  paidAmount: number; remainingAmount: number; batch: string | null;
  supplier: { name: string } | null; budget: { name: string | null } | null; request: { requestNumber: string } | null;
}
interface InvoiceDetail extends Invoice {
  netAmount: string; vatAmount: string;
  invoiceDate: string | null; followUpDate: string | null;
  sentToAccounting: boolean; accountingReference: string | null;
  accountingNotes: string | null; accountingSubmissionDate: string | null;
  notes: string | null;
  installments: { id: string; amount: string; percent: string | null; monthKey: string | null; dueDate: string | null; status: string }[];
  payments: { id: string; amount: string; paymentDate: string | null; paymentListNumber: string | null; notes: string | null }[];
  quotation: { quotationNumber: string } | null;
}
interface DocRef {
  id: string;
  originalFilename: string | null;
  filename: string;
  mimeType: string | null;
  size: number;
  category: string | null;
}

interface Counts { all: number; unb: number; wait: number; paid: number; }
interface InvoicesResponse { invoices: Invoice[]; counts: Counts; total: number; page: number; totalPages: number; }

const CATS: { k: string; label: string }[] = [
  { k: 'all', label: 'همه' }, { k: 'unb', label: 'بدون بودجه' },
  { k: 'wait', label: 'انتظار پرداخت' }, { k: 'paid', label: 'پرداخت شده' },
];

const emptyAcct = {
  batch: '', accountingReference: '', accountingNotes: '', sentToAccounting: false,
  accountingSubmissionDate: '', followUpDate: '', notes: '', dueDate: '',
};

export function Invoices({ paidOnly = false }: { paidOnly?: boolean }) {
  const { t } = useTranslation();
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();

  const [cat, setCat] = useState(paidOnly ? 'paid' : 'all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ invoiceNumber: '', supplierId: '', budgetId: '', requestId: '', dueDate: '', netAmount: '', vatAmount: '0' });
  const [pay, setPay] = useState<{ inv: Invoice; amount: string; date: string; listNumber: string } | null>(null);
  const [payErr, setPayErr] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [acctEdit, setAcctEdit] = useState<{ id: string; form: typeof emptyAcct } | null>(null);
  const [acctErr, setAcctErr] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkErr, setBulkErr] = useState('');
  const [instEditMode, setInstEditMode] = useState(false);
  const [instDraft, setInstDraft] = useState<{ id?: string; amount: string; monthKey: string; dueDate: string; status: string }[]>([]);
  const [instErr, setInstErr] = useState('');

  useEffect(() => { setPage(1); }, [search, cat]);
  useEffect(() => { setSelected(new Set()); }, [cat, search, page]);
  useEffect(() => { setInstEditMode(false); setInstErr(''); }, [detailId]);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', tid, cat, search, page],
    queryFn: async () => (await api.get(`/${tid}/invoices`, {
      params: { category: cat === 'all' ? undefined : cat, search: search || undefined, page, limit: 50 },
    })).data as InvoicesResponse,
    enabled: Boolean(tid),
  });

  const detailQ = useQuery({
    queryKey: ['invoice-detail', tid, detailId],
    queryFn: async () => (await api.get(`/${tid}/invoices/${detailId}`)).data.invoice as InvoiceDetail,
    enabled: Boolean(detailId && tid),
  });

  const docsQ = useQuery({
    queryKey: ['invoice-docs', tid, detailId],
    queryFn: async () => (await api.get(`/${tid}/documents`, {
      params: { entityType: 'invoice', entityId: detailId },
    })).data as { documents: DocRef[]; total: number },
    enabled: Boolean(detailId && tid),
  });

  const suppliersQ = useQuery({ queryKey: ['suppliers-opt', tid], queryFn: async () => (await api.get(`/${tid}/suppliers`)).data.suppliers as { id: string; name: string }[], enabled: Boolean(tid) });
  const budgetsQ = useQuery({ queryKey: ['budgets-opt', tid], queryFn: async () => (await api.get(`/${tid}/budgets`)).data.budgets as { id: string; name: string | null; monthJalali: number; yearJalali: number }[], enabled: Boolean(tid) });
  const requestsQ = useQuery({ queryKey: ['requests-opt', tid], queryFn: async () => (await api.get(`/${tid}/requests`)).data.requests as { id: string; requestNumber: string; description: string | null }[], enabled: Boolean(tid) });

  const saveMut = useMutation({
    mutationFn: async () => api.post(`/${tid}/invoices`, {
      invoiceNumber: form.invoiceNumber, supplierId: form.supplierId || undefined,
      budgetId: form.budgetId || undefined, requestId: form.requestId || undefined,
      dueDate: form.dueDate, netAmount: Number(form.netAmount || 0), vatAmount: Number(form.vatAmount || 0),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices', tid] }); qc.invalidateQueries({ queryKey: ['budgets', tid] }); setOpen(false); setForm({ invoiceNumber: '', supplierId: '', budgetId: '', requestId: '', dueDate: '', netAmount: '', vatAmount: '0' }); },
    onError: (e) => setErr(apiError(e)),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/invoices/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices', tid] }); qc.invalidateQueries({ queryKey: ['budgets', tid] }); },
  });

  const payMut = useMutation({
    mutationFn: async () => api.post(`/${tid}/payments`, { invoiceId: pay!.inv.id, amount: Number(pay!.amount || 0), paymentDate: pay!.date || undefined, paymentListNumber: pay!.listNumber || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices', tid] }); qc.invalidateQueries({ queryKey: ['budgets', tid] }); qc.invalidateQueries({ queryKey: ['payments', tid] }); setPay(null); },
    onError: (e) => setPayErr(apiError(e)),
  });

  const acctMut = useMutation({
    mutationFn: async () => {
      if (!acctEdit) return;
      const f = acctEdit.form;
      await api.patch(`/${tid}/invoices/${acctEdit.id}`, {
        batch: f.batch || null, accountingReference: f.accountingReference || null,
        accountingNotes: f.accountingNotes || null, sentToAccounting: f.sentToAccounting,
        accountingSubmissionDate: f.accountingSubmissionDate || null,
        followUpDate: f.followUpDate || null, notes: f.notes || null,
        dueDate: f.dueDate || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices', tid] });
      qc.invalidateQueries({ queryKey: ['invoice-detail', tid, acctEdit?.id] });
      setAcctEdit(null);
    },
    onError: (e) => setAcctErr(apiError(e)),
  });

  const bulkMut = useMutation({
    mutationFn: async (sentToAccounting: boolean) =>
      api.post(`/${tid}/invoices/bulk-accounting`, { ids: Array.from(selected), sentToAccounting }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices', tid] });
      setSelected(new Set());
      setBulkErr('');
    },
    onError: (e) => setBulkErr(apiError(e)),
  });

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  function openAcctEdit(inv: InvoiceDetail) {
    setAcctErr('');
    setAcctEdit({
      id: inv.id,
      form: {
        batch: inv.batch ?? '',
        accountingReference: inv.accountingReference ?? '',
        accountingNotes: inv.accountingNotes ?? '',
        sentToAccounting: inv.sentToAccounting,
        accountingSubmissionDate: inv.accountingSubmissionDate ? inv.accountingSubmissionDate.slice(0, 10) : '',
        followUpDate: inv.followUpDate ? inv.followUpDate.slice(0, 10) : '',
        notes: inv.notes ?? '',
        dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
      },
    });
  }

  function printInvoice(d: InvoiceDetail) {
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    const fmt = (v: string | number) => Number(v).toLocaleString('fa-IR');
    const rows = d.installments.length > 0
      ? d.installments.map((i) => `<tr><td>${fmt(i.amount)}</td><td>${i.monthKey ?? '—'}</td><td>${i.dueDate ? i.dueDate.slice(0, 10) : '—'}</td><td>${i.status}</td></tr>`).join('')
      : '';
    const payRows = d.payments.map((p) => `<tr><td>${fmt(p.amount)}</td><td>${p.paymentDate ? p.paymentDate.slice(0, 10) : '—'}</td><td>${p.paymentListNumber ?? '—'}</td></tr>`).join('');
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="UTF-8"><title>فاکتور ${d.invoiceNumber}</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;margin:30px;color:#111;direction:rtl}
      h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:16px 0;font-size:13px}
      .meta span{color:#555}.meta b{color:#111}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
      th,td{border:1px solid #ddd;padding:6px 10px;text-align:right}
      th{background:#f5f5f5;font-weight:bold}
      .total{font-size:16px;font-weight:bold;text-align:left;margin-top:12px}
      .green{color:#16a34a}.red{color:#dc2626}
      @media print{button{display:none!important}}
    </style></head><body>
    <h1>فاکتور شماره ${d.invoiceNumber}</h1>
    <div class="meta">
      <div><span>تأمین‌کننده: </span><b>${d.supplier?.name ?? '—'}</b></div>
      <div><span>وضعیت: </span><b>${d.status}</b></div>
      <div><span>سررسید: </span><b>${d.dueDate ? d.dueDate.slice(0, 10) : '—'}</b></div>
      <div><span>تاریخ فاکتور: </span><b>${d.invoiceDate ? d.invoiceDate.slice(0, 10) : '—'}</b></div>
      ${d.request ? `<div><span>درخواست: </span><b>${d.request.requestNumber}</b></div>` : ''}
      ${d.budget ? `<div><span>بودجه: </span><b>${d.budget.name ?? '—'}</b></div>` : ''}
      ${d.batch ? `<div><span>بچ: </span><b>${d.batch}</b></div>` : ''}
      ${d.accountingReference ? `<div><span>مرجع حسابداری: </span><b>${d.accountingReference}</b></div>` : ''}
    </div>
    <div class="total">
      <span>مجموع: </span>${fmt(d.totalAmount)} ریال |
      <span class="green"> پرداخت شده: ${fmt(d.paidAmount)}</span> |
      <span class="${d.remainingAmount > 0 ? 'red' : 'green'}"> مانده: ${fmt(d.remainingAmount)}</span>
    </div>
    ${rows ? `<h3 style="margin-top:20px">اقساط</h3><table><thead><tr><th>مبلغ</th><th>ماه</th><th>سررسید</th><th>وضعیت</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    ${payRows ? `<h3 style="margin-top:20px">پرداخت‌ها</h3><table><thead><tr><th>مبلغ</th><th>تاریخ</th><th>شماره لیست</th></tr></thead><tbody>${payRows}</tbody></table>` : ''}
    ${d.notes ? `<p style="margin-top:16px;font-size:12px;color:#555"><b>یادداشت:</b> ${d.notes}</p>` : ''}
    <p style="text-align:left;margin-top:30px;font-size:11px;color:#999">تاریخ چاپ: ${new Date().toLocaleDateString('fa-IR')}</p>
    <button onclick="window.print()" style="margin-top:16px;padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 چاپ</button>
    </body></html>`);
    win.document.close();
  }

  async function exportCsv() {
    const res = await api.get(`/${tid}/invoices`, {
      params: { category: cat === 'all' ? undefined : cat, search: search || undefined, format: 'csv' },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${tid}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const instSaveMut = useMutation({
    mutationFn: async () =>
      api.patch(`/${tid}/invoices/${detailId}`, {
        installments: instDraft.map((r) => ({
          amount: Number(r.amount || 0),
          monthKey: r.monthKey || null,
          dueDate: r.dueDate || null,
          status: r.status,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-detail', tid, detailId] });
      qc.invalidateQueries({ queryKey: ['invoices', tid] });
      setInstEditMode(false);
      setInstErr('');
    },
    onError: (e) => setInstErr(apiError(e)),
  });

  function startInstEdit(installments: InvoiceDetail['installments']) {
    setInstDraft(
      installments.map((i) => ({
        id: i.id,
        amount: String(Number(i.amount)),
        monthKey: i.monthKey ?? '',
        dueDate: i.dueDate ? i.dueDate.slice(0, 10) : '',
        status: i.status,
      }))
    );
    setInstEditMode(true);
    setInstErr('');
  }

  function docIcon(mime: string | null): string {
    if (!mime) return '📄';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime === 'application/pdf') return '📕';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('sheet') || mime.includes('excel')) return '📊';
    return '📄';
  }

  async function downloadDoc(docId: string, filename: string) {
    const res = await api.get(`/${tid}/documents/${docId}/file`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function submit(e: FormEvent) { e.preventDefault(); setErr(''); saveMut.mutate(); }
  const counts = data?.counts;

  return (
    <Layout title={paidOnly ? t('invoices.paidTitle') : t('invoices.title')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input className="input max-w-xs" placeholder={t('invoices.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn btn-outline text-xs" onClick={exportCsv} title={t('invoices.exportCsv')}>{t('invoices.exportCsv')}</button>
          {!paidOnly && can('invoices.create') && <button className="btn btn-primary" onClick={() => { setErr(''); setOpen((v) => !v); }}>{t('invoices.addNew')}</button>}
        </div>
      </div>

      {!paidOnly && (
        <div className="mb-3 flex flex-wrap gap-2">
          {CATS.map((c) => (
            <button key={c.k} onClick={() => setCat(c.k)} className={`btn ${cat === c.k ? 'btn-primary' : 'btn-outline'}`}>
              {c.label}{counts ? ` (${(counts as unknown as Record<string, number>)[c.k]})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Create form */}
      {open && !paidOnly && (
        <form onSubmit={submit} className="card mb-4 grid gap-3 sm:grid-cols-3">
          {err && <div className="sm:col-span-3 text-sm text-rose-600">{err}</div>}
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.invoiceNumber')}</span><input className="input" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} required /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.supplierId')}</span>
            <select className="input" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required>
              <option value="">{t('common.select', 'انتخاب...')}</option>
              {(suppliersQ.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('requests.cols.number')}</span>
            <select className="input" value={form.requestId} onChange={(e) => setForm({ ...form, requestId: e.target.value })}>
              <option value="">—</option>
              {(requestsQ.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.requestNumber}{r.description ? ` — ${r.description}` : ''}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.budgetId')}</span>
            <select className="input" value={form.budgetId} onChange={(e) => setForm({ ...form, budgetId: e.target.value })}>
              <option value="">—</option>
              {(budgetsQ.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name || `${JMONTHS[b.monthJalali]} ${b.yearJalali}`}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.dueDate')}</span><JDatePicker className="input" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.totalAmount')}</span><input className="input" type="number" value={form.netAmount} onChange={(e) => setForm({ ...form, netAmount: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.form.vat', 'مالیات')}</span><input className="input" type="number" value={form.vatAmount} onChange={(e) => setForm({ ...form, vatAmount: e.target.value })} /></label>
          <div className="flex items-end gap-2"><button className="btn btn-primary" disabled={saveMut.isPending}>{t('common.save')}</button><button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>{t('common.cancel')}</button></div>
        </form>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
          <span className="text-xs font-bold text-blue-700">{selected.size} {t('invoices.bulk.selected')}</span>
          {bulkErr && <span className="text-xs text-rose-600">{bulkErr}</span>}
          <button
            className="btn btn-primary text-xs px-3 py-1.5"
            disabled={bulkMut.isPending}
            onClick={() => bulkMut.mutate(true)}
          >{t('invoices.bulk.send')}</button>
          <button
            className="btn btn-outline text-xs px-3 py-1.5"
            disabled={bulkMut.isPending}
            onClick={() => bulkMut.mutate(false)}
          >{t('invoices.bulk.recall')}</button>
          <button className="btn btn-outline text-xs px-2 py-1.5" onClick={() => setSelected(new Set())}>✕ {t('common.cancel')}</button>
        </div>
      )}

      {/* Invoice table */}
      <div className="card overflow-x-auto p-0">
        {isLoading ? <div className="p-8 text-center text-slate-400">{t('common.loading')}</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={(data?.invoices ?? []).length > 0 && (data?.invoices ?? []).every((i) => selected.has(i.id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set((data?.invoices ?? []).map((i) => i.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th className="p-3">{t('invoices.cols.number')}</th>
                <th className="p-3">{t('requests.cols.number')}</th>
                <th className="p-3">{t('invoices.cols.supplier')}</th>
                <th className="p-3">{t('invoices.cols.amount')}</th><th className="p-3">{t('invoices.cols.paid')}</th><th className="p-3">{t('invoices.cols.remaining')}</th>
                <th className="p-3">{t('invoices.cols.status')}</th><th className="p-3">{t('invoices.cols.dueDate')}</th><th className="p-3">{t('invoices.cols.budget')}</th>
                <th className="p-3">{t('invoices.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.invoices ?? []).map((i) => (
                <tr key={i.id} className={`border-t border-slate-100 hover:bg-slate-50 ${selected.has(i.id) ? 'bg-blue-50' : ''}`}>
                  <td className="p-3"><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)} /></td>
                  <td className="p-3 font-bold">{i.invoiceNumber}</td>
                  <td className="p-3 font-semibold text-blue-700">{i.request?.requestNumber ?? '—'}</td>
                  <td className="p-3">{i.supplier?.name ?? '—'}</td>
                  <td className="p-3">{faMoney(i.totalAmount)}</td>
                  <td className="p-3 text-green-700">{faMoney(i.paidAmount)}</td>
                  <td className={`p-3 font-bold ${i.remainingAmount > 0 ? 'text-rose-600' : 'text-green-700'}`}>{faMoney(i.remainingAmount)}</td>
                  <td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{i.status}</span></td>
                  <td className="p-3">{faDate(i.dueDate)}</td>
                  <td className="p-3">{i.budget ? (i.budget.name || '✓') : <span className="text-rose-500 text-xs">{t('budgets.noBudget', 'بدون بودجه')}</span>}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline px-2 py-1 text-xs"
                        title={t('common.view')}
                        onClick={() => setDetailId(detailId === i.id ? null : i.id)}
                      >🔍</button>
                      {!paidOnly && i.remainingAmount > 0 && (can('payments.register_payment') || can('payments.create')) && (
                        <button className="btn btn-outline px-2 py-1" title={t('dashboard.quickPay.submit')} onClick={() => { setPayErr(''); setPay({ inv: i, amount: String(i.remainingAmount), date: '', listNumber: '' }); }}>💳</button>
                      )}
                      {!paidOnly && can('invoices.delete') && (
                        <button className="btn btn-outline px-2 py-1 text-rose-600" onClick={() => { if (confirm(t('common.delete') + '؟')) delMut.mutate(i.id); }}>🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.invoices ?? []).length === 0 && (
                <tr><td colSpan={11} className="p-8 text-center text-slate-400">{t('invoices.empty')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data && (
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPageChange={setPage} label={t('invoices.cols.number')} />
      )}

      {/* ── Invoice detail modal ── */}
      {detailId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12 overflow-y-auto" onClick={() => setDetailId(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {detailQ.isLoading ? (
              <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
            ) : detailQ.data ? (() => {
              const d = detailQ.data;
              return (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="font-bold text-slate-800">{d.invoiceNumber}</h2>
                      <p className="text-xs text-slate-500">{d.supplier?.name ?? '—'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-outline text-xs px-3 py-1.5" onClick={() => printInvoice(d)} title={t('invoices.detail.printInvoice')}>
                        {t('invoices.detail.printInvoice')}
                      </button>
                      {can('invoices.edit') && (
                        <button className="btn btn-outline text-xs px-3 py-1.5" onClick={() => openAcctEdit(d)}>
                          {t('invoices.detail.editAccounting')}
                        </button>
                      )}
                      <button className="btn btn-outline px-2 py-1.5" onClick={() => setDetailId(null)}>✕</button>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Summary row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: t('invoices.detail.totalAmount'), value: faMoney(d.totalAmount), cls: 'text-slate-800' },
                        { label: t('invoices.detail.paid'), value: faMoney(d.paidAmount), cls: 'text-emerald-600' },
                        { label: t('invoices.detail.remaining'), value: faMoney(d.remainingAmount), cls: d.remainingAmount > 0 ? 'text-rose-600' : 'text-emerald-600' },
                        { label: t('invoices.detail.status'), value: d.status, cls: 'text-slate-600' },
                      ].map(({ label, value, cls }) => (
                        <div key={label} className="rounded-lg bg-slate-50 p-3">
                          <div className="text-[10px] text-slate-400">{label}</div>
                          <div className={`text-sm font-bold mt-0.5 ${cls}`}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                      {[
                        [t('invoices.detail.dueDate'), faDate(d.dueDate)],
                        [t('invoices.detail.invoiceDate'), faDate(d.invoiceDate)],
                        [t('invoices.accounting.followUpDate'), faDate(d.followUpDate)],
                        [t('invoices.cols.request'), d.request?.requestNumber ?? '—'],
                        [t('quotations.title'), d.quotation?.quotationNumber ?? '—'],
                        [t('invoices.detail.batchNumber'), d.batch ?? '—'],
                        [t('invoices.detail.accountingRef'), d.accountingReference ?? '—'],
                        [t('invoices.detail.submissionDate'), faDate(d.accountingSubmissionDate)],
                        [t('invoices.detail.sentToAccounting'), d.sentToAccounting ? '✅ ' + t('common.yes') : '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-slate-50 py-1">
                          <span className="text-slate-400">{k}</span>
                          <span className="font-medium text-slate-700">{v}</span>
                        </div>
                      ))}
                    </div>

                    {d.notes && (
                      <div className="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-slate-700">
                        <span className="font-bold text-slate-500">{t('invoices.detail.notes')}: </span>{d.notes}
                      </div>
                    )}
                    {d.accountingNotes && (
                      <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-slate-700">
                        <span className="font-bold text-slate-500">{t('invoices.detail.accountingNotes')}: </span>{d.accountingNotes}
                      </div>
                    )}

                    {/* Installments */}
                    {(d.installments.length > 0 || can('invoices.edit')) && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-bold text-slate-600">
                            {t('invoices.detail.installmentsTitle')} ({instEditMode ? instDraft.length : d.installments.length})
                          </h3>
                          {can('invoices.edit') && !instEditMode && (
                            <button
                              className="btn btn-outline px-2 py-1 text-xs"
                              onClick={() => startInstEdit(d.installments)}
                            >{t('invoices.installments.editBtn')}</button>
                          )}
                        </div>

                        {instEditMode ? (
                          <div className="space-y-2">
                            {instDraft.map((row, idx) => (
                              <div key={idx} className="flex flex-wrap gap-2 items-center rounded-lg bg-blue-50 p-2">
                                <input
                                  className="input text-xs w-28" type="number" placeholder={t('invoices.installments.amount')}
                                  value={row.amount}
                                  onChange={(e) => setInstDraft((prev) => prev.map((r, i) => i === idx ? { ...r, amount: e.target.value } : r))}
                                />
                                <input
                                  className="input text-xs w-24" placeholder="ماه (مثلاً 1404/01)"
                                  value={row.monthKey}
                                  onChange={(e) => setInstDraft((prev) => prev.map((r, i) => i === idx ? { ...r, monthKey: e.target.value } : r))}
                                />
                                <JDatePicker
                                  className="input text-xs"
                                  value={row.dueDate}
                                  onChange={(v) => setInstDraft((prev) => prev.map((r, i) => i === idx ? { ...r, dueDate: v } : r))}
                                />
                                <select
                                  className="input text-xs w-28"
                                  value={row.status}
                                  onChange={(e) => setInstDraft((prev) => prev.map((r, i) => i === idx ? { ...r, status: e.target.value } : r))}
                                >
                                  <option value="در انتظار">در انتظار</option>
                                  <option value="پرداخت شده">پرداخت شده</option>
                                </select>
                                <button
                                  className="text-rose-500 hover:text-rose-700 px-1"
                                  onClick={() => setInstDraft((prev) => prev.filter((_, i) => i !== idx))}
                                  title={t('common.delete')}
                                >🗑</button>
                              </div>
                            ))}

                            <button
                              className="btn btn-outline text-xs px-2 py-1"
                              onClick={() => setInstDraft((prev) => [...prev, { amount: '', monthKey: '', dueDate: '', status: 'در انتظار' }])}
                            >{t('invoices.installments.addRow')}</button>

                            {instErr && <div className="text-xs text-rose-600 mt-1">{instErr}</div>}

                            <div className="flex gap-2 pt-1">
                              <button
                                className="btn btn-primary text-xs px-3 py-1.5"
                                disabled={instSaveMut.isPending}
                                onClick={() => instSaveMut.mutate()}
                              >{instSaveMut.isPending ? t('common.submitting') : t('invoices.installments.save')}</button>
                              <button
                                className="btn btn-outline text-xs px-3 py-1.5"
                                onClick={() => { setInstEditMode(false); setInstErr(''); }}
                              >{t('invoices.installments.cancel')}</button>
                            </div>
                          </div>
                        ) : d.installments.length > 0 ? (
                          <div className="overflow-x-auto rounded-lg border border-slate-100">
                            <table className="w-full text-xs">
                              <thead><tr className="bg-slate-50 text-slate-500"><th className="p-2">{t('invoices.installments.amount')}</th><th className="p-2">{t('invoices.installments.month')}</th><th className="p-2">{t('invoices.installments.dueDate')}</th><th className="p-2">{t('invoices.installments.status')}</th></tr></thead>
                              <tbody>
                                {d.installments.map((inst) => (
                                  <tr key={inst.id} className="border-t border-slate-50">
                                    <td className="p-2 font-medium">{faMoney(inst.amount)}</td>
                                    <td className="p-2">{inst.monthKey ?? '—'}</td>
                                    <td className="p-2">{faDate(inst.dueDate)}</td>
                                    <td className="p-2">
                                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${inst.status === 'پرداخت شده' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {inst.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 py-1">{t('invoices.detail.noInstallments')}</div>
                        )}
                      </div>
                    )}

                    {/* Payment history */}
                    {d.payments.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-slate-600 mb-2">{t('invoices.detail.paymentsTitle')} ({d.payments.length})</h3>
                        <div className="overflow-x-auto rounded-lg border border-slate-100">
                          <table className="w-full text-xs">
                            <thead><tr className="bg-slate-50 text-slate-500"><th className="p-2">{t('common.amount')}</th><th className="p-2">{t('common.date')}</th><th className="p-2">{t('payments.cols.listNumber')}</th><th className="p-2">{t('common.notes')}</th></tr></thead>
                            <tbody>
                              {d.payments.map((p) => (
                                <tr key={p.id} className="border-t border-slate-50">
                                  <td className="p-2 font-medium text-emerald-700">{faMoney(p.amount)}</td>
                                  <td className="p-2">{faDate(p.paymentDate)}</td>
                                  <td className="p-2">{p.paymentListNumber ?? '—'}</td>
                                  <td className="p-2 text-slate-400">{p.notes ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {d.installments.length === 0 && d.payments.length === 0 && (
                      <div className="text-center text-xs text-slate-400 py-4">{t('invoices.detail.noPayments')}</div>
                    )}

                    {/* Linked documents */}
                    {can('document_center.view_document') && (
                      <div>
                        <h3 className="text-xs font-bold text-slate-600 mb-2">
                          {t('invoices.detail.docsTitle')} {docsQ.data ? `(${docsQ.data.total})` : ''}
                        </h3>
                        {docsQ.isLoading ? (
                          <div className="text-xs text-slate-400">{t('common.loading')}</div>
                        ) : (docsQ.data?.documents ?? []).length === 0 ? (
                          <div className="text-xs text-slate-400">{t('invoices.detail.noDocs')}</div>
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
                                  onClick={() => downloadDoc(doc.id, doc.originalFilename ?? doc.filename)}
                                >⬇️</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              );
            })() : null}
          </div>
        </div>
      )}

      {/* ── Accounting edit modal ── */}
      {acctEdit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="mb-4 text-sm font-bold text-slate-800">{t('invoices.accounting.title')}</h2>
            {acctErr && <div className="mb-3 text-sm text-rose-600">{acctErr}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.accounting.batchNumber')}</span>
                <input className="input" dir="ltr" value={acctEdit.form.batch} onChange={(e) => setAcctEdit({ ...acctEdit, form: { ...acctEdit.form, batch: e.target.value } })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.accounting.accountingRef')}</span>
                <input className="input" dir="ltr" value={acctEdit.form.accountingReference} onChange={(e) => setAcctEdit({ ...acctEdit, form: { ...acctEdit.form, accountingReference: e.target.value } })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.accounting.dueDate')}</span>
                <JDatePicker className="input" value={acctEdit.form.dueDate} onChange={(v) => setAcctEdit({ ...acctEdit, form: { ...acctEdit.form, dueDate: v } })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.accounting.followUpDate')}</span>
                <JDatePicker className="input" value={acctEdit.form.followUpDate} onChange={(v) => setAcctEdit({ ...acctEdit, form: { ...acctEdit.form, followUpDate: v } })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.accounting.submissionDate')}</span>
                <JDatePicker className="input" value={acctEdit.form.accountingSubmissionDate} onChange={(v) => setAcctEdit({ ...acctEdit, form: { ...acctEdit.form, accountingSubmissionDate: v } })} />
              </label>
              <label className="flex items-center gap-2 pt-5">
                <input type="checkbox" checked={acctEdit.form.sentToAccounting} onChange={(e) => setAcctEdit({ ...acctEdit, form: { ...acctEdit.form, sentToAccounting: e.target.checked } })} />
                <span className="text-xs font-bold text-slate-600">{t('invoices.accounting.sentToAccounting')}</span>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.accounting.accountingNotes')}</span>
                <textarea className="input min-h-[60px]" value={acctEdit.form.accountingNotes} onChange={(e) => setAcctEdit({ ...acctEdit, form: { ...acctEdit.form, accountingNotes: e.target.value } })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('invoices.accounting.notes')}</span>
                <textarea className="input min-h-[60px]" value={acctEdit.form.notes} onChange={(e) => setAcctEdit({ ...acctEdit, form: { ...acctEdit.form, notes: e.target.value } })} />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-primary" disabled={acctMut.isPending} onClick={() => acctMut.mutate()}>
                {acctMut.isPending ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-outline" onClick={() => setAcctEdit(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick pay modal ── */}
      {pay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPay(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-bold">{t('dashboard.quickPay.title')}</h2>
            <p className="mb-3 text-xs text-slate-500">{t('dashboard.quickPay.invoice')} {pay.inv.invoiceNumber} — {t('dashboard.quickPay.remaining')} {faMoney(pay.inv.remainingAmount)}</p>
            {payErr && <div className="mb-2 text-sm text-rose-600">{payErr}</div>}
            <div className="grid gap-3">
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('dashboard.quickPay.amountLabel')}</span><input className="input" type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('dashboard.quickPay.payDateLabel')}</span><JDatePicker className="input" value={pay.date} onChange={(v) => setPay({ ...pay, date: v })} /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('dashboard.quickPay.listNumberLabel')}</span><input className="input" value={pay.listNumber} onChange={(e) => setPay({ ...pay, listNumber: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setPay(null)}>{t('dashboard.quickPay.cancel')}</button>
              <button className="btn btn-primary" disabled={!Number(pay.amount) || payMut.isPending} onClick={() => payMut.mutate()}>{t('dashboard.quickPay.submit')}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

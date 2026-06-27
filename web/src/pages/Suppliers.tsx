import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate } from '../lib/format';

interface SupplierContact { id: string; fullName: string; role: string | null; phone: string | null; email: string | null; notes: string | null; isPrimary: boolean; }
interface SupplierInteraction { id: string; type: string; subject: string | null; body: string | null; interactionDate: string | null; followUpDate: string | null; createdAt: string; }
interface BlanketOrder { id: string; orderNumber: string | null; description: string; totalValue: number; usedValue: number; currency: string; startDate: string | null; endDate: string | null; status: string; notes: string | null; }

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  bankAccount: string | null;
  notes: string | null;
}

interface SupplierStatement {
  id: string; name: string; contactPerson: string | null; phone: string | null; email: string | null;
  invoiceCount: number; totalInvoiced: number; totalPaid: number; balance: number;
  lastPaymentDate: string | null;
  invoices: { id: string; invoiceNumber: string; invoiceDate: string | null; dueDate: string | null; totalAmount: number; paid: number; remaining: number; status: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  'پرداخت کامل': 'bg-emerald-100 text-emerald-700',
  'نیمه پرداخت': 'bg-blue-100 text-blue-700',
  'آماده پرداخت': 'bg-amber-100 text-amber-700',
  'تأیید شده': 'bg-sky-100 text-sky-700',
  'در انتظار بودجه': 'bg-slate-100 text-slate-500',
  'کنسل شده': 'bg-rose-100 text-rose-600',
};

const EMPTY = { id: '', name: '', contactPerson: '', phone: '', email: '', bankAccount: '', notes: '' };

export function Suppliers() {
  const { currentTenantId, can } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [stmtId, setStmtId] = useState<string | null>(null);
  const [crmId, setCrmId] = useState<string | null>(null);
  const [crmTab, setCrmTab] = useState<'contacts' | 'interactions' | 'blanket'>('contacts');
  const [contactForm, setContactForm] = useState({ fullName: '', role: '', phone: '', email: '', notes: '', isPrimary: false });
  const [intForm, setIntForm] = useState({ type: 'یادداشت', subject: '', body: '', interactionDate: '', followUpDate: '' });
  const [blanketForm, setBlanketForm] = useState({ orderNumber: '', description: '', totalValue: 0, currency: 'ریال', startDate: '', endDate: '', status: 'فعال', notes: '' });
  const [crmErr, setCrmErr] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', tid, search],
    queryFn: async () => (await api.get(`/${tid}/suppliers`, { params: { search: search || undefined } })).data.suppliers as Supplier[],
    enabled: Boolean(tid),
  });

  const stmtQ = useQuery({
    queryKey: ['supplier-stmt', tid, stmtId],
    queryFn: async () => (await api.get(`/${tid}/suppliers/${stmtId}/statement`)).data.supplier as SupplierStatement,
    enabled: Boolean(stmtId && tid),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name, contactPerson: form.contactPerson, phone: form.phone, email: form.email, bankAccount: form.bankAccount, notes: form.notes };
      if (form.id) return api.patch(`/${tid}/suppliers/${form.id}`, payload);
      return api.post(`/${tid}/suppliers`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers', tid] });
      setOpen(false);
      setForm(EMPTY);
    },
    onError: (e) => setErr(apiError(e)),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/suppliers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers', tid] }),
  });

  // CRM queries
  const contactsQ = useQuery({
    queryKey: ['supplier-contacts', tid, crmId],
    queryFn: async () => (await api.get(`/${tid}/suppliers/${crmId}/contacts`)).data.contacts as SupplierContact[],
    enabled: !!crmId && crmTab === 'contacts',
  });
  const interactionsQ = useQuery({
    queryKey: ['supplier-interactions', tid, crmId],
    queryFn: async () => (await api.get(`/${tid}/suppliers/${crmId}/interactions`)).data.interactions as SupplierInteraction[],
    enabled: !!crmId && crmTab === 'interactions',
  });
  const blanketQ = useQuery({
    queryKey: ['blanket-orders', tid, crmId],
    queryFn: async () => (await api.get(`/${tid}/suppliers/${crmId}/blanket-orders`)).data.orders as BlanketOrder[],
    enabled: !!crmId && crmTab === 'blanket',
  });

  const addContactMut = useMutation({
    mutationFn: () => api.post(`/${tid}/suppliers/${crmId}/contacts`, { ...contactForm, isPrimary: contactForm.isPrimary, role: contactForm.role || null, phone: contactForm.phone || null, email: contactForm.email || null, notes: contactForm.notes || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-contacts', tid, crmId] }); setContactForm({ fullName: '', role: '', phone: '', email: '', notes: '', isPrimary: false }); setCrmErr(''); },
    onError: (e) => setCrmErr(apiError(e)),
  });

  const delContactMut = useMutation({
    mutationFn: (cid: string) => api.delete(`/${tid}/suppliers/${crmId}/contacts/${cid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-contacts', tid, crmId] }),
  });

  const addIntMut = useMutation({
    mutationFn: () => api.post(`/${tid}/suppliers/${crmId}/interactions`, { ...intForm, subject: intForm.subject || null, body: intForm.body || null, interactionDate: intForm.interactionDate || null, followUpDate: intForm.followUpDate || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-interactions', tid, crmId] }); setIntForm({ type: 'یادداشت', subject: '', body: '', interactionDate: '', followUpDate: '' }); setCrmErr(''); },
    onError: (e) => setCrmErr(apiError(e)),
  });

  const delIntMut = useMutation({
    mutationFn: (iid: string) => api.delete(`/${tid}/suppliers/${crmId}/interactions/${iid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-interactions', tid, crmId] }),
  });

  const addBlanketMut = useMutation({
    mutationFn: () => api.post(`/${tid}/suppliers/${crmId}/blanket-orders`, { ...blanketForm, orderNumber: blanketForm.orderNumber || null, notes: blanketForm.notes || null, startDate: blanketForm.startDate || null, endDate: blanketForm.endDate || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blanket-orders', tid, crmId] }); setBlanketForm({ orderNumber: '', description: '', totalValue: 0, currency: 'ریال', startDate: '', endDate: '', status: 'فعال', notes: '' }); setCrmErr(''); },
    onError: (e) => setCrmErr(apiError(e)),
  });

  const delBlanketMut = useMutation({
    mutationFn: (bid: string) => api.delete(`/${tid}/suppliers/${crmId}/blanket-orders/${bid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blanket-orders', tid, crmId] }),
  });

  function edit(s: Supplier) {
    setForm({ id: s.id, name: s.name, contactPerson: s.contactPerson ?? '', phone: s.phone ?? '', email: s.email ?? '', bankAccount: s.bankAccount ?? '', notes: s.notes ?? '' });
    setErr('');
    setOpen(true);
  }
  function add() {
    setForm(EMPTY);
    setErr('');
    setOpen(true);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    saveMut.mutate();
  }

  const stmt = stmtQ.data;

  return (
    <Layout title={t('suppliers.title')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input className="input max-w-xs" placeholder={t('suppliers.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        {can('suppliers.create') && <button className="btn btn-primary" onClick={add}>{t('suppliers.addNew')}</button>}
      </div>

      {open && (
        <form onSubmit={submit} className="card mb-4 grid gap-3 sm:grid-cols-2">
          {err && <div className="sm:col-span-2 text-sm text-rose-600">{err}</div>}
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('suppliers.form.name')}</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('suppliers.form.contactName')}</span><input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('suppliers.form.phone')}</span><input className="input" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('suppliers.form.email')}</span><input className="input" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">حساب بانکی</span><input className="input" dir="ltr" value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{t('suppliers.form.notes')}</span><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="flex items-end gap-2">
            <button className="btn btn-primary" disabled={saveMut.isPending}>{t('common.save')}</button>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500">
              <th className="p-3">{t('suppliers.cols.name')}</th><th className="p-3">{t('suppliers.cols.contactName')}</th>
              <th className="p-3">{t('suppliers.cols.phone')}</th><th className="p-3">{t('suppliers.cols.email')}</th>
              <th className="p-3">حساب</th><th className="p-3">{t('suppliers.cols.actions')}</th>
            </tr></thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{s.name}</td>
                  <td className="p-3">{s.contactPerson ?? '—'}</td>
                  <td className="p-3" dir="ltr">{s.phone ?? '—'}</td>
                  <td className="p-3" dir="ltr">{s.email ?? '—'}</td>
                  <td className="p-3" dir="ltr">{s.bankAccount ?? '—'}</td>
                  <td className="p-3"><div className="flex gap-1">
                    {can('supplier_statement.view') && (
                      <button
                        className="btn btn-outline px-2 py-1 text-xs"
                        title={t('suppliers.statement.title')}
                        onClick={() => setStmtId(stmtId === s.id ? null : s.id)}
                      >📊</button>
                    )}
                    <button
                      className="btn btn-outline px-2 py-1 text-xs"
                      title="CRM و قراردادها"
                      onClick={() => { setCrmId(crmId === s.id ? null : s.id); setCrmTab('contacts'); }}
                    >🤝</button>
                    {can('suppliers.edit') && <button className="btn btn-outline px-2 py-1" onClick={() => edit(s)}>✏️</button>}
                    {can('suppliers.delete') && <button className="btn btn-outline px-2 py-1 text-rose-600" onClick={() => { if (confirm(t('suppliers.confirmDelete'))) delMut.mutate(s.id); }}>🗑</button>}
                  </div></td>
                </tr>
              ))}
              {(data ?? []).length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">{t('suppliers.empty')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Supplier statement modal */}
      {stmtId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 overflow-y-auto" onClick={() => setStmtId(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-800">{stmt?.name ?? '...'}</h2>
                <p className="text-xs text-slate-500">{t('suppliers.statement.title')}</p>
              </div>
              <button className="btn btn-outline px-2 py-1.5" onClick={() => setStmtId(null)}>✕</button>
            </div>

            {stmtQ.isLoading ? (
              <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
            ) : stmt ? (
              <div className="p-5 space-y-4">
                {/* Contact info */}
                {(stmt.contactPerson || stmt.phone || stmt.email) && (
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    {stmt.contactPerson && <span>رابط: <b className="text-slate-700">{stmt.contactPerson}</b></span>}
                    {stmt.phone && <span dir="ltr">📞 {stmt.phone}</span>}
                    {stmt.email && <span dir="ltr">✉ {stmt.email}</span>}
                  </div>
                )}

                {/* Summary cards */}
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3 text-center">
                    <div className="text-[10px] text-slate-500">{t('suppliers.statement.invoiceCount')}</div>
                    <div className="mt-1 text-xl font-bold">{stmt.invoiceCount}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-center">
                    <div className="text-[10px] text-slate-500">{t('suppliers.statement.totalInvoiced')}</div>
                    <div className="mt-1 text-sm font-bold">{faMoney(stmt.totalInvoiced)}</div>
                    <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-center">
                    <div className="text-[10px] text-slate-500">{t('suppliers.statement.totalPaid')}</div>
                    <div className="mt-1 text-sm font-bold text-emerald-700">{faMoney(stmt.totalPaid)}</div>
                    <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${stmt.balance > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                    <div className="text-[10px] text-slate-500">{t('suppliers.statement.balance')}</div>
                    <div className={`mt-1 text-sm font-bold ${stmt.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{faMoney(stmt.balance)}</div>
                    <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
                  </div>
                </div>

                {stmt.lastPaymentDate && (
                  <p className="text-xs text-slate-500">آخرین پرداخت: <b>{faDate(stmt.lastPaymentDate)}</b></p>
                )}

                {/* Invoice list */}
                {stmt.invoices.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-right text-slate-500">
                          <th className="p-2">شماره فاکتور</th>
                          <th className="p-2">{t('common.date')}</th>
                          <th className="p-2">سررسید</th>
                          <th className="p-2">{t('common.amount')}</th>
                          <th className="p-2">پرداخت</th>
                          <th className="p-2">{t('suppliers.statement.balance')}</th>
                          <th className="p-2">{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stmt.invoices.map((inv) => (
                          <tr key={inv.id} className="border-t border-slate-100">
                            <td className="p-2 font-bold">{inv.invoiceNumber}</td>
                            <td className="p-2">{faDate(inv.invoiceDate)}</td>
                            <td className="p-2">{faDate(inv.dueDate)}</td>
                            <td className="p-2">{faMoney(inv.totalAmount)}</td>
                            <td className="p-2 text-emerald-700">{faMoney(inv.paid)}</td>
                            <td className={`p-2 font-bold ${inv.remaining > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{faMoney(inv.remaining)}</td>
                            <td className="p-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50">
                          <td colSpan={3} className="p-2 text-slate-500 font-bold">{t('common.total')}</td>
                          <td className="p-2 font-bold">{faMoney(stmt.totalInvoiced)}</td>
                          <td className="p-2 font-bold text-emerald-700">{faMoney(stmt.totalPaid)}</td>
                          <td className={`p-2 font-bold ${stmt.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{faMoney(stmt.balance)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {stmt.invoices.length === 0 && (
                  <div className="py-4 text-center text-xs text-slate-400">{t('common.noData')}</div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* CRM Modal */}
      {crmId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10 overflow-y-auto" onClick={() => setCrmId(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-800">CRM تأمین‌کننده — {(data ?? []).find((s) => s.id === crmId)?.name}</h2>
              <button className="btn btn-outline px-2 py-1.5" onClick={() => setCrmId(null)}>✕</button>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-4 border-b border-slate-100">
              {(['contacts', 'interactions', 'blanket'] as const).map((tab) => (
                <button key={tab} onClick={() => setCrmTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${crmTab === tab ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab === 'contacts' ? 'مخاطبان' : tab === 'interactions' ? 'تعاملات' : 'قراردادهای باز'}
                </button>
              ))}
            </div>
            {crmErr && <div className="mx-5 mt-2 p-2 text-xs text-rose-600 bg-rose-50 rounded">{crmErr}</div>}

            <div className="p-5 space-y-4">
              {/* CONTACTS TAB */}
              {crmTab === 'contacts' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <input className="input" placeholder="نام کامل *" value={contactForm.fullName} onChange={(e) => setContactForm((p) => ({ ...p, fullName: e.target.value }))} />
                    <input className="input" placeholder="سمت" value={contactForm.role} onChange={(e) => setContactForm((p) => ({ ...p, role: e.target.value }))} />
                    <input className="input" placeholder="تلفن" dir="ltr" value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} />
                    <input className="input" placeholder="ایمیل" dir="ltr" value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} />
                    <div className="flex items-center gap-2 col-span-2">
                      <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
                      <span className="text-sm">مخاطب اصلی</span>
                      <button className="btn btn-primary text-xs px-3 py-1 mr-auto" disabled={addContactMut.isPending || !contactForm.fullName} onClick={() => addContactMut.mutate()}>+ افزودن</button>
                    </div>
                  </div>
                  {contactsQ.isLoading ? <div className="text-center py-4 text-slate-400">...</div> : (
                    <div className="space-y-2">
                      {(contactsQ.data ?? []).map((c) => (
                        <div key={c.id} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3 text-sm">
                          {c.isPrimary && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">اصلی</span>}
                          <span className="font-semibold">{c.fullName}</span>
                          {c.role && <span className="text-slate-500">{c.role}</span>}
                          {c.phone && <span dir="ltr" className="text-slate-500">{c.phone}</span>}
                          {c.email && <span dir="ltr" className="text-slate-500">{c.email}</span>}
                          <button className="mr-auto text-rose-400 hover:text-rose-600 text-xs" onClick={() => { if (confirm('حذف؟')) delContactMut.mutate(c.id); }}>حذف</button>
                        </div>
                      ))}
                      {(contactsQ.data ?? []).length === 0 && <div className="text-center py-4 text-slate-400 text-sm">مخاطبی ثبت نشده</div>}
                    </div>
                  )}
                </div>
              )}

              {/* INTERACTIONS TAB */}
              {crmTab === 'interactions' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <select className="input" value={intForm.type} onChange={(e) => setIntForm((p) => ({ ...p, type: e.target.value }))}>
                      {['یادداشت', 'تماس تلفنی', 'جلسه', 'ایمیل', 'بازدید'].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className="input" placeholder="موضوع" value={intForm.subject} onChange={(e) => setIntForm((p) => ({ ...p, subject: e.target.value }))} />
                    <input type="date" className="input" value={intForm.interactionDate} onChange={(e) => setIntForm((p) => ({ ...p, interactionDate: e.target.value }))} />
                    <input type="date" className="input" placeholder="پیگیری" value={intForm.followUpDate} onChange={(e) => setIntForm((p) => ({ ...p, followUpDate: e.target.value }))} />
                    <textarea className="input col-span-2 resize-y" rows={2} placeholder="توضیحات..." value={intForm.body} onChange={(e) => setIntForm((p) => ({ ...p, body: e.target.value }))} />
                    <button className="btn btn-primary text-xs px-3 py-1 col-span-2 w-fit mr-auto" disabled={addIntMut.isPending} onClick={() => addIntMut.mutate()}>+ افزودن</button>
                  </div>
                  {interactionsQ.isLoading ? <div className="text-center py-4 text-slate-400">...</div> : (
                    <div className="space-y-2">
                      {(interactionsQ.data ?? []).map((it) => (
                        <div key={it.id} className="bg-slate-50 rounded-lg p-3 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-indigo-700">{it.type}</span>
                            {it.subject && <span className="text-slate-700">{it.subject}</span>}
                            <span className="text-xs text-slate-400 mr-auto">{faDate(it.interactionDate ?? it.createdAt)}</span>
                            <button className="text-rose-400 hover:text-rose-600 text-xs" onClick={() => { if (confirm('حذف؟')) delIntMut.mutate(it.id); }}>حذف</button>
                          </div>
                          {it.body && <p className="text-slate-600">{it.body}</p>}
                          {it.followUpDate && <p className="text-xs text-amber-600 mt-1">پیگیری: {faDate(it.followUpDate)}</p>}
                        </div>
                      ))}
                      {(interactionsQ.data ?? []).length === 0 && <div className="text-center py-4 text-slate-400 text-sm">تعاملی ثبت نشده</div>}
                    </div>
                  )}
                </div>
              )}

              {/* BLANKET ORDERS TAB */}
              {crmTab === 'blanket' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <input className="input" placeholder="شماره قرارداد" value={blanketForm.orderNumber} onChange={(e) => setBlanketForm((p) => ({ ...p, orderNumber: e.target.value }))} />
                    <input className="input" placeholder="شرح *" value={blanketForm.description} onChange={(e) => setBlanketForm((p) => ({ ...p, description: e.target.value }))} />
                    <input type="number" className="input" placeholder="سقف کل" value={blanketForm.totalValue} onChange={(e) => setBlanketForm((p) => ({ ...p, totalValue: Number(e.target.value) }))} />
                    <select className="input" value={blanketForm.status} onChange={(e) => setBlanketForm((p) => ({ ...p, status: e.target.value }))}>
                      {['فعال', 'تکمیل شده', 'لغو شده', 'منقضی'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="date" className="input" placeholder="شروع" value={blanketForm.startDate} onChange={(e) => setBlanketForm((p) => ({ ...p, startDate: e.target.value }))} />
                    <input type="date" className="input" placeholder="پایان" value={blanketForm.endDate} onChange={(e) => setBlanketForm((p) => ({ ...p, endDate: e.target.value }))} />
                    <button className="btn btn-primary text-xs px-3 py-1 col-span-2 w-fit mr-auto" disabled={addBlanketMut.isPending || !blanketForm.description} onClick={() => addBlanketMut.mutate()}>+ افزودن</button>
                  </div>
                  {blanketQ.isLoading ? <div className="text-center py-4 text-slate-400">...</div> : (
                    <div className="space-y-2">
                      {(blanketQ.data ?? []).map((bo) => {
                        const pct = bo.totalValue > 0 ? Math.round((bo.usedValue / bo.totalValue) * 100) : 0;
                        return (
                          <div key={bo.id} className="bg-slate-50 rounded-lg p-3 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              {bo.orderNumber && <span className="font-mono text-xs">{bo.orderNumber}</span>}
                              <span className="font-semibold">{bo.description}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full mr-auto ${bo.status === 'فعال' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{bo.status}</span>
                              <button className="text-rose-400 hover:text-rose-600 text-xs" onClick={() => { if (confirm('حذف؟')) delBlanketMut.mutate(bo.id); }}>حذف</button>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>سقف: {faMoney(bo.totalValue)}</span>
                              <span>استفاده: {faMoney(bo.usedValue)}</span>
                              {bo.endDate && <span>پایان: {faDate(bo.endDate)}</span>}
                            </div>
                            <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-2 rounded-full ${pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{pct}٪ استفاده شده</div>
                          </div>
                        );
                      })}
                      {(blanketQ.data ?? []).length === 0 && <div className="text-center py-4 text-slate-400 text-sm">قراردادی ثبت نشده</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

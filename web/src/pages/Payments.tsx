import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';
import { ExcelButton } from '../components/ExcelButton';

interface PayRow {
  id: string; type: 'invoice' | 'advance'; date: string | null; amount: number;
  listNumber: string | null; reference: string | null; notes: string | null;
  supplier: string; docNumber: string; requestNumber: string;
  invoiceId?: string;
}

interface SchedInvoice {
  id: string; invoiceNumber: string; supplier: string; requestNumber: string;
  total: number; paid: number; remaining: number; percent: number;
  dueDate: string | null; batch: string | null; status: string;
  installments: { amount: number; percent: number | null; monthKey: string | null; dueDate: string | null }[];
}

const emptyEdit = { paymentDate: '', paymentListNumber: '', notes: '' };

export function Payments() {
  const { currentTenantId, can } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editPay, setEditPay] = useState<{ row: PayRow; form: typeof emptyEdit } | null>(null);
  const [editErr, setEditErr] = useState('');
  const [tab, setTab] = useState<'schedule' | 'actual'>('schedule');
  const [payFor, setPayFor] = useState<{ inv: SchedInvoice; date: string; amount: string; listNumber: string; reference: string; notes: string } | null>(null);
  const [payErr, setPayErr] = useState('');

  const scheduleQ = useQuery({
    queryKey: ['payments-schedule', tid],
    queryFn: async () => (await api.get(`/${tid}/payments/schedule`)).data as { invoices: SchedInvoice[]; totals: { openRemaining: number; advance: number; actual: number } },
    enabled: Boolean(tid) && tab === 'schedule',
  });

  const payMut = useMutation({
    mutationFn: async () => {
      const p = payFor!;
      return api.post(`/${tid}/payments`, {
        invoiceId: p.inv.id,
        paymentDate: p.date || undefined,
        amount: Number(p.amount),
        paymentListNumber: p.listNumber || null,
        reference: p.reference || null,
        notes: p.notes || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments-schedule', tid] });
      qc.invalidateQueries({ queryKey: ['payments', tid] });
      qc.invalidateQueries({ queryKey: ['invoices', tid] });
      setPayFor(null);
    },
    onError: (e) => setPayErr(apiError(e)),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['payments', tid, search, from, to],
    queryFn: async () => (await api.get(`/${tid}/payments`, { params: { search: search || undefined, from: from || undefined, to: to || undefined } })).data as { payments: PayRow[]; totals: { actual: number; advance: number } },
    enabled: Boolean(tid),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/payments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments', tid] }),
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editPay) return;
      await api.patch(`/${tid}/payments/${editPay.row.id}`, {
        paymentDate: editPay.form.paymentDate || null,
        paymentListNumber: editPay.form.paymentListNumber || null,
        notes: editPay.form.notes || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', tid] });
      setEditPay(null);
    },
    onError: (e) => setEditErr(apiError(e)),
  });

  function openEdit(row: PayRow) {
    setEditErr('');
    setEditPay({
      row,
      form: {
        paymentDate: row.date ? row.date.slice(0, 10) : '',
        paymentListNumber: row.listNumber ?? '',
        notes: row.notes ?? '',
      },
    });
  }

  const payments = data?.payments ?? [];
  const totals = data?.totals;

  function exportCsv() {
    const rows = payments.map((p) => [
      p.date ? p.date.slice(0, 10) : '',
      p.type === 'advance' ? t('payments.types.advance') : t('payments.types.invoice'),
      p.docNumber, p.requestNumber, p.supplier,
      p.listNumber ?? '', p.amount, p.reference ?? '', p.notes ?? '',
    ]);
    const header = [t('payments.cols.date'), t('payments.cols.type'), t('payments.cols.doc'), t('payments.requestLabel'), t('payments.cols.supplier'), t('payments.cols.listNumber'), t('payments.cols.amount'), t('payments.cols.reference'), t('payments.cols.notes')];
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const batchTotals = new Map<string, number>();
  const batchStarts = new Set<number>();
  let lastListNum: string | null | undefined = undefined;
  for (let i = 0; i < payments.length; i++) {
    const r = payments[i];
    if (r.listNumber) {
      batchTotals.set(r.listNumber, (batchTotals.get(r.listNumber) ?? 0) + r.amount);
      if (r.listNumber !== lastListNum) batchStarts.add(i);
    }
    lastListNum = r.listNumber;
  }

  return (
    <Layout title={t('payments.title')}>
      {/* Tabs: scheduled (open invoices) vs actual payments */}
      <div className="mb-3 inline-flex rounded-lg border border-slate-200 overflow-hidden">
        <button className={`px-4 py-1.5 text-sm font-semibold ${tab === 'schedule' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('schedule')}>📅 برنامه</button>
        <button className={`px-4 py-1.5 text-sm font-semibold ${tab === 'actual' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('actual')}>✅ واقعی</button>
      </div>

      {tab === 'schedule' && (
        <div>
          {scheduleQ.data && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="card"><div className="text-xs text-slate-500">مانده فاکتورهای باز</div><div className="mt-1 text-lg font-bold text-rose-600">{faMoney(scheduleQ.data.totals.openRemaining)}</div></div>
              <div className="card"><div className="text-xs text-slate-500">پیش‌پرداخت‌های ثبت‌شده</div><div className="mt-1 text-lg font-bold text-amber-600">{faMoney(scheduleQ.data.totals.advance)}</div></div>
              <div className="card"><div className="text-xs text-slate-500">پرداخت‌های فاکتور</div><div className="mt-1 text-lg font-bold text-emerald-700">{faMoney(scheduleQ.data.totals.actual)}</div></div>
            </div>
          )}
          {scheduleQ.isLoading ? (
            <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
          ) : (scheduleQ.data?.invoices.length ?? 0) === 0 ? (
            <div className="card p-8 text-center text-slate-400">هیچ فاکتور بازی وجود ندارد</div>
          ) : (
            <div className="grid gap-3">
              {scheduleQ.data!.invoices.map((inv) => {
                const overdue = inv.dueDate && new Date(inv.dueDate) < new Date();
                return (
                  <div key={inv.id} className="card">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-800">{inv.invoiceNumber} — {inv.supplier}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          درخواست: {inv.requestNumber || '—'} | جمع: {faMoney(inv.total)} | سررسید: <span className={overdue ? 'text-rose-600 font-bold' : ''}>{faDate(inv.dueDate)}</span>
                          {inv.batch && <> | دسته: <b>{inv.batch}</b></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{inv.status}</span>
                        {can('payments.register_payment') || can('payments.create') ? (
                          <button className="btn btn-primary px-3 py-1 text-xs" onClick={() => { setPayErr(''); setPayFor({ inv, date: '', amount: String(inv.remaining), listNumber: '', reference: '', notes: '' }); }}>＋ پرداخت</button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${inv.percent === 100 ? 'bg-emerald-500' : inv.percent > 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${inv.percent}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      پرداخت: <b className="text-emerald-700">{faMoney(inv.paid)}</b> | مانده: <b className={inv.remaining > 0 ? 'text-rose-600' : 'text-emerald-700'}>{faMoney(inv.remaining)}</b> | {inv.percent}٪
                    </div>
                    {inv.installments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {inv.installments.map((ins, idx) => (
                          <div key={idx} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                            <div className="font-bold">{ins.monthKey || faDate(ins.dueDate) || '—'}</div>
                            <div>{faMoney(ins.amount)}{ins.percent ? ` (${ins.percent}٪)` : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'actual' && (
      <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder={t('payments.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          {t('common.from')}:
          <JDatePicker className="input w-36 py-1.5 text-xs" value={from} onChange={(v) => setFrom(v)} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          {t('common.to')}:
          <JDatePicker className="input w-36 py-1.5 text-xs" value={to} onChange={(v) => setTo(v)} />
        </label>
        {(from || to) && (
          <button className="btn btn-outline px-2 py-1 text-xs" onClick={() => { setFrom(''); setTo(''); }}>{t('payments.clearFilter')}</button>
        )}
        <div className="mr-auto flex items-center gap-2">
          <ExcelButton store="payments" />
          {payments.length > 0 && (
            <button className="btn btn-outline px-2 py-1 text-xs" onClick={exportCsv}>{t('payments.exportCsv')}</button>
          )}
        </div>
      </div>

      {totals && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="card">
            <div className="text-xs text-slate-500">{t('payments.totals.invoiceTotal')}</div>
            <div className="mt-1 text-lg font-bold">{faMoney(totals.actual)}</div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500">{t('payments.totals.advanceTotal')}</div>
            <div className="mt-1 text-lg font-bold">{faMoney(totals.advance)}</div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500">{t('payments.totals.grandTotal')}</div>
            <div className="mt-1 text-lg font-bold text-blue-700">{faMoney(totals.actual + totals.advance)}</div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-3">{t('payments.cols.date')}</th>
                <th className="p-3">{t('payments.cols.type')}</th>
                <th className="p-3">{t('payments.cols.doc')}</th>
                <th className="p-3">{t('requests.cols.number')}</th>
                <th className="p-3">{t('payments.cols.supplier')}</th>
                <th className="p-3">{t('payments.cols.listNumber')}</th>
                <th className="p-3">{t('payments.cols.amount')}</th>
                <th className="p-3">{t('payments.cols.reference')}</th>
                <th className="p-3">{t('payments.cols.notes')}</th>
                <th className="p-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <Fragment key={p.id}>
                  {batchStarts.has(i) && (
                    <tr>
                      <td colSpan={10} className="bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 border-t-2 border-b border-blue-200">
                        {t('payments.batchLabel')}: {p.listNumber} — {t('payments.batchSum')}: {faMoney(batchTotals.get(p.listNumber!)!)} {t('common.rial')}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3">{faDate(p.date)}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.type === 'advance' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.type === 'advance' ? t('payments.types.advance') : t('payments.types.invoice')}
                      </span>
                    </td>
                    <td className="p-3 font-bold">{p.docNumber}</td>
                    <td className="p-3 font-semibold text-blue-700">{p.requestNumber || '—'}</td>
                    <td className="p-3">{p.supplier}</td>
                    <td className="p-3">{p.listNumber ?? '—'}</td>
                    <td className="p-3 font-bold text-emerald-700">{faMoney(p.amount)}</td>
                    <td className="p-3 text-xs text-slate-500">{p.reference ?? '—'}</td>
                    <td className="p-3 text-xs text-slate-500 max-w-[150px] truncate">{p.notes ?? '—'}</td>
                    <td className="p-3">
                      {p.type === 'invoice' && (
                        <div className="flex gap-1">
                          {can('payments.delete') && (
                            <button className="btn btn-outline px-2 py-1 text-xs" title={t('common.edit')} onClick={() => openEdit(p)}>✏</button>
                          )}
                          {can('payments.delete') && (
                            <button
                              className="btn btn-outline px-2 py-1 text-xs text-rose-600"
                              title={t('common.delete')}
                              onClick={() => { if (confirm(t('payments.confirmDelete'))) deleteMut.mutate(p.id); }}
                            >🗑</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-slate-400">{t('payments.empty')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {/* Register payment modal (from schedule) */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPayFor(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-sm font-bold text-slate-800">ثبت پرداخت</h2>
            <p className="mb-3 text-xs text-slate-500">{payFor.inv.invoiceNumber} — {payFor.inv.supplier} | مانده: {faMoney(payFor.inv.remaining)}</p>
            {payErr && <div className="mb-2 text-sm text-rose-600">{payErr}</div>}
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">تاریخ</span>
                <JDatePicker className="input" value={payFor.date} onChange={(v) => setPayFor({ ...payFor, date: v })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">مبلغ</span>
                <input className="input" type="number" value={payFor.amount} onChange={(e) => setPayFor({ ...payFor, amount: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">شماره لیست</span>
                <input className="input" dir="ltr" value={payFor.listNumber} onChange={(e) => setPayFor({ ...payFor, listNumber: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">شماره مرجع</span>
                <input className="input" dir="ltr" value={payFor.reference} onChange={(e) => setPayFor({ ...payFor, reference: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">یادداشت</span>
                <input className="input" value={payFor.notes} onChange={(e) => setPayFor({ ...payFor, notes: e.target.value })} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setPayFor(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" disabled={!(Number(payFor.amount) > 0) || payMut.isPending} onClick={() => payMut.mutate()}>✅ ثبت</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit payment modal */}
      {editPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="mb-1 text-sm font-bold text-slate-800">{t('payments.edit.title')}</h2>
            <p className="mb-3 text-xs text-slate-500">{editPay.row.docNumber} — {editPay.row.supplier}</p>
            {editErr && <div className="mb-2 text-sm text-rose-600">{editErr}</div>}
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('payments.edit.date')}</span>
                <JDatePicker
                  className="input"
                  value={editPay.form.paymentDate}
                  onChange={(v) => setEditPay({ ...editPay, form: { ...editPay.form, paymentDate: v } })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('payments.edit.listNumber')}</span>
                <input
                  className="input" dir="ltr"
                  value={editPay.form.paymentListNumber}
                  onChange={(e) => setEditPay({ ...editPay, form: { ...editPay.form, paymentListNumber: e.target.value } })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('payments.edit.notes')}</span>
                <textarea
                  className="input min-h-[60px]"
                  value={editPay.form.notes}
                  onChange={(e) => setEditPay({ ...editPay, form: { ...editPay.form, notes: e.target.value } })}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-primary" disabled={editMut.isPending} onClick={() => editMut.mutate()}>
                {editMut.isPending ? t('payments.edit.saving') : t('payments.edit.save')}
              </button>
              <button className="btn btn-outline" onClick={() => setEditPay(null)}>{t('payments.edit.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

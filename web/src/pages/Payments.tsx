import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate } from '../lib/format';

interface PayRow {
  id: string; type: 'invoice' | 'advance'; date: string | null; amount: number;
  listNumber: string | null; reference: string | null; notes: string | null;
  supplier: string; docNumber: string; requestNumber: string;
  invoiceId?: string;
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder={t('payments.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          {t('common.from')}:
          <input className="input w-36 py-1.5 text-xs" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          {t('common.to')}:
          <input className="input w-36 py-1.5 text-xs" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(from || to) && (
          <button className="btn btn-outline px-2 py-1 text-xs" onClick={() => { setFrom(''); setTo(''); }}>{t('payments.clearFilter')}</button>
        )}
        {payments.length > 0 && (
          <button className="btn btn-outline px-2 py-1 text-xs mr-auto" onClick={exportCsv}>{t('payments.exportCsv')}</button>
        )}
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
                <input
                  className="input" type="date" dir="ltr"
                  value={editPay.form.paymentDate}
                  onChange={(e) => setEditPay({ ...editPay, form: { ...editPay.form, paymentDate: e.target.value } })}
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

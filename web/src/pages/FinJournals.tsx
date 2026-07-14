import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate, faMoney } from '../lib/format';

interface Line { id: string; debit: string; credit: string; description: string | null; account: { code: string; name: string }; }
interface Journal {
  id: string; number: number; date: string; description: string | null; status: string;
  postedAt: string | null; lines: Line[]; refType: string | null; invoiceNumber: string | null;
}
const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', posted: 'قطعی', void: 'باطل' };
const STATUS_COLOR: Record<string, string> = { draft: 'bg-slate-100 text-slate-600', posted: 'bg-emerald-50 text-emerald-700', void: 'bg-rose-50 text-rose-600 line-through' };

export function FinJournals() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const journalsQ = useQuery({
    queryKey: ['fin-journals', tid, status],
    queryFn: async () => (await api.get(`/${tid}/finance/journals`, { params: status ? { status } : {} })).data.journals as Journal[],
    enabled: !!tid,
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'post' | 'void' | 'reverse' }) => api.post(`/${tid}/finance/journals/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-journals', tid] }),
    onError: (e) => setErr(apiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/finance/journals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-journals', tid] }),
    onError: (e) => setErr(apiError(e)),
  });

  const canPost = can('finance.post');
  const canVoid = can('finance.void');
  const canCreate = can('finance.create');
  const canDelete = can('finance.delete');
  const lineTotal = (j: Journal) => j.lines.reduce((s, l) => s + Number(l.debit), 0);

  return (
    <Layout title="دفتر روزنامه">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {[['', 'همه'], ['draft', 'پیش‌نویس'], ['posted', 'قطعی'], ['void', 'باطل']].map(([v, lbl]) => (
            <button key={v} onClick={() => setStatus(v)} className={`rounded-lg px-3 py-1 text-sm ${status === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{lbl}</button>
          ))}
        </div>
        {canCreate && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => navigate('/finance/journals/new')}>＋ ثبت سند</button>}
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {journalsQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : (journalsQ.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-400">سندی یافت نشد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">شماره</th><th className="p-3">تاریخ</th><th className="p-3">شرح</th><th className="p-3">مبلغ</th><th className="p-3">وضعیت</th><th className="p-3">عملیات</th></tr></thead>
            <tbody>
              {(journalsQ.data ?? []).map((j) => (
                <Fragment key={j.id}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-bold">{j.number}</td>
                    <td className="p-3 text-xs text-slate-500">{faDate(j.date)}</td>
                    <td className="p-3">
                      {j.description ?? '—'}
                      {j.refType === 'invoice' && j.invoiceNumber && <span className="mr-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">از فاکتور {j.invoiceNumber}</span>}
                    </td>
                    <td className="p-3 tabular-nums">{faMoney(lineTotal(j))}</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[j.status]}`}>{STATUS_FA[j.status]}</span></td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button className="text-slate-500 hover:underline" onClick={() => setOpen(open === j.id ? null : j.id)}>{open === j.id ? 'بستن' : 'جزئیات'}</button>
                        {j.status === 'draft' && canCreate && <button className="text-blue-600 hover:underline" onClick={() => navigate(`/finance/journals/${j.id}/edit`)}>ویرایش</button>}
                        {j.status === 'draft' && canPost && <button className="text-emerald-600 hover:underline" disabled={act.isPending} onClick={() => { setErr(''); act.mutate({ id: j.id, action: 'post' }); }}>قطعی کردن</button>}
                        {j.status === 'posted' && canVoid && <button className="text-rose-600 hover:underline" disabled={act.isPending} onClick={() => { setErr(''); act.mutate({ id: j.id, action: 'void' }); }}>ابطال</button>}
                        {j.status === 'posted' && canCreate && <button className="text-amber-600 hover:underline" disabled={act.isPending} onClick={() => { setErr(''); act.mutate({ id: j.id, action: 'reverse' }); }}>سند برگشت</button>}
                        {j.status === 'draft' && canDelete && <button className="text-rose-500 hover:underline" disabled={del.isPending} onClick={() => { if (confirm('حذف سند پیش‌نویس؟')) { setErr(''); del.mutate(j.id); } }}>حذف</button>}
                      </div>
                    </td>
                  </tr>
                  {open === j.id && (
                    <tr className="bg-slate-50/50">
                      <td colSpan={6} className="p-3">
                        <table className="w-full text-xs">
                          <thead><tr className="text-right text-slate-400"><th className="p-1">حساب</th><th className="p-1">شرح</th><th className="p-1">بدهکار</th><th className="p-1">بستانکار</th></tr></thead>
                          <tbody>
                            {j.lines.map((l) => (
                              <tr key={l.id} className="border-t border-slate-100">
                                <td className="p-1"><span className="font-mono text-slate-400">{l.account.code}</span> {l.account.name}</td>
                                <td className="p-1 text-slate-500">{l.description ?? '—'}</td>
                                <td className="p-1 tabular-nums">{Number(l.debit) ? faMoney(l.debit) : '—'}</td>
                                <td className="p-1 tabular-nums">{Number(l.credit) ? faMoney(l.credit) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

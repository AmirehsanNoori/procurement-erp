import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney } from '../lib/format';
import { SearchableSelect } from '../components/SearchableSelect';
import { JDatePicker } from '../components/JDatePicker';

interface Account { id: string; code: string; name: string; isPostable: boolean; isActive: boolean; }
interface CostCenter { id: string; code: string; name: string; isActive: boolean; }
interface LineRow { accountId: string; debit: string; credit: string; description: string; costCenterId: string; }
const emptyLine: LineRow = { accountId: '', debit: '', credit: '', description: '', costCenterId: '' };
const todayIso = () => new Date().toISOString().slice(0, 10);

export function FinJournalEntry() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { id } = useParams(); // when editing a draft
  const isEdit = !!id;

  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineRow[]>([{ ...emptyLine }, { ...emptyLine }]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const accountsQ = useQuery({
    queryKey: ['fin-accounts', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/accounts`)).data.accounts as Account[],
    enabled: !!tid,
  });
  const postable = (accountsQ.data ?? []).filter((a) => a.isPostable && a.isActive);
  const accountOptions = postable.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const costCentersQ = useQuery({
    queryKey: ['fin-cost-centers', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/cost-centers`)).data.costCenters as CostCenter[],
    enabled: !!tid,
  });
  const costCenterOptions = [{ value: '', label: '— بدون مرکز هزینه —' }, ...(costCentersQ.data ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))];

  // Load an existing draft for editing.
  useQuery({
    queryKey: ['fin-journal', tid, id],
    queryFn: async () => (await api.get(`/${tid}/finance/journals/${id}`)).data.journal,
    enabled: !!tid && isEdit && !loaded,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (j: any) => {
      setDate(String(j.date).slice(0, 10));
      setDescription(j.description ?? '');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLines(j.lines.map((l: any) => ({ accountId: l.accountId, debit: Number(l.debit) ? String(Number(l.debit)) : '', credit: Number(l.credit) ? String(Number(l.credit)) : '', description: l.description ?? '', costCenterId: l.costCenterId ?? '' })));
      setLoaded(true);
      return j;
    },
  });

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { debit, credit, diff: Math.round((debit - credit) * 100) / 100 };
  }, [lines]);
  const balanced = totals.diff === 0 && totals.debit > 0;

  function updLine(i: number, patch: Partial<LineRow>) {
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        date, description,
        lines: lines
          .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description || null, costCenterId: l.costCenterId || null })),
      };
      if (isEdit) return api.patch(`/${tid}/finance/journals/${id}`, payload);
      return api.post(`/${tid}/finance/journals`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin-journals', tid] });
      navigate('/finance/journals');
    },
    onError: (e) => setErr(apiError(e)),
  });

  return (
    <Layout title={isEdit ? 'ویرایش سند' : 'ثبت سند حسابداری'}>
      {postable.length === 0 && !accountsQ.isLoading && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          هیچ حساب معینی برای ثبت سند وجود ندارد. ابتدا از «کدینگ حساب‌ها» کدینگ استاندارد را بارگذاری کنید.
        </div>
      )}
      {err && <div className="mb-3 text-sm text-rose-600">{err}</div>}

      <div className="card mb-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">تاریخ سند</span>
            <JDatePicker value={date} onChange={setDate} />
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">شرح سند</span>
            <input className="input w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="شرح کلی سند..." />
          </label>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-2">حساب معین</th><th className="p-2">شرح</th><th className="p-2">مرکز هزینه</th><th className="p-2 w-32">بدهکار</th><th className="p-2 w-32">بستانکار</th><th className="p-2"></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="p-2"><div className="min-w-[12rem]"><SearchableSelect value={l.accountId} onChange={(v) => updLine(i, { accountId: v })} options={accountOptions} placeholder="انتخاب حساب..." /></div></td>
                <td className="p-2"><input className="input w-full px-2 py-1 text-xs" value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} /></td>
                <td className="p-2"><div className="min-w-[9rem]"><SearchableSelect value={l.costCenterId} onChange={(v) => updLine(i, { costCenterId: v })} options={costCenterOptions} placeholder="— بدون —" /></div></td>
                <td className="p-2"><input className="input w-full px-2 py-1 tabular-nums" type="number" value={l.debit} onChange={(e) => updLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} /></td>
                <td className="p-2"><input className="input w-full px-2 py-1 tabular-nums" type="number" value={l.credit} onChange={(e) => updLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} /></td>
                <td className="p-2 text-center">{lines.length > 2 && <button className="text-rose-500 hover:text-rose-700" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
              <td className="p-2" colSpan={3}>جمع</td>
              <td className="p-2 tabular-nums">{faMoney(totals.debit)}</td>
              <td className="p-2 tabular-nums">{faMoney(totals.credit)}</td>
              <td className="p-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button className="btn btn-outline px-3 py-1 text-sm" onClick={() => setLines([...lines, { ...emptyLine }])}>＋ افزودن سطر</button>
        <div className="flex items-center gap-3">
          {totals.diff !== 0 ? (
            <span className="text-sm font-semibold text-rose-600">اختلاف: {faMoney(Math.abs(totals.diff))} {totals.diff > 0 ? '(بدهکار بیشتر)' : '(بستانکار بیشتر)'}</span>
          ) : totals.debit > 0 ? (
            <span className="text-sm font-semibold text-emerald-600">✓ سند تراز است</span>
          ) : null}
          <button className="btn btn-outline" onClick={() => navigate('/finance/journals')}>انصراف</button>
          <button className="btn btn-primary" disabled={!balanced || save.isPending} onClick={() => { setErr(''); save.mutate(); }}>
            {isEdit ? 'ذخیره تغییرات' : 'ثبت پیش‌نویس'}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">سند به‌صورت «پیش‌نویس» ثبت می‌شود؛ برای اثرگذاری در دفاتر باید در فهرست اسناد «قطعی» شود.</p>
    </Layout>
  );
}

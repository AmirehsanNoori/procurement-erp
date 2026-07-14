import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { SearchableSelect } from '../components/SearchableSelect';

interface Account {
  id: string; code: string; name: string; type: string; parentId: string | null;
  level: number; isPostable: boolean; isActive: boolean;
}
const TYPE_FA: Record<string, string> = { asset: 'دارایی', liability: 'بدهی', equity: 'حقوق مالکانه', income: 'درآمد', expense: 'هزینه' };
const TYPE_COLOR: Record<string, string> = {
  asset: 'bg-blue-50 text-blue-700', liability: 'bg-rose-50 text-rose-700', equity: 'bg-violet-50 text-violet-700',
  income: 'bg-emerald-50 text-emerald-700', expense: 'bg-amber-50 text-amber-700',
};

export function FinAccounts() {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const accountsQ = useQuery({
    queryKey: ['fin-accounts', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/accounts`)).data.accounts as Account[],
    enabled: !!tid,
  });
  const accounts = accountsQ.data ?? [];

  const seed = useMutation({
    mutationFn: async () => api.post(`/${tid}/finance/accounts/seed-defaults`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-accounts', tid] }),
    onError: (e) => setErr(apiError(e)),
  });

  const canEdit = can('finance.edit');
  const canCreate = can('finance.create');

  // Sorted by code so the tree reads top-down; indent by level.
  const sorted = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)), [accounts]);

  return (
    <Layout title="کدینگ حساب‌ها">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">ساختار درختی حساب‌ها. سند فقط روی حساب‌های «معین» (قابل ثبت) ثبت می‌شود.</p>
        <div className="flex gap-2">
          {canCreate && accounts.length === 0 && (
            <button className="btn btn-outline px-3 py-1 text-sm" disabled={seed.isPending} onClick={() => { setErr(''); seed.mutate(); }}>
              بارگذاری کدینگ استاندارد
            </button>
          )}
          {canCreate && <button className="btn btn-primary px-3 py-1 text-sm" onClick={() => { setErr(''); setCreating(true); }}>＋ حساب جدید</button>}
        </div>
      </div>
      {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}

      <div className="card overflow-x-auto p-0">
        {accountsQ.isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : accounts.length === 0 ? (
          <div className="p-8 text-center text-slate-400">هنوز حسابی ثبت نشده. می‌توانید کدینگ استاندارد را بارگذاری کنید.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">کد</th><th className="p-3">نام حساب</th><th className="p-3">نوع</th><th className="p-3">سطح</th><th className="p-3">وضعیت</th>{canEdit && <th className="p-3"></th>}</tr></thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} className={`border-t border-slate-100 hover:bg-slate-50 ${!a.isActive ? 'opacity-50' : ''}`}>
                  <td className="p-3 font-mono text-slate-600">{a.code}</td>
                  <td className="p-3"><span style={{ paddingRight: `${(a.level - 1) * 1.25}rem` }} className={a.isPostable ? '' : 'font-bold text-slate-800'}>{a.name}</span></td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${TYPE_COLOR[a.type] ?? 'bg-slate-100 text-slate-600'}`}>{TYPE_FA[a.type] ?? a.type}</span></td>
                  <td className="p-3 text-xs text-slate-500">{a.level}</td>
                  <td className="p-3 text-xs">{a.isPostable ? <span className="text-emerald-600">معین (قابل ثبت)</span> : <span className="text-slate-400">گروه/کل</span>}{!a.isActive && ' · غیرفعال'}</td>
                  {canEdit && <td className="p-3"><button className="text-xs text-blue-600 hover:underline" onClick={() => { setErr(''); setEditing(a); }}>ویرایش</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && (
        <AccountModal
          tid={tid}
          accounts={accounts}
          account={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['fin-accounts', tid] }); setCreating(false); setEditing(null); }}
        />
      )}
    </Layout>
  );
}

function AccountModal({ tid, accounts, account, onClose, onSaved }: {
  tid: string; accounts: Account[]; account: Account | null; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!account;
  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState(account?.type ?? 'asset');
  const [parentId, setParentId] = useState(account?.parentId ?? '');
  const [isPostable, setIsPostable] = useState(account?.isPostable ?? true);
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (isEdit) return api.patch(`/${tid}/finance/accounts/${account!.id}`, { name, type, isPostable, isActive });
      return api.post(`/${tid}/finance/accounts`, { code, name, type, parentId: parentId || null, isPostable });
    },
    onSuccess: onSaved,
    onError: (e) => setErr(apiError(e)),
  });

  const parentOptions = [{ value: '', label: '— بدون والد (سطح گروه) —' }, ...accounts.filter((a) => !a.isPostable && a.id !== account?.id).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-800">{isEdit ? 'ویرایش حساب' : 'حساب جدید'}</h2>
        {err && <div className="mb-2 text-sm text-rose-600">{err}</div>}
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">کد حساب</span>
            <input className="input w-full" value={code} disabled={isEdit} onChange={(e) => setCode(e.target.value)} placeholder="مثلاً 100101" />
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نام حساب</span>
            <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">نوع حساب</span>
            <select className="input w-full" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPE_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {!isEdit && (
            <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">حساب والد</span>
              <SearchableSelect value={parentId} onChange={setParentId} options={parentOptions} placeholder="انتخاب والد..." />
            </label>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPostable} onChange={(e) => setIsPostable(e.target.checked)} /><span>قابل ثبت سند (معین)</span></label>
          {isEdit && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /><span>فعال</span></label>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" disabled={save.isPending || !name || (!isEdit && !code)} onClick={() => { setErr(''); save.mutate(); }}>ذخیره</button>
        </div>
      </div>
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { api, apiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface Tenant {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
}

const EMPTY = { id: '', name: '', code: '', isActive: true };

export function Tenants() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  if (!user?.isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tenants-admin'],
    queryFn: async () => (await api.get('/tenants')).data.tenants as Tenant[],
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name, code: form.code, isActive: form.isActive };
      if (form.id) return api.patch(`/tenants/${form.id}`, payload);
      return api.post('/tenants', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants-admin'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      setOpen(false);
      setForm(EMPTY);
    },
    onError: (e) => setErr(apiError(e)),
  });

  function openEdit(tenant: Tenant) {
    setForm({ id: tenant.id, name: tenant.name, code: tenant.code, isActive: tenant.isActive });
    setErr('');
    setOpen(true);
  }

  function openCreate() {
    setForm(EMPTY);
    setErr('');
    setOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    saveMut.mutate();
  }

  const tenants = data ?? [];

  return (
    <Layout title={t('tenants.title')}>
      <div className="mb-3 flex justify-end">
        <button className="btn btn-primary" onClick={openCreate}>{t('tenants.addNew')}</button>
      </div>

      {open && (
        <form onSubmit={submit} className="card mb-4 grid gap-3 sm:grid-cols-2">
          {err && <div className="sm:col-span-2 text-sm text-rose-600">{err}</div>}
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('tenants.form.name')}</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('tenants.form.code')}</span>
            <input className="input" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required placeholder="IOID-WPA" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <span className="text-xs font-bold text-slate-600">{t('tenants.form.isActive')}</span>
          </label>
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
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-3">{t('tenants.cols.name')}</th>
                <th className="p-3">{t('tenants.cols.code')}</th>
                <th className="p-3">{t('tenants.cols.status')}</th>
                <th className="p-3">{t('tenants.cols.createdAt')}</th>
                <th className="p-3">{t('tenants.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold">{tenant.name}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{tenant.code}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tenant.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                      {tenant.isActive ? t('tenants.status.active') : t('tenants.status.inactive')}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-500">{new Intl.DateTimeFormat('fa-IR').format(new Date(tenant.createdAt))}</td>
                  <td className="p-3">
                    <button className="btn btn-outline px-2 py-1 text-xs" onClick={() => openEdit(tenant)}>{t('common.edit')}</button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">{t('tenants.empty')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

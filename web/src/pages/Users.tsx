import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { api, apiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface UserTenant {
  tenantId: string;
  tenantName: string;
  roleId: string;
  roleName: string;
  isActive: boolean;
}

interface PermItem { key: string; name: string; }
interface PermModule { module: string; moduleFa: string; items: PermItem[]; }
interface UserOverride { tenantId: string; permissionKey: string; allowed: boolean; }
interface UserRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  tenants: UserTenant[];
}
interface Role { id: string; name: string; }
interface TenantOpt { tenantId?: string; id?: string; name: string; }

const EMPTY_CREATE = { fullName: '', email: '', password: '', phone: '' };

export function Users() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createErr, setCreateErr] = useState('');

  const [editUser, setEditUser] = useState<{ user: UserRow; form: { fullName: string; phone: string } } | null>(null);
  const [editErr, setEditErr] = useState('');

  const [resetPwd, setResetPwd] = useState<{ userId: string; name: string; password: string; confirm: string } | null>(null);
  const [resetErr, setResetErr] = useState('');

  const [assign, setAssign] = useState<{ userId: string; tenantId: string; roleId: string } | null>(null);

  // permission override editor
  const [permUser, setPermUser] = useState<UserRow | null>(null);
  const [permTenantId, setPermTenantId] = useState('');
  // draft: permKey → true (grant) | false (revoke) | undefined (default/remove override)
  const [permDraft, setPermDraft] = useState<Record<string, boolean | undefined>>({});

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.users as UserRow[],
  });
  const rolesQ = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/users/roles')).data.roles as Role[],
  });
  const tenantsQ = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => (await api.get('/tenants')).data.tenants as TenantOpt[],
  });

  const permCatalogQ = useQuery({
    queryKey: ['perm-catalog'],
    queryFn: async () => (await api.get('/users/permissions')).data.modules as PermModule[],
    staleTime: 5 * 60_000,
  });

  const permDetailQ = useQuery({
    queryKey: ['user-detail', permUser?.id],
    queryFn: async () => (await api.get(`/users/${permUser!.id}`)).data as { user: UserRow; overrides: UserOverride[] },
    enabled: Boolean(permUser),
  });

  const createMut = useMutation({
    mutationFn: async () => api.post('/users', createForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
    },
    onError: (e) => setCreateErr(apiError(e)),
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editUser) return;
      await api.patch(`/users/${editUser.user.id}`, {
        fullName: editUser.form.fullName || undefined,
        phone: editUser.form.phone || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
    },
    onError: (e) => setEditErr(apiError(e)),
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      if (!resetPwd) return;
      await api.post(`/users/${resetPwd.userId}/reset-password`, { password: resetPwd.password });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setResetPwd(null);
    },
    onError: (e) => setResetErr(apiError(e)),
  });

  const toggleActiveMut = useMutation({
    mutationFn: async (u: UserRow) => api.patch(`/users/${u.id}`, { isActive: !u.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const assignMut = useMutation({
    mutationFn: async () => api.post(`/users/${assign!.userId}/tenants`, { tenantId: assign!.tenantId, roleId: assign!.roleId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setAssign(null);
    },
  });

  const removeTenantMut = useMutation({
    mutationFn: async ({ userId, tenantId }: { userId: string; tenantId: string }) =>
      api.delete(`/users/${userId}/tenants/${tenantId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const savePermMut = useMutation({
    mutationFn: async () => {
      if (!permUser || !permTenantId) return;
      const overrides = Object.entries(permDraft).map(([permissionKey, allowed]) => ({
        permissionKey,
        allowed: allowed ?? null,
      }));
      await api.patch(`/users/${permUser.id}/permissions`, { tenantId: permTenantId, overrides });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-detail', permUser?.id] });
      setPermDraft({});
    },
  });

  function openPermEditor(u: UserRow) {
    setPermUser(u);
    setPermDraft({});
    const firstTenant = u.tenants[0]?.tenantId ?? '';
    setPermTenantId(firstTenant);
  }

  function tenantOptId(opt: TenantOpt) {
    return opt.tenantId ?? opt.id ?? '';
  }

  function openEdit(u: UserRow) {
    setEditErr('');
    setEditUser({ user: u, form: { fullName: u.fullName, phone: u.phone ?? '' } });
  }

  function openReset(u: UserRow) {
    setResetErr('');
    setResetPwd({ userId: u.id, name: u.fullName, password: '', confirm: '' });
  }

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    setCreateErr('');
    createMut.mutate();
  }

  function submitReset() {
    if (!resetPwd) return;
    if (resetPwd.password.length < 8) { setResetErr('رمز عبور باید حداقل ۸ کاراکتر باشد'); return; }
    if (resetPwd.password !== resetPwd.confirm) { setResetErr('رمزهای عبور مطابقت ندارند'); return; }
    setResetErr('');
    resetMut.mutate();
  }

  return (
    <Layout title={t('users.title')}>
      <div className="mb-3 flex justify-end">
        {can('user_management.create') && (
          <button className="btn btn-primary" onClick={() => { setShowCreate((v) => !v); setCreateErr(''); }}>
            {t('users.addNew')}
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={submitCreate} className="card mb-4 grid gap-3 sm:grid-cols-2">
          {createErr && <div className="sm:col-span-2 text-sm text-rose-600">{createErr}</div>}
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.form.fullName')}</span>
            <input className="input" value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.form.email')}</span>
            <input className="input" type="email" dir="ltr" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.form.password')}</span>
            <input className="input" type="text" dir="ltr" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required minLength={8} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('profile.form.phone')}</span>
            <input className="input" dir="ltr" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
          </label>
          <div className="flex items-end gap-2">
            <button className="btn btn-primary" disabled={createMut.isPending}>{t('common.save')}</button>
            <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        {usersQ.isLoading ? (
          <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-3">{t('users.cols.name')}</th>
                <th className="p-3">{t('users.cols.email')}</th>
                <th className="p-3">{t('users.cols.tenants')}</th>
                <th className="p-3">{t('common.status')}</th>
                <th className="p-3">{t('profile.accountInfo.lastLogin')}</th>
                <th className="p-3">{t('users.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(usersQ.data ?? []).map((u) => (
                <tr key={u.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                  <td className="p-3 font-bold">
                    {u.fullName}
                    {u.isSuperAdmin && <span className="mr-1 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">{t('users.superAdmin')}</span>}
                    {u.phone && <span className="block text-[10px] font-normal text-slate-400" dir="ltr">{u.phone}</span>}
                  </td>
                  <td className="p-3" dir="ltr">{u.email}</td>
                  <td className="p-3">
                    {u.tenants.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {u.tenants.map((tenant) => (
                          <div key={tenant.tenantId} className="flex items-center gap-1">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                              {tenant.tenantName}: <b>{tenant.roleName}</b>
                            </span>
                            {can('user_management.manage_users') && (
                              <button
                                className="text-[10px] text-rose-400 hover:text-rose-600"
                                title={t('users.actions.removeTenant')}
                                onClick={() => {
                                  if (confirm(t('users.confirm.removeTenant')))
                                    removeTenantMut.mutate({ userId: u.id, tenantId: tenant.tenantId });
                                }}
                              >✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                      {u.isActive ? t('tenants.status.active') : t('tenants.status.inactive')}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{u.lastLoginAt ? new Intl.DateTimeFormat('fa-IR').format(new Date(u.lastLoginAt)) : '—'}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {can('user_management.manage_users') && (
                        <button className="btn btn-outline px-2 py-1 text-xs" onClick={() => openEdit(u)}>{t('users.actions.edit')}</button>
                      )}
                      {can('user_management.manage_users') && (
                        <button className="btn btn-outline px-2 py-1 text-xs" onClick={() => openReset(u)}>{t('users.actions.resetPass')}</button>
                      )}
                      {can('user_management.manage_users') && u.tenants.length > 0 && (
                        <button className="btn btn-outline px-2 py-1 text-xs" title={t('users.permissions.title')} onClick={() => openPermEditor(u)}>{t('users.actions.permissions')}</button>
                      )}
                      <button className="btn btn-outline px-2 py-1 text-xs" onClick={() => setAssign({ userId: u.id, tenantId: '', roleId: '' })}>
                        {t('users.actions.addTenant')}
                      </button>
                      {can('user_management.manage_users') && (
                        <button
                          className="btn btn-outline px-2 py-1 text-xs"
                          onClick={() => toggleActiveMut.mutate(u)}
                        >
                          {u.isActive ? t('tenants.status.inactive') : t('tenants.status.active')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit user modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditUser(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-base font-bold">{t('users.edit.title')}</h2>
            {editErr && <div className="mb-2 text-sm text-rose-600">{editErr}</div>}
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.edit.fullName')}</span>
                <input
                  className="input"
                  value={editUser.form.fullName}
                  onChange={(e) => setEditUser({ ...editUser, form: { ...editUser.form, fullName: e.target.value } })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.form.email')}</span>
                <input className="input bg-slate-50 text-slate-500" value={editUser.user.email} dir="ltr" readOnly />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.edit.phone')}</span>
                <input
                  className="input"
                  dir="ltr"
                  value={editUser.form.phone}
                  onChange={(e) => setEditUser({ ...editUser, form: { ...editUser.form, phone: e.target.value } })}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-primary" disabled={editMut.isPending} onClick={() => editMut.mutate()}>
                {editMut.isPending ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-outline" onClick={() => setEditUser(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetPwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setResetPwd(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-bold">{t('users.resetPass.title')}</h2>
            <p className="mb-3 text-xs text-slate-500">{resetPwd.name}</p>
            {resetErr && <div className="mb-2 text-sm text-rose-600">{resetErr}</div>}
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.resetPass.newPass')}</span>
                <input
                  className="input"
                  type="password"
                  dir="ltr"
                  value={resetPwd.password}
                  onChange={(e) => setResetPwd({ ...resetPwd, password: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.resetPass.confirmPass')}</span>
                <input
                  className="input"
                  type="password"
                  dir="ltr"
                  value={resetPwd.confirm}
                  onChange={(e) => setResetPwd({ ...resetPwd, confirm: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-primary" disabled={resetMut.isPending} onClick={submitReset}>
                {resetMut.isPending ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-outline" onClick={() => setResetPwd(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign tenant modal */}
      {assign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAssign(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-base font-bold">{t('users.actions.addTenant')}</h2>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.form.tenantId')}</span>
              <select className="input" value={assign.tenantId} onChange={(e) => setAssign({ ...assign, tenantId: e.target.value })}>
                <option value="">انتخاب...</option>
                {(tenantsQ.data ?? []).map((opt) => (
                  <option key={tenantOptId(opt)} value={tenantOptId(opt)}>{opt.name}</option>
                ))}
              </select>
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-bold text-slate-600">{t('users.form.roleId')}</span>
              <select className="input" value={assign.roleId} onChange={(e) => setAssign({ ...assign, roleId: e.target.value })}>
                <option value="">انتخاب...</option>
                {(rolesQ.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn btn-outline" onClick={() => setAssign(null)}>{t('common.cancel')}</button>
              <button
                className="btn btn-primary"
                disabled={!assign.tenantId || !assign.roleId || assignMut.isPending}
                onClick={() => assignMut.mutate()}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission override editor */}
      {permUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto" onClick={() => setPermUser(null)}>
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-800">{t('users.permissions.title')} — {permUser.fullName}</h2>
                <p className="text-xs text-slate-500">{t('users.permissions.default')}</p>
              </div>
              <button className="btn btn-outline px-2 py-1.5" onClick={() => setPermUser(null)}>✕</button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                {t('users.permissions.tenant')}:
                <select
                  className="input py-1 text-xs font-normal"
                  value={permTenantId}
                  onChange={(e) => { setPermTenantId(e.target.value); setPermDraft({}); }}
                >
                  {permUser.tenants.map((tenant) => (
                    <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.tenantName} ({tenant.roleName})</option>
                  ))}
                </select>
              </label>
            </div>

            {permCatalogQ.isLoading || permDetailQ.isLoading ? (
              <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
            ) : (
              <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
                {(() => {
                  const existingOverrides = (permDetailQ.data?.overrides ?? []).filter((o) => o.tenantId === permTenantId);
                  const overrideMap = new Map(existingOverrides.map((o) => [o.permissionKey, o.allowed]));

                  return (permCatalogQ.data ?? []).map((mod) => (
                    <div key={mod.module}>
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{mod.moduleFa}</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {mod.items.map((perm) => {
                          const draft = permDraft[perm.key];
                          const current = draft !== undefined ? draft : overrideMap.get(perm.key);
                          return (
                            <div key={perm.key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-1.5">
                              <div className="flex-1 text-xs text-slate-700">{perm.name}</div>
                              <div className="flex gap-1">
                                <button
                                  title={t('users.permissions.grant')}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${current === true ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-emerald-100'}`}
                                  onClick={() => setPermDraft((d) => ({ ...d, [perm.key]: current === true ? undefined : true }))}
                                >✓</button>
                                <button
                                  title={t('users.permissions.revoke')}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${current === false ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-rose-100'}`}
                                  onClick={() => setPermDraft((d) => ({ ...d, [perm.key]: current === false ? undefined : false }))}
                                >✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">✓ = {t('users.permissions.grant')} &nbsp; ✕ = {t('users.permissions.revoke')} &nbsp; {t('users.permissions.default')}</span>
              <div className="flex gap-2">
                <button className="btn btn-outline text-xs" onClick={() => setPermDraft({})}>بازنشانی</button>
                <button
                  className="btn btn-primary text-xs"
                  disabled={savePermMut.isPending || Object.keys(permDraft).length === 0}
                  onClick={() => savePermMut.mutate()}
                >
                  {savePermMut.isPending ? t('common.saving') : t('users.permissions.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

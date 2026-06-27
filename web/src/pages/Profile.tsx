import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';

export function Profile() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
  });
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    setProfileSaving(true);
    try {
      await api.patch('/auth/me', { fullName: profileForm.fullName, phone: profileForm.phone || null });
      setProfileMsg('اطلاعات پروفایل با موفقیت ذخیره شد');
    } catch (err) {
      setProfileErr(apiError(err));
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwErr('رمز عبور جدید و تأیید آن یکسان نیستند');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwErr('رمز عبور جدید باید حداقل ۸ کاراکتر باشد');
      return;
    }
    setPwSaving(true);
    try {
      await api.patch('/auth/me/password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg('رمز عبور با موفقیت تغییر یافت');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwErr(apiError(err));
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <Layout title={t('profile.title')}>
      <div className="max-w-lg space-y-6">
        {/* Profile info */}
        <div className="card">
          <h2 className="mb-4 text-sm font-bold text-slate-700">{t('profile.editProfile')}</h2>
          <form onSubmit={saveProfile} className="space-y-3">
            {profileErr && <div className="text-sm text-rose-600">{profileErr}</div>}
            {profileMsg && <div className="text-sm text-emerald-600">{profileMsg}</div>}

            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t('profile.form.email')}</span>
              <input className="input mt-1 bg-slate-50" value={user?.email ?? ''} readOnly />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t('profile.form.fullName')}</span>
              <input
                className="input mt-1"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                required
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t('profile.form.phone')}</span>
              <input
                className="input mt-1"
                type="tel"
                dir="ltr"
                placeholder={t('common.optional')}
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              />
            </label>

            <button type="submit" className="btn btn-primary" disabled={profileSaving}>
              {profileSaving ? t('common.saving') : t('common.save')}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="card">
          <h2 className="mb-4 text-sm font-bold text-slate-700">{t('profile.changePassword')}</h2>
          <form onSubmit={changePassword} className="space-y-3">
            {pwErr && <div className="text-sm text-rose-600">{pwErr}</div>}
            {pwMsg && <div className="text-sm text-emerald-600">{pwMsg}</div>}

            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t('profile.form.currentPass')}</span>
              <input
                className="input mt-1"
                type="password"
                dir="ltr"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                required
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t('profile.form.newPass')}</span>
              <input
                className="input mt-1"
                type="password"
                dir="ltr"
                minLength={8}
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                required
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">{t('profile.form.confirmPass')}</span>
              <input
                className="input mt-1"
                type="password"
                dir="ltr"
                minLength={8}
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                required
              />
            </label>

            <button type="submit" className="btn btn-primary" disabled={pwSaving}>
              {pwSaving ? t('common.saving') : t('profile.changePassword')}
            </button>
          </form>
        </div>

        {/* Account info */}
        <div className="card">
          <h2 className="mb-3 text-sm font-bold text-slate-700">{t('profile.accountInfo.title')}</h2>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-400">{t('profile.accountInfo.role')}</span>
              <span>{user?.isSuperAdmin ? t('profile.accountInfo.superAdmin') : 'کاربر'}</span>
            </div>
            {user?.lastLoginAt && (
              <div className="flex justify-between">
                <span className="text-slate-400">{t('profile.accountInfo.lastLogin')}</span>
                <span dir="ltr">
                  {new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(user.lastLoginAt))}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

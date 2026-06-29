import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { apiError } from '../lib/api';

export function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user && !loading) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(apiError(err, t('auth.error')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sidebar-from to-sidebar-to p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 text-center">
          <div className="text-3xl">📦</div>
          <h1 className="mt-2 text-lg font-bold">{t('auth.subtitle')}</h1>
          <p className="text-xs text-slate-400">{t('auth.author')}</p>
          <p className="text-xs text-slate-400">{t('layout.version')}</p>
        </div>
        {error && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-bold text-slate-600">{t('auth.email')}</span>
          <input
            className="input"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-bold text-slate-600">{t('auth.password')}</span>
          <input
            className="input"
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="btn btn-primary w-full justify-center" disabled={submitting}>
          {submitting ? t('auth.loggingIn') : t('auth.loginBtn')}
        </button>
      </form>
    </div>
  );
}

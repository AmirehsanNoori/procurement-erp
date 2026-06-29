import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { NAV } from '../config/nav';
import { GlobalSearch } from './GlobalSearch';
import { setLang, currentLang } from '../i18n';

function TenantSwitcher() {
  const { tenants, currentTenantId, switchTenant } = useAuth();
  if (tenants.length <= 1) {
    return tenants.length === 1 ? (
      <span className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
        {tenants[0].name}
      </span>
    ) : null;
  }
  return (
    <select
      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
      value={currentTenantId ?? ''}
      onChange={(e) => switchTenant(e.target.value)}
    >
      {tenants.map((t) => (
        <option key={t.tenantId} value={t.tenantId}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('fa') ? 'fa' : 'en';
  return (
    <button
      className="btn btn-outline px-2.5 py-1 text-xs font-semibold tracking-wide"
      title={lang === 'fa' ? 'Switch to English' : 'تغییر به فارسی'}
      onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
    >
      {lang === 'fa' ? 'EN' : 'FA'}
    </button>
  );
}

function Sidebar({ open, onClose, notifCount }: { open: boolean; onClose: () => void; notifCount: number }) {
  const { can } = useAuth();
  const { t, i18n } = useTranslation();
  const isRtl = !i18n.language?.startsWith('en');
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.permission)) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed top-0 z-50 flex h-screen w-64 flex-col bg-gradient-to-b from-sidebar-from to-sidebar-to transition-transform ${
          isRtl
            ? `right-0 lg:translate-x-0 ${open ? 'translate-x-0' : 'translate-x-full'}`
            : `left-0 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`
        }`}
      >
        <div className="border-b border-white/10 px-4 py-4 text-center">
          <div className="text-2xl">📦</div>
          <h2 className="text-sm font-bold text-white">{t('layout.appTitle')}</h2>
          <p className="text-[10px] text-sky-300">{t('layout.author')}</p>
          <p className="text-[10px] text-sky-300">{t('layout.version')}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {groups.map((group) => (
            <div key={group.key ?? group.title}>
              <div className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wide text-sky-500">
                {t(`nav.groups.${group.key}`, group.title)}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-2 border-r-[3px] px-3 py-2 text-[13px] transition ${
                      isActive
                        ? 'border-blue-500 bg-blue-500/25 text-blue-300'
                        : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <span className="w-4 text-center">{item.icon}</span>
                  <span className="flex-1">{t(`nav.${item.key}`, item.label)}</span>
                  {item.key === 'notifications' && notifCount > 0 && (
                    <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                      {notifCount > 99 ? '99+' : notifCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

const BOTTOM_NAV = [
  { path: '/', label: 'داشبورد', icon: '🏠', permission: 'dashboard.view', end: true },
  { path: '/requests', label: 'درخواست‌ها', icon: '📋', permission: 'requests.view', end: false },
  { path: '/invoices', label: 'فاکتورها', icon: '🧾', permission: 'invoices.view', end: false },
  { path: '/budget', label: 'بودجه', icon: '💰', permission: 'monthly_budget.view', end: false },
  { path: '/suppliers', label: 'تأمین‌کنندگان', icon: '🏭', permission: 'suppliers.view', end: false },
];

function BottomNav() {
  const { can } = useAuth();
  const items = BOTTOM_NAV.filter((i) => can(i.permission));
  if (!items.length) return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 flex border-t border-slate-200 bg-white lg:hidden"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center py-2 text-[10px] gap-0.5 transition ${
              isActive ? 'text-indigo-600 font-bold' : 'text-slate-500'
            }`
          }
        >
          <span className="text-xl leading-none">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout, currentTenantId, can } = useAuth();
  const { t, i18n } = useTranslation();
  const isRtl = !i18n.language?.startsWith('en');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  const notifQ = useQuery({
    queryKey: ['notif-count', currentTenantId],
    queryFn: async () => {
      const res = await api.get(`/${currentTenantId}/notifications/count`);
      return (res.data.unreadCount ?? 0) as number;
    },
    enabled: Boolean(currentTenantId) && can('notification_center.view'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const notifCount = notifQ.data ?? 0;

  useEffect(() => {
    const lang = currentLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} notifCount={notifCount} />
      <div className={`flex min-h-screen flex-col ${isRtl ? 'lg:mr-64' : 'lg:ml-64'}`}>
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              className="btn btn-outline px-2 py-1 lg:hidden"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={t('layout.menu')}
            >
              ☰
            </button>
            <h1 className="text-base font-bold">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              className="btn btn-outline px-2.5 py-1 text-xs text-slate-500 flex items-center gap-1.5"
              onClick={() => setSearchOpen(true)}
              title={t('layout.searchHint')}
            >
              🔍 <kbd className="hidden sm:inline text-[10px] text-slate-400">Ctrl+K</kbd>
            </button>
            {can('notification_center.view') && (
              <Link
                to="/notifications"
                className="relative btn btn-outline px-2.5 py-1 text-xs flex items-center gap-1"
                title={t('layout.notifications')}
              >
                🔔
                {notifCount > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white leading-4 min-w-[16px] text-center">
                    {notifCount > 99 ? '99+' : notifCount}
                  </span>
                )}
              </Link>
            )}
            <TenantSwitcher />
            <Link to="/profile" className="hidden text-sm text-slate-500 hover:text-slate-800 sm:inline">
              {user?.fullName}
            </Link>
            <button
              className="btn btn-outline"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              {t('layout.logout')}
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 pb-20 lg:pb-4">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

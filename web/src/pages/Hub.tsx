import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';

/**
 * Lumentra One — the central module hub (App Launcher). After signing in and
 * choosing a company (tenant), the user lands here and enters the department
 * they have access to. Modules are shown/enabled by permission; not-yet-built
 * departments appear as "coming soon". Entitlement gating (TenantModule) will
 * hide modules a tenant hasn't licensed — added when that Core table lands.
 */

interface HubModule {
  key: string;
  title: string;
  icon: string;
  desc: string;
  accent: string; // tailwind gradient classes
  /** [permission, path] pairs tried in order; first the user holds is the entry. */
  entries?: [string, string][];
  soon?: boolean;
}

const MODULES: HubModule[] = [
  {
    key: 'procurement',
    title: 'تدارکات',
    icon: '📦',
    desc: 'درخواست خرید، استعلام و پیش‌فاکتور، تأمین‌کنندگان، فاکتور، پرداخت و بودجه',
    accent: 'from-blue-500 to-indigo-600',
    entries: [
      ['dashboard.view', '/dashboard'],
      ['control_center.view', '/control-center'],
      ['requests.view', '/requests'],
      ['quotations.view', '/quotations'],
      ['invoices.view', '/invoices'],
      ['suppliers.view', '/suppliers'],
      ['reports.view', '/reports'],
    ],
  },
  { key: 'warehouse', title: 'انبار', icon: '🏬', desc: 'موجودی، رسید و حواله، انبارها و گردش کالا', accent: 'from-amber-500 to-orange-600', entries: [['warehouse.view', '/inventory/stock']] },
  { key: 'contracts', title: 'قراردادها', icon: '📑', desc: 'چرخهٔ عمر قرارداد، متمم، ضمانت‌نامه، سررسید و تمدید', accent: 'from-emerald-500 to-teal-600', entries: [['contracts.view', '/contracts']] },
  { key: 'finance', title: 'مالی و حسابداری', icon: '💰', desc: 'کدینگ حساب‌ها، سند حسابداری دوطرفه، دفتر کل و تراز آزمایشی', accent: 'from-rose-500 to-pink-600', entries: [['finance.view', '/finance']] },
  { key: 'hr', title: 'منابع انسانی', icon: '👥', desc: 'پرسنل، حضور و غیاب، مرخصی و امور اداری کارکنان', accent: 'from-violet-500 to-purple-600', entries: [['hr.view', '/hr']] },
  { key: 'ticketing', title: 'تیکتینگ / IT', icon: '🎫', desc: 'پشتیبانی، درخواست‌های فنی و پیگیری', accent: 'from-cyan-500 to-sky-600', soon: true },
  { key: 'office', title: 'اتوماسیون اداری', icon: '✉️', desc: 'نامه‌نگاری، دبیرخانه، جلسات و آموزش', accent: 'from-slate-500 to-slate-700', soon: true },
  { key: 'ai', title: 'دستیار هوشمند', icon: '🤖', desc: 'جستجوی سازمانی، گزارش هوشمند و پیشنهادها', accent: 'from-fuchsia-500 to-indigo-600', soon: true },
];

export function Hub() {
  const { can, isModuleEnabled, currentTenantId, tenants, switchTenant } = useAuth();
  const navigate = useNavigate();
  // Tenant is chosen when entering an app (head-office users work across tenants).
  const [pendingEntry, setPendingEntry] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const tenantName = tenants.find((t) => t.tenantId === currentTenantId)?.name ?? '';
  const isAdmin = can('user_management.view');

  function enter(entry: string) {
    if (tenants.length > 1) setPendingEntry(entry);
    else navigate(entry);
  }

  async function chooseTenant(tenantId: string) {
    if (!pendingEntry) return;
    setSwitching(true);
    try {
      if (tenantId !== currentTenantId) await switchTenant(tenantId);
      const dest = pendingEntry;
      setPendingEntry(null);
      navigate(dest);
    } finally {
      setSwitching(false);
    }
  }

  function entryFor(m: HubModule): string | null {
    if (!m.entries) return null;
    const hit = m.entries.find(([perm]) => can(perm));
    return hit ? hit[1] : null;
  }

  // A module is shown as available only if the tenant is entitled to it AND the
  // user has permission to enter it. Entitlement is default-allow (see Core).
  const tiles = MODULES
    .filter((m) => isModuleEnabled(m.key))
    .map((m) => ({ m, entry: entryFor(m) }));

  return (
    <Layout title="مرکز ماژول‌ها">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">پلتفرم یکپارچهٔ لومنترا</h1>
        <p className="mt-1 text-sm text-slate-500">
          {tenantName ? <>شرکت فعال: <span className="font-semibold text-slate-700">{tenantName}</span> — </> : null}
          ماژولی را که به آن دسترسی دارید انتخاب کنید.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tiles.map(({ m, entry }) => {
          const enabled = !m.soon && !!entry;
          const noAccess = !m.soon && !entry;
          return (
            <button
              key={m.key}
              disabled={!enabled}
              onClick={() => entry && enter(entry)}
              className={`group relative flex flex-col items-start gap-3 rounded-2xl border p-5 text-right transition-all ${
                enabled
                  ? 'border-slate-200 bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg cursor-pointer'
                  : 'border-slate-100 bg-slate-50 cursor-not-allowed'
              }`}
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${m.accent} text-2xl text-white shadow ${enabled ? '' : 'opacity-50 grayscale'}`}>
                {m.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${enabled ? 'text-slate-800' : 'text-slate-400'}`}>{m.title}</span>
                  {m.soon && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">به‌زودی</span>}
                  {noAccess && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">بدون دسترسی</span>}
                </div>
                <p className={`mt-1 text-xs leading-5 ${enabled ? 'text-slate-500' : 'text-slate-400'}`}>{m.desc}</p>
              </div>
              {enabled && <span className="mt-1 text-xs font-semibold text-blue-600 group-hover:underline">ورود →</span>}
            </button>
          );
        })}

        {isAdmin && (
          <button
            onClick={() => enter('/users')}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-2xl text-white shadow">⚙️</div>
            <div className="flex-1">
              <span className="font-bold text-slate-800">مدیریت سیستم</span>
              <p className="mt-1 text-xs leading-5 text-slate-500">کاربران، نقش‌ها، دسترسی‌ها و شرکت‌ها</p>
            </div>
            <span className="mt-1 text-xs font-semibold text-blue-600 group-hover:underline">ورود →</span>
          </button>
        )}
      </div>

      {/* Choose which company to work in for this app (multi-tenant users). */}
      {pendingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !switching && setPendingEntry(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-800">انتخاب شرکت</h2>
            <p className="mt-1 mb-4 text-xs text-slate-500">برای ورود به این بخش، شرکت موردنظر را انتخاب کنید.</p>
            <div className="space-y-2">
              {tenants.map((tn) => (
                <button
                  key={tn.tenantId}
                  disabled={switching}
                  onClick={() => chooseTenant(tn.tenantId)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-right text-sm transition hover:bg-slate-50 disabled:opacity-50 ${
                    tn.tenantId === currentTenantId ? 'border-blue-300 bg-blue-50' : 'border-slate-200'
                  }`}
                >
                  <span className="font-semibold text-slate-700">🏢 {tn.name}</span>
                  {tn.tenantId === currentTenantId && <span className="text-[10px] text-blue-600">فعلی</span>}
                </button>
              ))}
            </div>
            <button className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-50" disabled={switching} onClick={() => setPendingEntry(null)}>
              انصراف
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}

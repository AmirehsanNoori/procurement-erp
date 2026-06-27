import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney, faDate } from '../lib/format';

interface PlanDetail {
  label: string;
  maxUsers: number;
  maxRequests: number;
  priceMonthly: number;
  features: string[];
}

interface SubInfo {
  tenant: {
    id: string;
    name: string;
    plan: string;
    planLabel: string;
    planExpiresAt: string | null;
    trialEndsAt: string | null;
    maxUsers: number;
    contactEmail: string | null;
    billingName: string | null;
    isExpired: boolean;
    userCount: number;
  };
  planDetails: PlanDetail;
  allPlans: Record<string, PlanDetail>;
}

interface BillingInvoice {
  id: string;
  plan: string;
  amount: string;
  currency: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
  createdAt: string;
}

const PLAN_COLOR: Record<string, string> = {
  free: 'border-slate-200 bg-slate-50',
  pro: 'border-indigo-400 bg-indigo-50',
  enterprise: 'border-amber-400 bg-amber-50',
};

const PLAN_BADGE: Record<string, string> = {
  free: 'bg-slate-200 text-slate-700',
  pro: 'bg-indigo-500 text-white',
  enterprise: 'bg-amber-500 text-white',
};

export function Subscription() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [editContact, setEditContact] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [billingName, setBillingName] = useState('');

  const { data, isLoading } = useQuery<SubInfo>({
    queryKey: ['billing', tid],
    queryFn: async () => (await api.get(`/${tid}/billing`)).data,
    enabled: Boolean(tid),
  });

  const invQ = useQuery<{ invoices: BillingInvoice[] }>({
    queryKey: ['billing-invoices', tid],
    queryFn: async () => (await api.get(`/${tid}/billing/invoices`)).data,
    enabled: Boolean(tid),
  });

  const upgradeMut = useMutation({
    mutationFn: async (targetPlan: string) =>
      (await api.post(`/${tid}/billing/upgrade`, { targetPlan })).data,
    onSuccess: (res) => {
      alert(res.message ?? 'ارتقاء انجام شد');
      qc.invalidateQueries({ queryKey: ['billing', tid] });
      qc.invalidateQueries({ queryKey: ['billing-invoices', tid] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'خطا';
      alert(msg);
    },
  });

  const contactMut = useMutation({
    mutationFn: async () =>
      (await api.patch(`/${tid}/billing`, { contactEmail, billingName })).data,
    onSuccess: () => {
      setEditContact(false);
      qc.invalidateQueries({ queryKey: ['billing', tid] });
    },
  });

  if (isLoading || !data) {
    return <Layout title="اشتراک و پلن"><div className="py-12 text-center text-slate-400">در حال بارگذاری...</div></Layout>;
  }

  const { tenant, planDetails, allPlans } = data;

  return (
    <Layout title="اشتراک و پلن">
      {/* Current plan banner */}
      <div className={`card mb-4 border-2 ${PLAN_COLOR[tenant.plan] ?? 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${PLAN_BADGE[tenant.plan] ?? 'bg-slate-200 text-slate-700'}`}>
                {planDetails.label}
              </span>
              {tenant.isExpired && (
                <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-xs font-bold">منقضی شده</span>
              )}
              {tenant.trialEndsAt && !tenant.isExpired && (
                <span className="rounded-full bg-sky-100 text-sky-700 px-2 py-0.5 text-xs">
                  آزمایشی تا {faDate(tenant.trialEndsAt)}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-800">{tenant.name}</h2>
            <div className="text-sm text-slate-500 mt-1">
              {tenant.userCount} از {tenant.maxUsers === 9999 ? '∞' : tenant.maxUsers} کاربر فعال
            </div>
            {tenant.planExpiresAt && (
              <div className="text-xs text-slate-400 mt-1">
                انقضای پلن: {faDate(tenant.planExpiresAt)}
              </div>
            )}
          </div>
          <div className="text-left">
            <div className="text-2xl font-bold text-slate-800">
              {planDetails.priceMonthly === 0 ? 'رایگان' : faMoney(planDetails.priceMonthly)}
            </div>
            {planDetails.priceMonthly > 0 && <div className="text-xs text-slate-400">ریال / ماه</div>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {planDetails.features.map((f) => (
            <span key={f} className="text-xs bg-white/70 border border-current/10 rounded px-2 py-0.5 text-slate-600">
              ✓ {f}
            </span>
          ))}
        </div>
      </div>

      {/* Plan comparison */}
      <div className="card mb-4">
        <h2 className="text-sm font-bold text-slate-700 mb-4">انتخاب پلن</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(allPlans).map(([key, plan]) => {
            const isActive = tenant.plan === key;
            return (
              <div key={key} className={`rounded-xl border-2 p-4 flex flex-col gap-3 ${
                isActive ? 'border-indigo-500 shadow-sm' : 'border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-base ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                    {plan.label}
                  </span>
                  {isActive && <span className="text-xs text-indigo-600 font-bold">پلن فعلی</span>}
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {plan.priceMonthly === 0 ? 'رایگان' : faMoney(plan.priceMonthly)}
                  {plan.priceMonthly > 0 && <span className="text-xs text-slate-400 font-normal"> ریال/ماه</span>}
                </div>
                <ul className="space-y-1.5 flex-1">
                  <li className="text-xs text-slate-600">
                    👥 {plan.maxUsers === -1 ? 'کاربران نامحدود' : `تا ${plan.maxUsers} کاربر`}
                  </li>
                  <li className="text-xs text-slate-600">
                    📋 {plan.maxRequests === -1 ? 'درخواست نامحدود' : `تا ${plan.maxRequests} درخواست`}
                  </li>
                  {plan.features.map((f) => (
                    <li key={f} className="text-xs text-slate-500">✓ {f}</li>
                  ))}
                </ul>
                {!isActive && (
                  <button
                    className="btn btn-primary text-xs w-full justify-center"
                    disabled={upgradeMut.isPending}
                    onClick={() => {
                      if (confirm(`آیا می‌خواهید پلن را به "${plan.label}" تغییر دهید؟`)) {
                        upgradeMut.mutate(key);
                      }
                    }}
                  >
                    {upgradeMut.isPending ? 'در حال ارتقاء...' : key === 'free' ? 'بازگشت به رایگان' : `ارتقاء به ${plan.label}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Contact info */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700">اطلاعات تماس صورت‌حساب</h2>
            {!editContact && (
              <button className="btn btn-outline text-xs"
                onClick={() => {
                  setContactEmail(tenant.contactEmail ?? '');
                  setBillingName(tenant.billingName ?? '');
                  setEditContact(true);
                }}>
                ویرایش
              </button>
            )}
          </div>
          {editContact ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">نام صورت‌حساب</label>
                <input className="input" value={billingName} onChange={(e) => setBillingName(e.target.value)} placeholder="نام شرکت یا شخص" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">ایمیل تماس</label>
                <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="billing@example.com" />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary text-xs" disabled={contactMut.isPending} onClick={() => contactMut.mutate()}>
                  ذخیره
                </button>
                <button className="btn btn-outline text-xs" onClick={() => setEditContact(false)}>انصراف</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">نام</span>
                <span className="font-medium">{tenant.billingName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ایمیل</span>
                <span className="font-medium">{tenant.contactEmail || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">پلن جاری</span>
                <span className="font-bold text-indigo-700">{planDetails.label}</span>
              </div>
            </div>
          )}
        </div>

        {/* Billing history */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">تاریخچه صورت‌حساب‌ها</h2>
          {invQ.data?.invoices.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">هیچ صورت‌حسابی وجود ندارد</div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-56">
              {invQ.data?.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                  <div>
                    <div className="font-medium text-slate-700">{inv.notes ?? `پلن ${inv.plan}`}</div>
                    <div className="text-slate-400">{faDate(inv.createdAt)}</div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-slate-700">{faMoney(Number(inv.amount))} {inv.currency}</div>
                    <div className={`text-[10px] ${inv.status === 'پرداخت شده' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {inv.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

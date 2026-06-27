import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney, JMONTHS } from '../lib/format';

interface AnalyticsData {
  monthlyPayments: Record<string, number>;
  monthlyInvoices: Record<string, number>;
  aging: { d0_30: number; d31_60: number; d61_90: number; d90plus: number };
  budgetTrend: Array<{
    key: string;
    yearJalali: number;
    monthJalali: number;
    name: string | null;
    approved: number;
    actual: number;
    reserved: number;
    remaining: number;
    burnPercent: number;
  }>;
  forecast: {
    avgMonthlySpend: number;
    totalApproved: number;
    totalSpent: number;
    totalRemaining: number;
    monthsToExhaust: number | null;
  };
  topCategories: Array<{ category: string; total: number }>;
  conversionRate: { total: number; converted: number; rate: number };
}

function MonthBar({
  label,
  value,
  max,
  color,
  sub,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sub?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 text-[10px] text-slate-500 text-left shrink-0">{label}</div>
      <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden relative">
        <div
          className={`h-full rounded ${color} transition-all`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="w-28 text-[10px] text-slate-700 text-left shrink-0 leading-tight">
        <div>{faMoney(value)}</div>
        {sub && <div className="text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

function monthLabel(key: string): string {
  const [, m] = key.split('-');
  return JMONTHS[Number(m)] ?? key;
}

export function Analytics() {
  const { currentTenantId } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics', tid],
    queryFn: async () => (await api.get(`/${tid}/analytics`)).data,
    enabled: Boolean(tid),
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <Layout title={t('analytics.title')}>
        <div className="py-12 text-center text-slate-400">{t('common.loading')}</div>
      </Layout>
    );
  }

  if (!data) return <Layout title={t('analytics.title')}><div /></Layout>;

  const f = data.forecast;
  const paymentMonths = Object.entries(data.monthlyPayments).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  const maxPayment = Math.max(...paymentMonths.map(([, v]) => v), 1);

  const invoiceMonths = Object.entries(data.monthlyInvoices).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  const maxInvoice = Math.max(...invoiceMonths.map(([, v]) => v), 1);

  const maxCategory = Math.max(...data.topCategories.map((c) => c.total), 1);

  const totalAging = data.aging.d0_30 + data.aging.d31_60 + data.aging.d61_90 + data.aging.d90plus;

  return (
    <Layout title={t('analytics.title')}>
      {/* Forecast banner */}
      <div className="card mb-4 border-r-4 border-blue-400">
        <h2 className="text-sm font-bold text-slate-700 mb-3">{t('analytics.forecast.title')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="text-center">
            <div className="text-xs text-slate-500">{t('analytics.forecast.monthlyAvg')}</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{faMoney(f.avgMonthlySpend)}</div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">{t('analytics.forecast.spent')}</div>
            <div className="text-xl font-bold text-blue-700 mt-1">{faMoney(f.totalSpent)}</div>
            <div className="text-[10px] text-slate-400">از {faMoney(f.totalApproved)} تصویبی</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">{t('analytics.forecast.remaining')}</div>
            <div className={`text-xl font-bold mt-1 ${f.totalRemaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {faMoney(f.totalRemaining)}
            </div>
            <div className="text-[10px] text-slate-400">{t('common.rial')}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">{t('analytics.forecast.monthsLeft')}</div>
            <div className={`text-xl font-bold mt-1 ${f.monthsToExhaust !== null && f.monthsToExhaust <= 3 ? 'text-rose-600' : 'text-slate-800'}`}>
              {f.monthsToExhaust !== null
                ? f.monthsToExhaust <= 0
                  ? 'اتمام یافته'
                  : `${f.monthsToExhaust} ماه`
                : t('analytics.forecast.unlimited')}
            </div>
            <div className="text-[10px] text-slate-400">با نرخ فعلی</div>
          </div>
        </div>

        {/* Overall burn bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>درصد مصرف کل</span>
            <span className="font-bold">
              {f.totalApproved > 0 ? Math.round((f.totalSpent / f.totalApproved) * 100) : 0}٪
            </span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full"
              style={{ width: `${Math.min(f.totalApproved > 0 ? (f.totalSpent / f.totalApproved) * 100 : 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        {/* Monthly payment trend */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t('analytics.sections.paymentTrend')}</h2>
          {paymentMonths.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">{t('common.noData')}</div>
          ) : (
            <div className="space-y-2">
              {paymentMonths.map(([key, value]) => (
                <MonthBar
                  key={key}
                  label={monthLabel(key)}
                  value={value}
                  max={maxPayment}
                  color="bg-emerald-400"
                />
              ))}
            </div>
          )}
        </div>

        {/* Monthly invoice creation */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t('analytics.sections.invoiceTrend')}</h2>
          {invoiceMonths.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">{t('common.noData')}</div>
          ) : (
            <div className="space-y-2">
              {invoiceMonths.map(([key, value]) => (
                <MonthBar
                  key={key}
                  label={monthLabel(key)}
                  value={value}
                  max={maxInvoice}
                  color="bg-violet-400"
                  sub={`${value} فاکتور`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        {/* Invoice aging */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t('analytics.sections.aging')}</h2>
          {totalAging === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">{t('common.noData')}</div>
          ) : (
            <div className="space-y-3">
              {[
                { label: t('analytics.aging.d0_30'), value: data.aging.d0_30, color: 'bg-emerald-400' },
                { label: t('analytics.aging.d31_60'), value: data.aging.d31_60, color: 'bg-amber-400' },
                { label: t('analytics.aging.d61_90'), value: data.aging.d61_90, color: 'bg-orange-400' },
                { label: t('analytics.aging.d90plus'), value: data.aging.d90plus, color: 'bg-rose-500' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-bold text-slate-700">{value} فاکتور</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{ width: `${totalAging > 0 ? (value / totalAging) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top categories */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t('analytics.sections.categories')}</h2>
          {data.topCategories.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">{t('common.noData')}</div>
          ) : (
            <div className="space-y-2">
              {data.topCategories.map(({ category, total }) => (
                <MonthBar
                  key={category}
                  label={category}
                  value={total}
                  max={maxCategory}
                  color="bg-blue-400"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Conversion rate + budget trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Quotation conversion rate */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">{t('analytics.sections.conversion')}</h2>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-700">{data.conversionRate.rate}٪</div>
              <div className="text-xs text-slate-500 mt-1">نرخ تبدیل</div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">کل پیش‌فاکتورها</span>
                <span className="font-bold">{data.conversionRate.total}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">تبدیل‌شده به فاکتور</span>
                <span className="font-bold text-emerald-600">{data.conversionRate.converted}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">تبدیل‌نشده</span>
                <span className="font-bold text-slate-400">
                  {data.conversionRate.total - data.conversionRate.converted}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${data.conversionRate.rate}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Budget month-by-month */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-3">نرخ مصرف بودجه‌ها</h2>
          {data.budgetTrend.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">{t('common.noData')}</div>
          ) : (
            <div className="space-y-2">
              {data.budgetTrend.map((b) => {
                const label = b.name ?? `${JMONTHS[b.monthJalali] ?? b.monthJalali} ${b.yearJalali}`;
                return (
                  <div key={b.key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">{label}</span>
                      <span className={`font-bold ${b.burnPercent >= 100 ? 'text-rose-600' : b.burnPercent >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {b.burnPercent}٪
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${b.burnPercent >= 100 ? 'bg-rose-500' : b.burnPercent >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(b.burnPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

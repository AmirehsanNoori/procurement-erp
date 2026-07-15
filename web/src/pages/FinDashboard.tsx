import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faDate, faMoney } from '../lib/format';

interface Recent { id: string; number: number; date: string; description: string | null; status: string; }
interface Overview {
  cashTotal: number; payablesOutstanding: number; income: number; expense: number; netIncome: number;
  draftCount: number; postedCount: number; accountCount: number;
  fiscalYear: { title: string; status: string } | null; recent: Recent[];
}
const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', posted: 'قطعی', void: 'باطل' };
const STATUS_COLOR: Record<string, string> = { draft: 'bg-slate-100 text-slate-600', posted: 'bg-emerald-50 text-emerald-700', void: 'bg-rose-50 text-rose-600' };

function Kpi({ label, value, tone, to }: { label: string; value: string; tone?: string; to?: string }) {
  const inner = (
    <div className="card h-full transition hover:shadow-md">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tone ?? 'text-slate-800'}`}>{value}</div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export function FinDashboard() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data, isLoading } = useQuery({
    queryKey: ['fin-overview', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/overview`)).data as Overview,
    enabled: !!tid,
  });

  return (
    <Layout title="داشبورد مالی">
      {isLoading || !data ? <div className="card p-8 text-center text-slate-400">در حال بارگذاری...</div> : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="موجودی نقد و بانک" value={faMoney(data.cashTotal)} tone="text-blue-700" to="/finance/cash-position" />
            <Kpi label="بدهی به تأمین‌کنندگان" value={faMoney(data.payablesOutstanding)} tone="text-rose-600" to="/finance/payables" />
            <Kpi label={`${data.netIncome >= 0 ? 'سود' : 'زیان'} دوره${data.fiscalYear ? ` (${data.fiscalYear.title})` : ''}`} value={faMoney(Math.abs(data.netIncome))} tone={data.netIncome >= 0 ? 'text-emerald-600' : 'text-rose-600'} to="/finance/statements" />
            <Kpi label="اسناد پیش‌نویس" value={`${data.draftCount}`} tone={data.draftCount > 0 ? 'text-amber-600' : 'text-slate-800'} to="/finance/journals" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label="درآمد دوره" value={faMoney(data.income)} tone="text-emerald-600" />
            <Kpi label="هزینه دوره" value={faMoney(data.expense)} tone="text-amber-700" />
            <Kpi label="اسناد قطعی / حساب‌ها" value={`${data.postedCount} / ${data.accountCount}`} />
          </div>

          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">آخرین اسناد</h2>
              <Link to="/finance/journals" className="text-xs text-blue-600 hover:underline">همه اسناد →</Link>
            </div>
            {data.recent.length === 0 ? <div className="py-6 text-center text-sm text-slate-400">سندی ثبت نشده.</div> : (
              <table className="w-full text-sm">
                <tbody>
                  {data.recent.map((j) => (
                    <tr key={j.id} className="border-t border-slate-50">
                      <td className="py-2 font-bold">{j.number}</td>
                      <td className="py-2 text-xs text-slate-500">{faDate(j.date)}</td>
                      <td className="py-2">{j.description ?? '—'}</td>
                      <td className="py-2 text-left"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[j.status]}`}>{STATUS_FA[j.status] ?? j.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {data.fiscalYear && (
            <div className="text-xs text-slate-400">سال مالی جاری: <span className="font-semibold text-slate-600">{data.fiscalYear.title}</span> ({data.fiscalYear.status === 'open' ? 'باز' : 'بسته'})</div>
          )}
        </div>
      )}
    </Layout>
  );
}

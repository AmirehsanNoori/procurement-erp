import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface Overview { total: number; active: number; onLeave: number; deptCount: number; pendingLeaves: number; }

function Kpi({ label, value, tone, to }: { label: string; value: string | number; tone?: string; to?: string }) {
  const inner = <div className="card h-full transition hover:shadow-md"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? 'text-slate-800'}`}>{value}</div></div>;
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export function HrDashboard() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data } = useQuery({ queryKey: ['hr-overview', tid], queryFn: async () => (await api.get(`/${tid}/hr/overview`)).data as Overview, enabled: !!tid });
  return (
    <Layout title="داشبورد منابع انسانی">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="کل کارکنان" value={data?.total ?? 0} to="/hr/employees" />
        <Kpi label="فعال" value={data?.active ?? 0} tone="text-emerald-600" to="/hr/employees" />
        <Kpi label="در مرخصی" value={data?.onLeave ?? 0} tone="text-amber-600" to="/hr/employees" />
        <Kpi label="دپارتمان‌ها" value={data?.deptCount ?? 0} to="/hr/departments" />
        <Kpi label="مرخصی در انتظار" value={data?.pendingLeaves ?? 0} tone={(data?.pendingLeaves ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800'} to="/hr/leaves" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link to="/hr/employees" className="btn btn-outline">👥 کارکنان</Link>
        <Link to="/hr/leaves" className="btn btn-outline">🌴 مرخصی‌ها</Link>
        <Link to="/hr/attendance" className="btn btn-outline">🕐 حضور و غیاب</Link>
        <Link to="/hr/departments" className="btn btn-outline">🏢 دپارتمان‌ها</Link>
      </div>
    </Layout>
  );
}

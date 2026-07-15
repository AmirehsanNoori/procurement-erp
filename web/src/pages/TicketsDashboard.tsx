import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface Overview { open: number; inProgress: number; resolved: number; closed: number; urgent: number; }

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="card h-full"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? 'text-slate-800'}`}>{value}</div></div>;
}

export function TicketsDashboard() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data } = useQuery({ queryKey: ['tickets-overview', tid], queryFn: async () => (await api.get(`/${tid}/ticketing/overview`)).data as Overview, enabled: !!tid });
  return (
    <Layout title="داشبورد تیکتینگ">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="باز" value={data?.open ?? 0} tone="text-blue-700" />
        <Kpi label="در حال بررسی" value={data?.inProgress ?? 0} tone="text-amber-600" />
        <Kpi label="حل‌شده" value={data?.resolved ?? 0} tone="text-emerald-600" />
        <Kpi label="بسته‌شده" value={data?.closed ?? 0} />
        <Kpi label="فوری (باز)" value={data?.urgent ?? 0} tone={(data?.urgent ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800'} />
      </div>
      <div className="mt-4"><Link to="/ticketing/list" className="btn btn-primary">مشاهدهٔ همهٔ تیکت‌ها →</Link></div>
    </Layout>
  );
}

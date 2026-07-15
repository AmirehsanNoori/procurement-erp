import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface Overview { incoming: number; outgoing: number; meetings: number; openActions: number; }

function Kpi({ label, value, tone, to }: { label: string; value: number; tone?: string; to?: string }) {
  const inner = <div className="card h-full transition hover:shadow-md"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? 'text-slate-800'}`}>{value}</div></div>;
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export function OfficeDashboard() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data } = useQuery({ queryKey: ['office-overview', tid], queryFn: async () => (await api.get(`/${tid}/office/overview`)).data as Overview, enabled: !!tid });
  return (
    <Layout title="داشبورد اتوماسیون اداری">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="نامه‌های وارده" value={data?.incoming ?? 0} tone="text-blue-700" to="/office/letters" />
        <Kpi label="نامه‌های صادره" value={data?.outgoing ?? 0} tone="text-emerald-600" to="/office/letters" />
        <Kpi label="جلسات" value={data?.meetings ?? 0} to="/office/meetings" />
        <Kpi label="اقدامات باز" value={data?.openActions ?? 0} tone={(data?.openActions ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800'} to="/office/meetings" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link to="/office/letters" className="btn btn-outline">✉️ دبیرخانه</Link>
        <Link to="/office/meetings" className="btn btn-outline">📅 جلسات</Link>
      </div>
    </Layout>
  );
}

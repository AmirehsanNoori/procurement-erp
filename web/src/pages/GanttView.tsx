import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface GanttRequest {
  id: string;
  requestNumber: string;
  description: string | null;
  status: string;
  requestDate: string | null;
  followUpDate: string | null;
  deliveryDate: string | null;
  estimatedAmount: number | null;
  supplier: string | null;
  quotationCount: number;
  invoiceCount: number;
  firstQuotationDate: string | null;
  firstInvoiceDate: string | null;
  lastPaymentDate: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  'جدید': '#6366f1',
  'در بررسی': '#f59e0b',
  'تأیید شده': '#10b981',
  'در انتظار پیش‌فاکتور': '#3b82f6',
  'سفارش داده شده': '#8b5cf6',
  'تحویل شده': '#059669',
  'کنسل شده': '#ef4444',
};

const PHASES = [
  { key: 'request', label: 'درخواست', color: '#6366f1' },
  { key: 'quotation', label: 'پیش‌فاکتور', color: '#f59e0b' },
  { key: 'invoice', label: 'فاکتور', color: '#3b82f6' },
  { key: 'payment', label: 'پرداخت', color: '#10b981' },
];

function toDay(base: Date, iso: string | null): number {
  if (!iso) return -1;
  return Math.round((new Date(iso).getTime() - base.getTime()) / 86400000);
}

export function GanttView() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId ?? '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewDays, setViewDays] = useState(90);

  const requestsQ = useQuery({
    queryKey: ['gantt-requests', tid],
    queryFn: async () => {
      const res = await api.get(`/${tid}/requests/gantt`, { params: { archived: false } });
      const reqs = res.data.requests as { id: string; requestNumber: string; description: string | null; status: string; requestDate: string | null; followUpDate: string | null; deliveryDate: string | null; estimatedAmount: number | null; supplier: { name: string } | null; quotations: { date: string | null }[]; invoices: { invoiceDate: string | null; payments: { paymentDate: string | null }[] }[] }[];
      return reqs.map((r): GanttRequest => {
        const firstQuote = r.quotations?.length > 0 ? r.quotations.reduce<string | null>((min, q) => {
          if (!q.date) return min;
          if (!min) return q.date;
          return q.date < min ? q.date : min;
        }, null) : null;
        const firstInv = r.invoices?.length > 0 ? r.invoices.reduce<string | null>((min, inv) => {
          if (!inv.invoiceDate) return min;
          if (!min) return inv.invoiceDate;
          return inv.invoiceDate < min ? inv.invoiceDate : min;
        }, null) : null;
        const lastPay = r.invoices?.flatMap((inv) => inv.payments ?? []).filter((p) => p.paymentDate).reduce<string | null>((max, p) => {
          if (!p.paymentDate) return max;
          if (!max) return p.paymentDate;
          return p.paymentDate > max ? p.paymentDate : max;
        }, null) ?? null;
        return {
          id: r.id, requestNumber: r.requestNumber, description: r.description,
          status: r.status, requestDate: r.requestDate, followUpDate: r.followUpDate, deliveryDate: r.deliveryDate,
          estimatedAmount: r.estimatedAmount ? Number(r.estimatedAmount) : null,
          supplier: r.supplier?.name ?? null,
          quotationCount: r.quotations?.length ?? 0, invoiceCount: r.invoices?.length ?? 0,
          firstQuotationDate: firstQuote, firstInvoiceDate: firstInv, lastPaymentDate: lastPay,
        };
      });
    },
    enabled: !!tid,
  });

  const allRequests = requestsQ.data ?? [];
  const filtered = allRequests.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search && !r.requestNumber.includes(search) && !(r.description ?? '').includes(search)) return false;
    return true;
  });

  // Determine Gantt date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // endDate is the right boundary (used implicitly by totalDays)
  void new Date(today.getTime() + viewDays * 86400000);

  // Base is 30 days before today
  const base = new Date(today.getTime() - 30 * 86400000);
  const totalDays = viewDays + 30;

  const BAR_HEIGHT = 36;
  const ROW_HEIGHT = 44;
  const LABEL_W = 180;
  const DAY_W = 10;
  const CHART_W = totalDays * DAY_W;

  // Today line position
  const todayX = LABEL_W + 30 * DAY_W;

  const STATUSES = [...new Set(allRequests.map((r) => r.status))];

  return (
    <Layout title="نمودار گانت فرآیند خرید">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">نمودار گانت فرآیند خرید</h1>
          <p className="text-sm text-slate-500 mt-1">نمای بصری از مراحل درخواست تا پرداخت</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3">
          <input
            className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="جستجوی شماره درخواست..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">همه وضعیت‌ها</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            value={viewDays}
            onChange={(e) => setViewDays(Number(e.target.value))}
          >
            <option value={60}>۶۰ روز آینده</option>
            <option value={90}>۹۰ روز آینده</option>
            <option value={180}>۶ ماه آینده</option>
            <option value={365}>۱ سال آینده</option>
          </select>
        </div>

        {/* Legend */}
        <div className="flex gap-4 flex-wrap">
          {PHASES.map((p) => (
            <div key={p.key} className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="w-4 h-3 rounded" style={{ backgroundColor: p.color }} />
              {p.label}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <div className="w-0.5 h-4 bg-rose-500" />
            امروز
          </div>
        </div>

        {/* Gantt Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          {requestsQ.isLoading ? (
            <div className="text-center py-12 text-slate-400">در حال بارگذاری...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">هیچ درخواستی یافت نشد</div>
          ) : (
            <svg width={LABEL_W + CHART_W} height={(filtered.length + 1) * ROW_HEIGHT + 30}>
              {/* Header row */}
              <rect x={0} y={0} width={LABEL_W + CHART_W} height={30} fill="#f8fafc" />
              <line x1={LABEL_W} y1={0} x2={LABEL_W} y2={(filtered.length + 1) * ROW_HEIGHT + 30} stroke="#e2e8f0" />
              {/* Month/week markers */}
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = new Date(base.getTime() + i * 86400000);
                if (d.getDate() === 1) {
                  const x = LABEL_W + i * DAY_W;
                  return (
                    <g key={i}>
                      <line x1={x} y1={0} x2={x} y2={(filtered.length + 1) * ROW_HEIGHT + 30} stroke="#e2e8f0" strokeDasharray="4,2" />
                      <text x={x + 2} y={16} fontSize={9} fill="#94a3b8">{new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(d)}</text>
                    </g>
                  );
                }
                return null;
              })}
              {/* Today line */}
              <line x1={todayX} y1={0} x2={todayX} y2={(filtered.length + 1) * ROW_HEIGHT + 30} stroke="#ef4444" strokeWidth={1.5} />
              <text x={todayX + 2} y={24} fontSize={9} fill="#ef4444">امروز</text>

              {/* Rows */}
              {filtered.map((r, rowIdx) => {
                const y = 30 + rowIdx * ROW_HEIGHT;
                const centerY = y + ROW_HEIGHT / 2;

                // Phase positions
                const reqStart = r.requestDate ? toDay(base, r.requestDate) : null;
                const quoteStart = r.firstQuotationDate ? toDay(base, r.firstQuotationDate) : null;
                const invStart = r.firstInvoiceDate ? toDay(base, r.firstInvoiceDate) : null;
                const payEnd = r.lastPaymentDate ? toDay(base, r.lastPaymentDate) : null;
                const delivEnd = r.deliveryDate ? toDay(base, r.deliveryDate) : null;

                return (
                  <g key={r.id}>
                    {/* Alternating row bg */}
                    <rect x={0} y={y} width={LABEL_W + CHART_W} height={ROW_HEIGHT} fill={rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc'} />

                    {/* Label */}
                    <text x={4} y={centerY - 4} fontSize={10} fontWeight="600" fill="#334155">{r.requestNumber}</text>
                    <text x={4} y={centerY + 8} fontSize={8} fill="#94a3b8">{r.status}</text>
                    {/* Status dot */}
                    <circle cx={LABEL_W - 10} cy={centerY} r={4} fill={STATUS_COLOR[r.status] ?? '#94a3b8'} />

                    {/* Phase 1: Request */}
                    {reqStart !== null && reqStart >= 0 && reqStart < totalDays && (
                      <rect
                        x={LABEL_W + reqStart * DAY_W}
                        y={centerY - BAR_HEIGHT / 4}
                        width={Math.max(DAY_W, (quoteStart ?? reqStart + 5) - reqStart) * DAY_W}
                        height={BAR_HEIGHT / 2}
                        rx={3}
                        fill={PHASES[0].color}
                        opacity={0.8}
                      />
                    )}

                    {/* Phase 2: Quotation */}
                    {quoteStart !== null && quoteStart >= 0 && quoteStart < totalDays && (
                      <rect
                        x={LABEL_W + quoteStart * DAY_W}
                        y={centerY - BAR_HEIGHT / 4}
                        width={Math.max(DAY_W, (invStart ?? quoteStart + 5) - quoteStart) * DAY_W}
                        height={BAR_HEIGHT / 2}
                        rx={3}
                        fill={PHASES[1].color}
                        opacity={0.8}
                      />
                    )}

                    {/* Phase 3: Invoice */}
                    {invStart !== null && invStart >= 0 && invStart < totalDays && (
                      <rect
                        x={LABEL_W + invStart * DAY_W}
                        y={centerY - BAR_HEIGHT / 4}
                        width={Math.max(DAY_W, (payEnd ?? invStart + 7) - invStart) * DAY_W}
                        height={BAR_HEIGHT / 2}
                        rx={3}
                        fill={PHASES[2].color}
                        opacity={0.8}
                      />
                    )}

                    {/* Phase 4: Payment dot */}
                    {payEnd !== null && payEnd >= 0 && payEnd < totalDays && (
                      <circle
                        cx={LABEL_W + payEnd * DAY_W + 4}
                        cy={centerY}
                        r={5}
                        fill={PHASES[3].color}
                      />
                    )}

                    {/* Delivery date marker */}
                    {delivEnd !== null && delivEnd >= 0 && delivEnd < totalDays && (
                      <g>
                        <line
                          x1={LABEL_W + delivEnd * DAY_W}
                          y1={y + 4}
                          x2={LABEL_W + delivEnd * DAY_W}
                          y2={y + ROW_HEIGHT - 4}
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="3,2"
                        />
                      </g>
                    )}

                    {/* Row separator */}
                    <line x1={0} y1={y + ROW_HEIGHT} x2={LABEL_W + CHART_W} y2={y + ROW_HEIGHT} stroke="#e2e8f0" />
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Summary */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {STATUSES.filter((s) => !statusFilter || s === statusFilter).map((status) => {
              const count = filtered.filter((r) => r.status === status).length;
              if (count === 0) return null;
              return (
                <div key={status} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] ?? '#94a3b8' }} />
                    <span className="text-xs text-slate-500">{status}</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">{count}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faDate } from '../lib/format';

interface DueDateItem {
  entityType: 'invoice' | 'quotation' | 'request';
  entityId: string;
  label: string;
  supplier: string;
  dateType: string;
  dateTypeLabel: string;
  date: string;
  daysFromNow: number;
  group: string;
  status: string;
}

interface DueDatesData {
  grouped: {
    overdue: DueDateItem[];
    today: DueDateItem[];
    this_week: DueDateItem[];
    this_month: DueDateItem[];
    future: DueDateItem[];
  };
  total: number;
  overdueCount: number;
  todayCount: number;
}

const ENTITY_ICON: Record<string, string> = {
  invoice: '📄',
  quotation: '📋',
  request: '📝',
};

const DATE_TYPE_COLOR: Record<string, string> = {
  dueDate: 'bg-rose-100 text-rose-700',
  followUpDate: 'bg-amber-100 text-amber-700',
  deliveryDate: 'bg-blue-100 text-blue-700',
};

type FilterType = 'all' | 'invoice' | 'quotation' | 'request';

function DueDateRow({ item, t }: { item: DueDateItem; t: (key: string) => string }) {
  const overdue = item.daysFromNow < 0;

  function dayLabel(days: number): string {
    if (days < 0) return `${Math.abs(days)} ${t('dueDates.daysAgo')}`;
    if (days === 0) return t('dueDates.todayLabel');
    if (days === 1) return 'فردا';
    return `${days} ${t('dueDates.daysLeft')}`;
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
      overdue ? 'border-rose-200 bg-rose-50' :
      item.daysFromNow === 0 ? 'border-amber-200 bg-amber-50' :
      'border-slate-100 bg-white'
    }`}>
      <span className="text-base">{ENTITY_ICON[item.entityType] ?? '📄'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-800">{item.label}</span>
          <span className="text-[10px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
            {t(`dueDates.types.${item.entityType}`)}
          </span>
          <span className={`text-[10px] rounded-full px-2 py-0.5 ${DATE_TYPE_COLOR[item.dateType] ?? 'bg-slate-100 text-slate-600'}`}>
            {item.dateTypeLabel}
          </span>
        </div>
        {item.supplier !== '—' && (
          <div className="text-[10px] text-slate-400 mt-0.5">{item.supplier}</div>
        )}
      </div>
      <div className="text-left shrink-0">
        <div className={`text-xs font-bold ${overdue ? 'text-rose-700' : item.daysFromNow === 0 ? 'text-amber-700' : 'text-slate-700'}`}>
          {dayLabel(item.daysFromNow)}
        </div>
        <div className="text-[10px] text-slate-400">{faDate(item.date)}</div>
      </div>
    </div>
  );
}

function Section({ title, items, defaultOpen = true, t }: { title: string; items: DueDateItem[]; defaultOpen?: boolean; t: (key: string) => string }) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <button
        className="w-full flex items-center gap-2 mb-2 text-right"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-bold text-slate-600">{title}</span>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          {items.length}
        </span>
        <span className="text-slate-400 text-xs mr-auto">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-1.5">
          {items.map((item, i) => <DueDateRow key={`${item.entityId}-${item.dateType}-${i}`} item={item} t={t} />)}
        </div>
      )}
    </div>
  );
}

export function DueDates() {
  const { currentTenantId } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const [filter, setFilter] = useState<FilterType>('all');

  const { data, isLoading, refetch } = useQuery<DueDatesData>({
    queryKey: ['due-dates', tid],
    queryFn: async () => (await api.get(`/${tid}/due-dates`)).data,
    enabled: Boolean(tid),
    staleTime: 60_000,
  });

  function applyFilter(items: DueDateItem[]): DueDateItem[] {
    return filter === 'all' ? items : items.filter((i) => i.entityType === filter);
  }

  const g = data?.grouped;

  return (
    <Layout title={t('dueDates.title')}>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Alert badges */}
        {(data?.overdueCount ?? 0) > 0 && (
          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
            {data!.overdueCount} {t('dueDates.overdue')}
          </span>
        )}
        {(data?.todayCount ?? 0) > 0 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
            {data!.todayCount} {t('dueDates.today')}
          </span>
        )}
        <div className="flex-1" />
        <button className="btn btn-outline text-xs" onClick={() => refetch()}>
          ↺ بروزرسانی
        </button>
      </div>

      {/* Entity filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ['all', t('common.all')],
          ['invoice', t('dueDates.types.invoice')],
          ['quotation', t('dueDates.types.quotation')],
          ['request', t('dueDates.types.request')],
        ] as [FilterType, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`btn ${filter === key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="py-12 text-center text-slate-400">{t('common.loading')}</div>
      )}

      {data && g && (
        <>
          {data.total === 0 && (
            <div className="card py-16 text-center text-slate-400">
              <div className="text-4xl mb-3">📅</div>
              <div className="text-sm">{t('common.noData')}</div>
            </div>
          )}

          <Section title={t('dueDates.overdue')} items={applyFilter(g.overdue)} defaultOpen t={t} />
          <Section title={t('dueDates.today')} items={applyFilter(g.today)} defaultOpen t={t} />
          <Section title="این هفته" items={applyFilter(g.this_week)} defaultOpen t={t} />
          <Section title="این ماه" items={applyFilter(g.this_month)} defaultOpen t={t} />
          <Section title={t('dueDates.upcoming')} items={applyFilter(g.future)} defaultOpen={false} t={t} />
        </>
      )}
    </Layout>
  );
}

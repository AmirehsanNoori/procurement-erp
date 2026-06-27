import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';

interface TimelineEvent {
  id: string;
  entityType: string;
  entityTypeLabel: string;
  entityId: string;
  eventType: string;
  eventTypeLabel: string;
  eventDate: string | null;
  userId: string | null;
  userName: string | null;
  supplier: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

const ENTITY_ICON: Record<string, string> = {
  request: '📝',
  quotation: '📋',
  invoice: '📄',
  payment: '💳',
  budget: '💰',
  supplier: '🏢',
  task: '✅',
  document: '🗂',
  system: '⚙️',
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  created: 'bg-emerald-100 text-emerald-700',
  updated: 'bg-blue-100 text-blue-700',
  status_changed: 'bg-violet-100 text-violet-700',
  archived: 'bg-slate-100 text-slate-500',
  converted: 'bg-amber-100 text-amber-700',
  payment_registered: 'bg-emerald-100 text-emerald-700',
  note: 'bg-yellow-50 text-yellow-700',
  followup: 'bg-orange-100 text-orange-700',
  delivery: 'bg-sky-100 text-sky-700',
};

const ENTITY_TYPES = [
  { key: '', labelKey: 'timeline.filterAll' },
  { key: 'request', labelKey: 'timeline.entityTypes.request' },
  { key: 'quotation', labelKey: 'timeline.entityTypes.quotation' },
  { key: 'invoice', labelKey: 'timeline.entityTypes.invoice' },
  { key: 'payment', labelKey: 'timeline.entityTypes.payment' },
  { key: 'budget', labelKey: 'common.category' },
  { key: 'supplier', labelKey: 'common.supplier' },
  { key: 'task', labelKey: 'tasks.title' },
];

const EVENT_TYPES = [
  'created', 'updated', 'status_changed', 'converted',
  'payment_registered', 'note', 'followup', 'delivery', 'archived',
];

export function Timeline() {
  const { currentTenantId } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const qc = useQueryClient();

  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    entityType: 'request',
    entityId: '',
    eventType: 'note',
    notes: '',
    reference: '',
    supplier: '',
  });
  const [formError, setFormError] = useState('');

  const listKey = ['timeline', tid, entityTypeFilter, search];

  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: async () =>
      (
        await api.get(`/${tid}/timeline`, {
          params: {
            entityType: entityTypeFilter || undefined,
            search: search || undefined,
            limit: 200,
          },
        })
      ).data as { events: TimelineEvent[]; total: number },
    enabled: Boolean(tid),
    staleTime: 30_000,
  });

  const addMut = useMutation({
    mutationFn: async () =>
      api.post(`/${tid}/timeline`, {
        entityType: form.entityType,
        entityId: form.entityId,
        eventType: form.eventType,
        notes: form.notes || null,
        reference: form.reference || null,
        supplier: form.supplier || null,
        eventDate: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline', tid] });
      setShowForm(false);
      setForm({ entityType: 'request', entityId: '', eventType: 'note', notes: '', reference: '', supplier: '' });
    },
    onError: (err) => setFormError(apiError(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    addMut.mutate();
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  const events = data?.events ?? [];

  return (
    <Layout title={t('timeline.title')}>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <button
          className="btn btn-primary"
          onClick={() => { setFormError(''); setShowForm((v) => !v); }}
        >
          {t('timeline.addEvent')}
        </button>
      </div>

      {/* Entity type filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {ENTITY_TYPES.map((et) => (
          <button
            key={et.key}
            className={`btn ${entityTypeFilter === et.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setEntityTypeFilter(et.key)}
          >
            {et.key && <span className="ml-1">{ENTITY_ICON[et.key]}</span>}
            {t(et.labelKey)}
          </button>
        ))}
      </div>

      {/* Add event form */}
      {showForm && (
        <form onSubmit={onSubmit} className="card mb-4 grid gap-3 sm:grid-cols-2">
          <h3 className="sm:col-span-2 text-sm font-bold text-slate-700">ثبت رویداد جدید</h3>
          {formError && <div className="sm:col-span-2 text-sm text-rose-600">{formError}</div>}

          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t('timeline.form.entityType')}</span>
            <select
              className="input mt-1"
              value={form.entityType}
              onChange={(e) => setForm({ ...form, entityType: e.target.value })}
              required
            >
              {ENTITY_TYPES.slice(1).map((et) => (
                <option key={et.key} value={et.key}>{t(et.labelKey)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t('timeline.form.entityId')}</span>
            <input
              className="input mt-1 font-mono text-xs"
              placeholder="ID یا شماره"
              value={form.entityId}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })}
              required
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">{t('common.type')}</span>
            <select
              className="input mt-1"
              value={form.eventType}
              onChange={(e) => setForm({ ...form, eventType: e.target.value })}
            >
              {EVENT_TYPES.map((et) => <option key={et} value={et}>{et}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">مرجع / شماره</span>
            <input
              className="input mt-1"
              placeholder={t('common.optional')}
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">{t('timeline.form.description')}</span>
            <textarea
              className="input mt-1 min-h-[70px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={addMut.isPending}>
              {addMut.isPending ? t('common.submitting') : t('common.confirm')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {isLoading && <div className="py-10 text-center text-slate-400">{t('common.loading')}</div>}

      {/* Timeline feed */}
      <div className="relative">
        {/* Vertical line */}
        {events.length > 0 && (
          <div className="absolute right-[22px] top-0 bottom-0 w-0.5 bg-slate-200" />
        )}

        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="flex gap-4 items-start relative">
              {/* Icon circle */}
              <div className="w-11 h-11 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shrink-0 z-10 text-lg">
                {ENTITY_ICON[e.entityType] ?? '•'}
              </div>

              {/* Content card */}
              <div className="flex-1 min-w-0 card py-2.5 px-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${EVENT_TYPE_COLOR[e.eventType] ?? 'bg-slate-100 text-slate-600'}`}>
                    {e.eventTypeLabel}
                  </span>
                  <span className="text-xs text-slate-500">{e.entityTypeLabel}</span>
                  <span className="text-[10px] font-mono text-slate-400">{e.entityId.slice(0, 12)}…</span>
                  {e.reference && (
                    <span className="text-[10px] text-slate-500">#{e.reference}</span>
                  )}
                </div>
                {e.notes && (
                  <div className="mt-1 text-xs text-slate-700">{e.notes}</div>
                )}
                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                  <span>{formatDateTime(e.eventDate ?? e.createdAt)}</span>
                  {e.userName && <span>توسط: {e.userName}</span>}
                  {e.supplier && <span>{t('common.supplier')}: {e.supplier}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {!isLoading && events.length === 0 && (
          <div className="py-14 text-center text-slate-400">
            <div className="text-4xl mb-3">📅</div>
            <div className="text-sm">{t('timeline.empty')}</div>
            <div className="text-xs mt-1 text-slate-300">رویدادها پس از ثبت فعالیت‌ها اینجا نمایش داده می‌شوند</div>
          </div>
        )}
      </div>

      {data && (
        <div className="mt-3 text-xs text-slate-400 text-left">{data.total} رویداد</div>
      )}
    </Layout>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';

interface Notif {
  id: string;
  type: string;
  level: string;
  title: string;
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotifData {
  notifications: Notif[];
  unreadCount: number;
}

const LEVEL_STYLE: Record<string, string> = {
  critical: 'border-rose-400 bg-rose-50',
  important: 'border-amber-400 bg-amber-50',
  info: 'border-blue-300 bg-blue-50',
};

const LEVEL_BADGE: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  important: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
};

const LEVEL_LABEL: Record<string, string> = {
  critical: 'بحرانی',
  important: 'مهم',
  info: 'اطلاعاتی',
};

const TYPE_ICON: Record<string, string> = {
  overdue_invoice: '📅',
  budget_overrun: '💸',
  no_budget_invoices: '📋',
  quotation_followup: '🔔',
};

export function Notifications() {
  const { currentTenantId } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<NotifData>({
    queryKey: ['notifications', tid],
    queryFn: async () => (await api.get(`/${tid}/notifications`)).data,
    enabled: Boolean(tid),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.patch(`/${tid}/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', tid] });
      qc.invalidateQueries({ queryKey: ['dashboard', tid] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => api.post(`/${tid}/notifications/read-all`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', tid] });
      qc.invalidateQueries({ queryKey: ['dashboard', tid] });
    },
  });

  const deleteNotif = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', tid] }),
  });

  const notifs = data?.notifications ?? [];
  const unread = notifs.filter((n) => !n.isRead);
  const read = notifs.filter((n) => n.isRead);

  return (
    <Layout title={t('notifications.title')}>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        {data && (
          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
            {data.unreadCount} {t('notifications.tabs.unread')}
          </span>
        )}
        <div className="flex-1" />
        {(data?.unreadCount ?? 0) > 0 && (
          <button
            className="btn btn-outline text-sm"
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {markAllRead.isPending ? t('common.loading') : t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {error && (
        <div className="card mb-4 text-sm text-rose-600">{apiError(error)}</div>
      )}

      {isLoading && (
        <div className="py-12 text-center text-slate-400">{t('common.loading')}</div>
      )}

      {!isLoading && notifs.length === 0 && (
        <div className="card py-16 text-center text-slate-400">
          <div className="text-4xl mb-3">🔔</div>
          <div className="text-sm">{t('notifications.empty')}</div>
        </div>
      )}

      {/* Unread */}
      {unread.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
            {t('notifications.tabs.unread')}
          </div>
          <div className="space-y-2">
            {unread.map((n) => (
              <NotifRow
                key={n.id}
                n={n}
                onRead={() => markRead.mutate(n.id)}
                onDelete={() => deleteNotif.mutate(n.id)}
                readPending={markRead.isPending}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {/* Read */}
      {read.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wide">
            {t('notifications.tabs.all')}
          </div>
          <div className="space-y-2">
            {read.map((n) => (
              <NotifRow
                key={n.id}
                n={n}
                onRead={() => {}}
                onDelete={() => deleteNotif.mutate(n.id)}
                readPending={false}
                t={t}
              />
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}

function NotifRow({
  n,
  onRead,
  onDelete,
  readPending,
  t,
}: {
  n: Notif;
  onRead: () => void;
  onDelete: () => void;
  readPending: boolean;
  t: (key: string) => string;
}) {
  const borderBg = n.isRead ? 'border-slate-200 bg-white' : (LEVEL_STYLE[n.level] ?? 'border-slate-200 bg-white');

  return (
    <div className={`flex items-start gap-3 rounded-lg border-r-4 border border-r-[3px] px-4 py-3 ${borderBg}`}>
      <div className="text-xl mt-0.5 select-none">{TYPE_ICON[n.type] ?? '🔔'}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold ${n.isRead ? 'text-slate-700' : 'text-slate-900'}`}>
            {n.title}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${LEVEL_BADGE[n.level] ?? ''}`}>
            {LEVEL_LABEL[n.level] ?? n.level}
          </span>
        </div>
        {n.description && (
          <div className="mt-0.5 text-xs text-slate-500">{n.description}</div>
        )}
        <div className="mt-1 text-[10px] text-slate-400">{faDate(n.createdAt)}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!n.isRead && (
          <button
            className="btn btn-outline px-2 py-1 text-xs"
            disabled={readPending}
            onClick={onRead}
            title={t('notifications.markAllRead')}
          >
            ✓
          </button>
        )}
        <button
          className="btn btn-outline px-2 py-1 text-xs text-slate-400"
          onClick={() => { if (confirm(t('notifications.confirm.delete'))) onDelete(); }}
          title={t('common.delete')}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

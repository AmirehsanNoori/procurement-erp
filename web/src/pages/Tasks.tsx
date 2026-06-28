import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: number;
  dueDate: string | null;
  followUpDate: string | null;
  status: string;
  relatedRequestId: string | null;
  relatedInvoiceId: string | null;
  createdAt: string;
}

const STATUSES = ['در انتظار', 'در حال انجام', 'انجام شده', 'لغو شده'];

const PRIORITY_LABEL: Record<number, string> = { 1: 'پایین', 2: 'متوسط', 3: 'بالا' };
const PRIORITY_COLOR: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-rose-100 text-rose-700',
};

const STATUS_COLOR: Record<string, string> = {
  'در انتظار': 'bg-slate-100 text-slate-600',
  'در حال انجام': 'bg-blue-100 text-blue-700',
  'انجام شده': 'bg-emerald-100 text-emerald-700',
  'لغو شده': 'bg-rose-100 text-rose-500',
};

const emptyForm = {
  title: '',
  description: '',
  priority: 2,
  status: 'در انتظار',
  dueDate: '',
  relatedRequestId: '',
  relatedInvoiceId: '',
};

export function Tasks() {
  const { currentTenantId } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');

  const listKey = ['tasks', tid, statusFilter, priorityFilter, search];

  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: async () =>
      (
        await api.get(`/${tid}/tasks`, {
          params: {
            status: statusFilter || undefined,
            priority: priorityFilter || undefined,
            search: search || undefined,
          },
        })
      ).data as { tasks: Task[]; statusCounts: Record<string, number> },
    enabled: Boolean(tid),
  });

  function openCreate() {
    setEditTask(null);
    setForm({ ...emptyForm });
    setFormError('');
    setShowForm(true);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setForm({
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      relatedRequestId: task.relatedRequestId ?? '',
      relatedInvoiceId: task.relatedInvoiceId ?? '',
    });
    setFormError('');
    setShowForm(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate || null,
        relatedRequestId: form.relatedRequestId || null,
        relatedInvoiceId: form.relatedInvoiceId || null,
      };
      if (editTask) {
        await api.patch(`/${tid}/tasks/${editTask.id}`, payload);
      } else {
        await api.post(`/${tid}/tasks`, payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', tid] });
      setShowForm(false);
    },
    onError: (err) => setFormError(apiError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/${tid}/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', tid] }),
  });

  const statusChangeMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/${tid}/tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', tid] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    saveMut.mutate();
  }

  const tasks = data?.tasks ?? [];
  const counts = data?.statusCounts ?? {};

  return (
    <Layout title={t('tasks.title')}>
      {/* Status summary tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          className={`btn ${statusFilter === '' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setStatusFilter('')}
        >
          {t('tasks.filterAll')}
          {Object.values(counts).reduce((a, b) => a + b, 0) > 0 &&
            ` (${Object.values(counts).reduce((a, b) => a + b, 0)})`}
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
          >
            {s}{counts[s] ? ` (${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-[130px]"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="">همه اولویت‌ها</option>
          <option value="3">{t('tasks.priorities.high')}</option>
          <option value="2">{t('tasks.priorities.medium')}</option>
          <option value="1">{t('tasks.priorities.low')}</option>
        </select>
        <div className="flex-1" />
        <button className="btn btn-primary" onClick={openCreate}>
          {t('tasks.addNew')}
        </button>
      </div>

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-sm font-bold text-slate-800">
              {editTask ? t('tasks.form.editTitle') : t('tasks.form.newTitle')}
            </h2>
            <form onSubmit={onSubmit} className="space-y-3">
              {formError && <div className="text-sm text-rose-600">{formError}</div>}

              <label className="block">
                <span className="text-xs font-bold text-slate-600">{t('tasks.form.title')}</span>
                <input
                  className="input mt-1"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-600">{t('common.description')}</span>
                <textarea
                  className="input mt-1 min-h-[80px]"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">{t('tasks.form.priority')}</span>
                  <select
                    className="input mt-1"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  >
                    <option value={3}>{t('tasks.priorities.high')}</option>
                    <option value={2}>{t('tasks.priorities.medium')}</option>
                    <option value={1}>{t('tasks.priorities.low')}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">{t('tasks.form.status')}</span>
                  <select
                    className="input mt-1"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-bold text-slate-600">{t('tasks.form.dueDate')}</span>
                <JDatePicker
                  className="input mt-1"
                  value={form.dueDate}
                  onChange={(v) => setForm({ ...form, dueDate: v })}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">{t('tasks.form.requestId')}</span>
                  <input
                    className="input mt-1 font-mono text-xs"
                    placeholder={t('common.optional')}
                    value={form.relatedRequestId}
                    onChange={(e) => setForm({ ...form, relatedRequestId: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">{t('tasks.form.invoiceId')}</span>
                  <input
                    className="input mt-1 font-mono text-xs"
                    placeholder={t('common.optional')}
                    value={form.relatedInvoiceId}
                    onChange={(e) => setForm({ ...form, relatedInvoiceId: e.target.value })}
                  />
                </label>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" className="btn btn-primary" disabled={saveMut.isPending}>
                  {saveMut.isPending ? t('common.saving') : t('common.save')}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoading && <div className="py-10 text-center text-slate-400">{t('common.loading')}</div>}

      {/* Task list */}
      <div className="space-y-2">
        {tasks.map((task) => {
          const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'انجام شده' && task.status !== 'لغو شده';
          return (
            <div
              key={task.id}
              className={`card flex gap-3 items-start border-r-4 ${
                task.priority === 3 ? 'border-rose-400' :
                task.priority === 2 ? 'border-amber-400' :
                'border-slate-200'
              } ${task.status === 'انجام شده' ? 'opacity-60' : ''}`}
            >
              {/* Priority indicator + quick done toggle */}
              <button
                className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  task.status === 'انجام شده' ? 'bg-emerald-400 border-emerald-400 text-white' : 'border-slate-300'
                }`}
                onClick={() => statusChangeMut.mutate({
                  id: task.id,
                  status: task.status === 'انجام شده' ? 'در انتظار' : 'انجام شده',
                })}
                title={task.status === 'انجام شده' ? 'علامت‌گذاری به‌عنوان ناتمام' : 'علامت‌گذاری به‌عنوان انجام شده'}
              >
                {task.status === 'انجام شده' && <span className="text-[10px]">✓</span>}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${task.status === 'انجام شده' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {task.title}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLOR[task.priority] ?? ''}`}>
                    {PRIORITY_LABEL[task.priority]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${STATUS_COLOR[task.status] ?? ''}`}>
                    {task.status}
                  </span>
                </div>
                {task.description && (
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</div>
                )}
                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                  {task.dueDate && (
                    <span className={overdue ? 'text-rose-600 font-bold' : ''}>
                      {t('tasks.cols.dueDate')}: {faDate(task.dueDate)}
                      {overdue && ` ${t('tasks.overdue')}`}
                    </span>
                  )}
                  <span>ایجاد: {faDate(task.createdAt)}</span>
                </div>
              </div>

              <div className="flex gap-1 shrink-0">
                <button
                  className="btn btn-outline px-2 py-1 text-xs"
                  onClick={() => openEdit(task)}
                >
                  ✏
                </button>
                <button
                  className="btn btn-outline px-2 py-1 text-xs text-rose-500"
                  onClick={() => { if (confirm(t('tasks.confirm.delete'))) deleteMut.mutate(task.id); }}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}

        {!isLoading && tasks.length === 0 && (
          <div className="card py-12 text-center text-slate-400">
            <div className="text-3xl mb-2">✓</div>
            <div className="text-sm">{t('tasks.empty')}</div>
          </div>
        )}
      </div>
    </Layout>
  );
}

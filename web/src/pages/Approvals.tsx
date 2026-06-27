import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';

interface WorkflowStep {
  label: string;
  requiredRole?: string;
  order: number;
}

interface ApprovalWorkflow {
  id: string;
  name: string;
  entityType: 'invoice' | 'quotation' | 'request';
  steps: WorkflowStep[];
  isActive: boolean;
  createdAt: string;
}

interface ApprovalVote {
  id: string;
  step: number;
  decision: string;
  notes: string | null;
  createdAt: string;
  user: { id: string; fullName: string };
}

interface ApprovalInstance {
  id: string;
  entityType: string;
  entityId: string;
  currentStep: number;
  status: string;
  notes: string | null;
  createdAt: string;
  workflow: ApprovalWorkflow;
  votes: ApprovalVote[];
}

const ENTITY_TYPES = [
  { value: 'invoice', label: 'فاکتور' },
  { value: 'quotation', label: 'پیش‌فاکتور' },
  { value: 'request', label: 'درخواست' },
];

const STATUS_COLOR: Record<string, string> = {
  'در انتظار': 'bg-amber-100 text-amber-700',
  'تأیید شده': 'bg-emerald-100 text-emerald-700',
  'رد شده': 'bg-rose-100 text-rose-700',
};

const emptyWorkflowForm = {
  name: '',
  entityType: 'invoice' as 'invoice' | 'quotation' | 'request',
  isActive: true,
};

export function Approvals() {
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'workflows' | 'pending'>('workflows');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyWorkflowForm);
  const [steps, setSteps] = useState<WorkflowStep[]>([{ label: '', requiredRole: '', order: 0 }]);
  const [error, setError] = useState('');

  const tid = currentTenantId ?? '';

  const workflowsQ = useQuery({
    queryKey: ['approvals-workflows', tid],
    queryFn: async () => {
      const res = await api.get(`/${tid}/approvals/workflows`);
      return res.data.workflows as ApprovalWorkflow[];
    },
    enabled: !!tid,
  });

  const pendingQ = useQuery({
    queryKey: ['approvals-pending', tid],
    queryFn: async () => {
      const res = await api.get(`/${tid}/approvals/pending`);
      return res.data.instances as ApprovalInstance[];
    },
    enabled: !!tid && tab === 'pending',
  });

  const saveMut = useMutation({
    mutationFn: async (data: { name: string; entityType: string; steps: WorkflowStep[]; isActive: boolean }) => {
      if (editId) return api.patch(`/${tid}/approvals/workflows/${editId}`, data).then((r) => r.data);
      return api.post(`/${tid}/approvals/workflows`, data).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals-workflows', tid] });
      closeForm();
    },
    onError: (e) => setError(apiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/${tid}/approvals/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals-workflows', tid] }),
    onError: (e) => setError(apiError(e)),
  });

  const voteMut = useMutation({
    mutationFn: ({ instanceId, decision, notes }: { instanceId: string; decision: string; notes?: string }) =>
      api.post(`/${tid}/approvals/${instanceId}/vote`, { decision, notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals-pending', tid] }),
    onError: (e) => setError(apiError(e)),
  });

  function openCreate() {
    setEditId(null);
    setForm(emptyWorkflowForm);
    setSteps([{ label: '', requiredRole: '', order: 0 }]);
    setError('');
    setShowForm(true);
  }

  function openEdit(w: ApprovalWorkflow) {
    setEditId(w.id);
    setForm({ name: w.name, entityType: w.entityType, isActive: w.isActive });
    setSteps((w.steps as WorkflowStep[]).map((s, i) => ({ ...s, order: i })));
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setError('');
  }

  function addStep() {
    setSteps((prev) => [...prev, { label: '', requiredRole: '', order: prev.length }]);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })));
  }

  function updateStep(i: number, field: keyof WorkflowStep, value: string | number) {
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('نام گردش‌کار الزامی است'); return; }
    if (steps.some((s) => !s.label.trim())) { setError('نام همه مراحل الزامی است'); return; }
    saveMut.mutate({ ...form, steps: steps.map((s, i) => ({ ...s, order: i })) });
  }

  const entityLabel = (t: string) => ENTITY_TYPES.find((e) => e.value === t)?.label ?? t;

  return (
    <Layout title="گردش‌کارهای تأیید">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">گردش‌کارهای تأیید</h1>
            <p className="text-sm text-slate-500 mt-1">تعریف و مدیریت فرآیندهای چند مرحله‌ای تأیید</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            + گردش‌کار جدید
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          {(['workflows', 'pending'] as const).map((tab_) => (
            <button
              key={tab_}
              onClick={() => setTab(tab_)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === tab_
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab_ === 'workflows' ? 'قالب‌های گردش‌کار' : 'تأییدیه‌های در انتظار'}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">{error}</div>
        )}

        {/* Workflow Templates Tab */}
        {tab === 'workflows' && (
          <div className="space-y-4">
            {workflowsQ.isLoading && (
              <div className="text-center py-12 text-slate-400">در حال بارگذاری...</div>
            )}
            {!workflowsQ.isLoading && !workflowsQ.data?.length && (
              <div className="text-center py-12 text-slate-400">هیچ گردش‌کاری تعریف نشده</div>
            )}
            <div className="grid gap-4">
              {workflowsQ.data?.map((w) => (
                <div key={w.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-800">{w.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs">
                          {entityLabel(w.entityType)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${w.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {w.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{faDate(w.createdAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(w)}
                        className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                      >
                        ویرایش
                      </button>
                      <button
                        onClick={() => { if (confirm('حذف شود؟')) deleteMut.mutate(w.id); }}
                        className="px-3 py-1.5 text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg"
                      >
                        حذف
                      </button>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="mt-4 flex flex-wrap gap-2 items-center">
                    {(w.steps as WorkflowStep[]).map((step, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                            {i + 1}
                          </span>
                          <span>{step.label}</span>
                          {step.requiredRole && (
                            <span className="text-xs text-slate-400">({step.requiredRole})</span>
                          )}
                        </span>
                        {i < (w.steps as WorkflowStep[]).length - 1 && (
                          <span className="text-slate-300 text-lg">←</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Approvals Tab */}
        {tab === 'pending' && (
          <div className="space-y-4">
            {pendingQ.isLoading && (
              <div className="text-center py-12 text-slate-400">در حال بارگذاری...</div>
            )}
            {!pendingQ.isLoading && !pendingQ.data?.length && (
              <div className="text-center py-12 text-slate-400">هیچ تأییدیه‌ای در انتظار نیست</div>
            )}
            {pendingQ.data?.map((inst) => {
              const steps = inst.workflow.steps as WorkflowStep[];
              const currentStepInfo = steps[inst.currentStep];
              return (
                <div key={inst.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-slate-800">{inst.workflow.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs">
                          {entityLabel(inst.entityType)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[inst.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {inst.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        شناسه موجودیت: <span className="font-mono">{inst.entityId}</span> — {faDate(inst.createdAt)}
                      </p>
                      {inst.notes && <p className="text-sm text-slate-600 mt-1">{inst.notes}</p>}
                    </div>
                  </div>

                  {/* Progress steps */}
                  <div className="mt-4 flex flex-wrap gap-2 items-center">
                    {steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm border ${
                          i < inst.currentStep
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : i === inst.currentStep
                            ? 'bg-amber-50 border-amber-200 text-amber-700 font-semibold'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}>
                          <span className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold ${
                            i < inst.currentStep ? 'bg-emerald-500' : i === inst.currentStep ? 'bg-amber-500' : 'bg-slate-300'
                          }`}>
                            {i < inst.currentStep ? '✓' : i + 1}
                          </span>
                          {step.label}
                        </span>
                        {i < steps.length - 1 && <span className="text-slate-300 text-lg">←</span>}
                      </div>
                    ))}
                  </div>

                  {/* Votes history */}
                  {inst.votes.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {inst.votes.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 text-xs text-slate-500">
                          <span className={`px-2 py-0.5 rounded-full ${STATUS_COLOR[v.decision] ?? 'bg-slate-100'}`}>
                            {v.decision}
                          </span>
                          <span>{v.user.fullName}</span>
                          <span>— مرحله {v.step + 1}</span>
                          {v.notes && <span>— {v.notes}</span>}
                          <span className="text-slate-400">{faDate(v.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Vote buttons for current step */}
                  {inst.status === 'در انتظار' && currentStepInfo && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => voteMut.mutate({ instanceId: inst.id, decision: 'تأیید شده' })}
                        disabled={voteMut.isPending}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg font-medium disabled:opacity-50"
                      >
                        تأیید مرحله {inst.currentStep + 1}: {currentStepInfo.label}
                      </button>
                      <button
                        onClick={() => {
                          const note = prompt('دلیل رد کردن (اختیاری):') ?? '';
                          voteMut.mutate({ instanceId: inst.id, decision: 'رد شده', notes: note || undefined });
                        }}
                        disabled={voteMut.isPending}
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm rounded-lg font-medium border border-rose-200 disabled:opacity-50"
                      >
                        رد
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Workflow Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">
                {editId ? 'ویرایش گردش‌کار' : 'گردش‌کار جدید'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">نام گردش‌کار</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="مثال: تأیید فاکتورهای بالای ۱۰ میلیون"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">نوع موجودیت</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={form.entityType}
                    onChange={(e) => setForm((p) => ({ ...p, entityType: e.target.value as typeof form.entityType }))}
                  >
                    {ENTITY_TYPES.map((et) => (
                      <option key={et.value} value={et.value}>{et.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={form.isActive}
                    onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-slate-700">گردش‌کار فعال</label>
                </div>
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-slate-700">مراحل تأیید</label>
                  <button
                    type="button"
                    onClick={addStep}
                    className="text-xs px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                  >
                    + افزودن مرحله
                  </button>
                </div>
                <div className="space-y-3">
                  {steps.map((step, i) => (
                    <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-lg p-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
                        {i + 1}
                      </span>
                      <input
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        placeholder="نام مرحله (مثلاً: تأیید مدیر مالی)"
                        value={step.label}
                        onChange={(e) => updateStep(i, 'label', e.target.value)}
                      />
                      <input
                        className="w-40 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        placeholder="نقش (اختیاری)"
                        value={step.requiredRole ?? ''}
                        onChange={(e) => updateStep(i, 'requiredRole', e.target.value)}
                      />
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStep(i)}
                          className="text-rose-400 hover:text-rose-600 px-2"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={saveMut.isPending}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                >
                  {saveMut.isPending ? 'در حال ذخیره...' : 'ذخیره'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

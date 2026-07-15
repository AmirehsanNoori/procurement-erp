import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface Hit { type: string; typeFa: string; id: string; label: string; sublabel: string; path: string; }
interface Insight { key: string; severity: string; title: string; count: number; path: string; }

const TYPE_ICON: Record<string, string> = { request: '📋', invoice: '🧾', supplier: '🏭', product: '🏷️', contract: '📑', ticket: '🎫', employee: '👤', letter: '✉️', po: '📄' };
const SEV_COLOR: Record<string, string> = { critical: 'border-rose-200 bg-rose-50 text-rose-700', warning: 'border-amber-200 bg-amber-50 text-amber-700', info: 'border-blue-200 bg-blue-50 text-blue-700' };

export function AiAssistant() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');

  const searchQ = useQuery({
    queryKey: ['ai-search', tid, term],
    queryFn: async () => (await api.get(`/${tid}/ai/search`, { params: { q: term } })).data.hits as Hit[],
    enabled: !!tid && term.trim().length > 0,
  });
  const insightsQ = useQuery({
    queryKey: ['ai-insights', tid],
    queryFn: async () => (await api.get(`/${tid}/ai/insights`)).data.insights as Insight[],
    enabled: !!tid,
  });
  const activeInsights = (insightsQ.data ?? []).filter((i) => i.count > 0);

  return (
    <Layout title="دستیار هوشمند">
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            className="input flex-1 text-base"
            placeholder="جستجوی سازمانی: درخواست، فاکتور، تأمین‌کننده، کالا، قرارداد، تیکت، کارمند، نامه..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setTerm(q); }}
          />
          <button className="btn btn-primary" onClick={() => setTerm(q)}>🔍 جستجو</button>
        </div>
      </div>

      {term.trim() && (
        <div className="card mb-4">
          <h2 className="mb-2 text-sm font-bold text-slate-700">نتایج جستجو برای «{term}»</h2>
          {searchQ.isLoading ? <div className="py-4 text-center text-slate-400">در حال جستجو...</div> : (searchQ.data ?? []).length === 0 ? (
            <div className="py-4 text-center text-slate-400">نتیجه‌ای یافت نشد.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(searchQ.data ?? []).map((h) => (
                <button key={`${h.type}-${h.id}`} onClick={() => navigate(h.path)} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2 text-right transition hover:bg-slate-50">
                  <span className="text-xl">{TYPE_ICON[h.type] ?? '📄'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-800">{h.label}</span>
                    <span className="block truncate text-xs text-slate-500">{h.typeFa}{h.sublabel ? ` · ${h.sublabel}` : ''}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <h2 className="mb-2 text-sm font-bold text-slate-700">بینش‌ها و پیشنهادها</h2>
      {insightsQ.isLoading ? <div className="card p-6 text-center text-slate-400">در حال تحلیل...</div> : activeInsights.length === 0 ? (
        <div className="card p-6 text-center text-emerald-600">✓ موردی که نیاز به توجه داشته باشد یافت نشد.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeInsights.map((i) => (
            <button key={i.key} onClick={() => navigate(i.path)} className={`rounded-xl border p-4 text-right transition hover:shadow-md ${SEV_COLOR[i.severity] ?? SEV_COLOR.info}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{i.title}</span>
                <span className="text-2xl font-bold tabular-nums">{i.count}</span>
              </div>
              <div className="mt-1 text-xs opacity-70">برای مشاهده کلیک کنید →</div>
            </button>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-400">این دستیار جستجوی یکپارچهٔ سازمانی و بینش‌های خودکار میان‌ماژولی را فراهم می‌کند و قابل توسعه به دستیار مبتنی بر مدل زبانی است.</p>
    </Layout>
  );
}

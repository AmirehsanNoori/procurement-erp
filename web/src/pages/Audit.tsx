import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface AuditIssue {
  entityType: string;
  entityId: string;
  label: string;
  detail: string;
  suggestion: string;
}

interface AuditCheck {
  id: string;
  title: string;
  description: string;
  level: 'critical' | 'warning' | 'info';
  passed: boolean;
  issueCount: number;
  issues: AuditIssue[];
}

interface AuditData {
  summary: {
    total: number;
    passed: number;
    failed: number;
    critical: number;
    warnings: number;
    healthScore: number;
  };
  checks: AuditCheck[];
  runAt: string;
}

const LEVEL_COLOR: Record<string, string> = {
  critical: 'text-rose-700 bg-rose-50 border-rose-300',
  warning: 'text-amber-700 bg-amber-50 border-amber-300',
  info: 'text-blue-700 bg-blue-50 border-blue-300',
};

const LEVEL_BADGE: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
};

const LEVEL_LABEL: Record<string, string> = {
  critical: 'بحرانی',
  warning: 'هشدار',
  info: 'اطلاعاتی',
};

const ENTITY_LABEL: Record<string, string> = {
  invoice: 'فاکتور',
  quotation: 'پیش‌فاکتور',
  request: 'درخواست',
  budget: 'بودجه',
};

function HealthRing({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" className="rotate-[-90deg]">
      <circle cx="55" cy="55" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      <circle
        cx="55" cy="55" r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text
        x="55" y="60"
        textAnchor="middle"
        fontSize="22"
        fontWeight="bold"
        fill={color}
        style={{ transform: 'rotate(90deg)', transformOrigin: '55px 55px' }}
      >
        {score}٪
      </text>
    </svg>
  );
}

export function Audit() {
  const { currentTenantId } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading, refetch, isFetching } = useQuery<AuditData>({
    queryKey: ['audit', tid],
    queryFn: async () => (await api.get(`/${tid}/audit`)).data,
    enabled: Boolean(tid),
    staleTime: 0,
    gcTime: 0,
  });

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const failedChecks = data?.checks.filter((c) => !c.passed) ?? [];
  const passedChecks = data?.checks.filter((c) => c.passed) ?? [];

  return (
    <Layout title={t('audit.title')}>
      {/* Header bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1" />
        <button
          className="btn btn-primary"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? t('audit.running') : t('audit.runBtn')}
        </button>
      </div>

      {isLoading && (
        <div className="py-16 text-center text-slate-400">{t('common.loading')}</div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="card mb-4 flex flex-col items-center sm:flex-row gap-6">
            <div className="shrink-0">
              <HealthRing score={data.summary.healthScore} />
              <div className="text-center text-xs text-slate-500 mt-1">{t('audit.scoreLabel')}</div>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-slate-800">{data.summary.total}</div>
                <div className="text-xs text-slate-500">{t('audit.checks')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600">{data.summary.passed}</div>
                <div className="text-xs text-slate-500">تأیید شده</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-rose-600">{data.summary.critical}</div>
                <div className="text-xs text-slate-500">مشکل بحرانی</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">{data.summary.warnings}</div>
                <div className="text-xs text-slate-500">هشدار</div>
              </div>
            </div>
          </div>

          {/* Failed checks */}
          {failedChecks.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
                مشکلات شناسایی‌شده ({failedChecks.length})
              </div>
              <div className="space-y-2">
                {failedChecks.map((check) => (
                  <CheckCard
                    key={check.id}
                    check={check}
                    open={expanded[check.id] ?? false}
                    onToggle={() => toggle(check.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Passed checks */}
          {passedChecks.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wide">
                بررسی‌های موفق ({passedChecks.length})
              </div>
              <div className="space-y-2">
                {passedChecks.map((check) => (
                  <CheckCard
                    key={check.id}
                    check={check}
                    open={expanded[check.id] ?? false}
                    onToggle={() => toggle(check.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 text-xs text-slate-400 text-left">
            آخرین بررسی: {new Date(data.runAt).toLocaleString('fa-IR')}
          </div>
        </>
      )}
    </Layout>
  );
}

function CheckCard({
  check,
  open,
  onToggle,
}: {
  check: AuditCheck;
  open: boolean;
  onToggle: () => void;
}) {
  if (check.passed) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-4 py-3">
        <span className="text-emerald-500 text-lg">✓</span>
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-700">{check.title}</div>
          <div className="text-xs text-slate-400">{check.description}</div>
        </div>
      </div>
    );
  }

  const borderBg = LEVEL_COLOR[check.level] ?? 'text-slate-700 bg-slate-50 border-slate-200';

  return (
    <div className={`rounded-lg border px-4 py-3 ${borderBg}`}>
      <button
        className="w-full flex items-center gap-3 text-right"
        onClick={onToggle}
      >
        <span className="text-lg">{check.level === 'critical' ? '🔴' : check.level === 'warning' ? '🟡' : '🔵'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">{check.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${LEVEL_BADGE[check.level] ?? ''}`}>
              {LEVEL_LABEL[check.level]}
            </span>
            <span className="text-xs opacity-70">{check.issueCount} مورد</span>
          </div>
          <div className="text-xs opacity-70 mt-0.5">{check.description}</div>
        </div>
        <span className="text-lg opacity-60">{open ? '▲' : '▼'}</span>
      </button>

      {open && check.issues.length > 0 && (
        <div className="mt-3 border-t border-current/20 pt-3 space-y-2">
          {check.issues.map((issue) => (
            <div key={issue.entityId || issue.label} className="rounded bg-white/60 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium">
                  {ENTITY_LABEL[issue.entityType] ?? issue.entityType}
                </span>
                <span className="text-xs font-bold">{issue.label}</span>
              </div>
              <div className="text-xs">{issue.detail}</div>
              <div className="text-[10px] mt-1 opacity-70">
                💡 {issue.suggestion}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

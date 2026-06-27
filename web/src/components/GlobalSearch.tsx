import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney } from '../lib/format';

interface SearchResults {
  q: string;
  suppliers: { id: string; name: string; email: string | null }[];
  requests: { id: string; requestNumber: string; title: string | null; status: string }[];
  invoices: { id: string; invoiceNumber: string; status: string; totalAmount: string; supplier: { name: string } | null }[];
  quotations: { id: string; quotationNumber: string; status: string; supplier: { name: string } | null }[];
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!q || q.length < 2 || !currentTenantId) {
      setResults(null);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/${currentTenantId}/search`, { params: { q } });
        setResults(res.data);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [q, currentTenantId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function go(path: string) {
    navigate(path);
    onClose();
  }

  if (!open) return null;

  const total = results
    ? results.suppliers.length + results.requests.length + results.invoices.length + results.quotations.length
    : 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-16 bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <span className="text-lg text-slate-400">🔍</span>
          <input
            ref={inputRef}
            className="flex-1 text-sm outline-none placeholder-slate-400"
            placeholder={t('search.placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {loading && <span className="text-xs text-slate-400 animate-pulse">{t('common.search')}</span>}
          <kbd className="hidden sm:inline text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        {/* Body */}
        {q.length < 2 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            <div className="text-2xl mb-2">🔍</div>
            {t('search.title')}
          </div>
        ) : !loading && results && total === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            <div className="text-2xl mb-2">😕</div>
            {t('search.empty')}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            {results && results.suppliers.length > 0 && (
              <Section title={t('search.categories.suppliers')}>
                {results.suppliers.map((s) => (
                  <ResultRow
                    key={s.id}
                    icon="🏭"
                    main={s.name}
                    sub={s.email ?? undefined}
                    onClick={() => go('/suppliers')}
                  />
                ))}
              </Section>
            )}
            {results && results.requests.length > 0 && (
              <Section title={t('search.categories.requests')}>
                {results.requests.map((r) => (
                  <ResultRow
                    key={r.id}
                    icon="📋"
                    main={r.requestNumber}
                    sub={r.title ?? r.status}
                    onClick={() => go('/requests')}
                  />
                ))}
              </Section>
            )}
            {results && results.invoices.length > 0 && (
              <Section title={t('search.categories.invoices')}>
                {results.invoices.map((i) => (
                  <ResultRow
                    key={i.id}
                    icon="🧾"
                    main={i.invoiceNumber}
                    sub={`${i.supplier?.name ?? '—'} · ${faMoney(i.totalAmount)}`}
                    badge={i.status}
                    onClick={() => go('/invoices')}
                  />
                ))}
              </Section>
            )}
            {results && results.quotations.length > 0 && (
              <Section title={t('search.categories.quotations')}>
                {results.quotations.map((q) => (
                  <ResultRow
                    key={q.id}
                    icon="📝"
                    main={q.quotationNumber}
                    sub={q.supplier?.name ?? undefined}
                    badge={q.status}
                    onClick={() => go('/quotations')}
                  />
                ))}
              </Section>
            )}
          </div>
        )}

        <div className="border-t border-slate-50 px-4 py-2 text-[10px] text-slate-400 flex gap-3">
          <span>↵ {t('common.view')}</span>
          <span>Esc {t('common.close')}</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-50/50">
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultRow({
  icon, main, sub, badge, onClick,
}: {
  icon: string; main: string; sub?: string; badge?: string; onClick: () => void;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-2.5 text-right hover:bg-blue-50 transition-colors"
      onClick={onClick}
    >
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{main}</div>
        {sub && <div className="text-xs text-slate-400 truncate">{sub}</div>}
      </div>
      {badge && (
        <span className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 shrink-0">{badge}</span>
      )}
      <span className="text-slate-300 text-xs shrink-0">↵</span>
    </button>
  );
}

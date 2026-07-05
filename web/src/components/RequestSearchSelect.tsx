import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

/**
 * Request picker with SERVER-SIDE search. Unlike a plain <SearchableSelect> fed a
 * capped list, this queries the API as you type, so it can reach any request no
 * matter how many exist (the list endpoint caps at 200 rows, which hid older
 * requests from client-side-filtered pickers).
 *
 *   value:        selected requestId ('' when none)
 *   initialLabel: requestNumber to show for a pre-selected value (edit mode)
 *   onChange:     (id, label) — label is the chosen requestNumber
 */
export function RequestSearchSelect({
  value,
  initialLabel = '',
  onChange,
  placeholder = 'جستجوی شماره درخواست...',
}: {
  value: string;
  initialLabel?: string;
  onChange: (id: string, label: string) => void;
  placeholder?: string;
}) {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId ?? '';
  const wrapRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [selectedLabel, setSelectedLabel] = useState(initialLabel);

  // Keep the shown label in sync if the parent resets the value/label.
  useEffect(() => { if (!value) setSelectedLabel(''); }, [value]);
  useEffect(() => { setSelectedLabel(initialLabel); }, [initialLabel]);

  const q = useQuery({
    queryKey: ['request-search-select', tid, term],
    queryFn: async () =>
      (await api.get(`/${tid}/requests`, { params: { search: term, limit: 20, archived: 'all' } }))
        .data.requests as { id: string; requestNumber: string; description: string | null }[],
    enabled: !!tid && open && term.trim().length > 0,
  });

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTerm('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const results = q.data ?? [];

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          className="input cursor-text"
          placeholder={placeholder}
          value={open ? term : selectedLabel}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setOpen(true); setTerm(e.target.value); }}
        />
        {value && !open && (
          <button
            type="button"
            tabIndex={-1}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
            onClick={() => { onChange('', ''); setSelectedLabel(''); setTerm(''); }}
            title="پاک کردن"
          >✕</button>
        )}
      </div>

      {open && term.trim().length > 0 && (
        <div className="absolute z-[70] mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl" dir="rtl">
          {q.isLoading && <div className="px-3 py-3 text-center text-xs text-slate-400">در حال جستجو...</div>}
          {!q.isLoading && results.length === 0 && (
            <div className="px-3 py-3 text-center text-xs text-slate-400">موردی یافت نشد</div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-slate-100"
              onClick={() => {
                onChange(r.id, r.requestNumber);
                setSelectedLabel(r.requestNumber);
                setOpen(false);
                setTerm('');
              }}
            >
              <span className="font-bold text-indigo-700">{r.requestNumber}</span>
              {r.description && <span className="truncate text-slate-500">{r.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

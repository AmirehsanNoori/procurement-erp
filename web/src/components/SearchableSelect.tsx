import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Searchable single-select — a drop-in replacement for a plain <select> when the
 * option list is long enough that typing to filter helps (suppliers, requests,
 * budgets, invoices…). Mirrors the prototype's "Searchable Select" behaviour.
 *
 *   value:    currently selected option value ('' when none).
 *   onChange: called with the chosen value ('' when cleared).
 *   options:  [{ value, label }]. A leading empty-value option acts as the
 *             "none" choice and is always shown (not filtered out).
 */

export interface SSOption {
  value: string;
  label: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'انتخاب...',
  className = 'input',
  disabled,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SSOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Keep the "none"/empty option visible regardless of the query.
    return options.filter((o) => o.value === '' || o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        readOnly
        disabled={disabled}
        className={className + ' cursor-pointer'}
        value={selected?.label ?? ''}
        placeholder={placeholder}
        onClick={() => !disabled && setOpen((o) => !o)}
      />
      {/* Hidden input lets native form `required` validation work. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          className="sr-only absolute"
          value={value}
          required
          onChange={() => {}}
        />
      )}

      {open && (
        <div className="absolute z-[70] mt-1 max-h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" dir="rtl">
          <div className="border-b border-slate-100 p-2">
            <input
              ref={searchRef}
              className="input"
              placeholder="جستجو..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-slate-400">موردی یافت نشد</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value || '__none__'}
                type="button"
                className={`block w-full px-3 py-2 text-right text-sm transition-colors hover:bg-slate-100 ${
                  o.value === value ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700'
                }`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >{o.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

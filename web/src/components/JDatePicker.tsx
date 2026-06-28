import { useEffect, useMemo, useRef, useState } from 'react';
import * as jalaali from 'jalaali-js';

/**
 * Jalali (Shamsi) date picker — a drop-in replacement for <input type="date">.
 *
 *   value:    ISO date string "yyyy-mm-dd" (or full ISO datetime), or "" when empty.
 *   onChange: called with the selected ISO date "yyyy-mm-dd", or "" when cleared.
 *
 * Displays a Persian calendar popup but always stores/emits Gregorian ISO so the
 * backend stays unchanged.
 */

const JMONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function faDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

interface JParts { jy: number; jm: number; jd: number }

function isoToJalali(iso: string | null | undefined): JParts | null {
  if (!iso) return null;
  const datePart = iso.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return null;
  const { jy, jm, jd } = jalaali.toJalaali(Number(m[1]), Number(m[2]), Number(m[3]));
  return { jy, jm, jd };
}

function jalaliToIso(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

export function JDatePicker({
  value,
  onChange,
  className = 'input',
  placeholder = 'انتخاب تاریخ',
  disabled,
}: {
  value: string | null | undefined;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => isoToJalali(value), [value]);
  const todayJ = useMemo(() => {
    const n = new Date();
    return jalaali.toJalaali(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }, []);

  // Month currently shown in the popup.
  const [view, setView] = useState<{ jy: number; jm: number }>(
    () => (selected ? { jy: selected.jy, jm: selected.jm } : { jy: todayJ.jy, jm: todayJ.jm })
  );

  useEffect(() => {
    if (open && selected) setView({ jy: selected.jy, jm: selected.jm });
  }, [open, selected]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const grid = useMemo(() => {
    const { jy, jm } = view;
    const daysInMonth = jalaali.jalaaliMonthLength(jy, jm);
    const { gy, gm, gd } = jalaali.toGregorian(jy, jm, 1);
    const firstDow = new Date(gy, gm - 1, gd).getDay(); // 0=Sun..6=Sat
    const leading = (firstDow + 1) % 7; // shift so Saturday is column 0
    const cells: (number | null)[] = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  function shiftMonth(delta: number) {
    setView((v) => {
      let jm = v.jm + delta;
      let jy = v.jy;
      if (jm < 1) { jm = 12; jy -= 1; }
      if (jm > 12) { jm = 1; jy += 1; }
      return { jy, jm };
    });
  }

  const display = selected
    ? `${faDigits(selected.jy)}/${faDigits(String(selected.jm).padStart(2, '0'))}/${faDigits(String(selected.jd).padStart(2, '0'))}`
    : '';

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          readOnly
          disabled={disabled}
          className={className + ' cursor-pointer'}
          dir="ltr"
          style={{ textAlign: 'right' }}
          value={display}
          placeholder={placeholder}
          onClick={() => !disabled && setOpen((o) => !o)}
        />
        {value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            title="پاک کردن"
          >✕</button>
        )}
      </div>

      {open && (
        <div className="absolute z-[70] mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl" dir="rtl">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex gap-1">
              <button type="button" className="rounded px-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setView((v) => ({ ...v, jy: v.jy + 1 }))} title="سال بعد">«</button>
              <button type="button" className="rounded px-1.5 text-slate-500 hover:bg-slate-100" onClick={() => shiftMonth(1)} title="ماه بعد">‹</button>
            </div>
            <div className="text-xs font-bold text-slate-700">
              {JMONTHS[view.jm - 1]} {faDigits(view.jy)}
            </div>
            <div className="flex gap-1">
              <button type="button" className="rounded px-1.5 text-slate-500 hover:bg-slate-100" onClick={() => shiftMonth(-1)} title="ماه قبل">›</button>
              <button type="button" className="rounded px-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setView((v) => ({ ...v, jy: v.jy - 1 }))} title="سال قبل">»</button>
            </div>
          </div>

          {/* Weekday header */}
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-slate-400">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {grid.map((d, i) => {
              if (d === null) return <div key={i} />;
              const isSel = selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d;
              const isToday = todayJ.jy === view.jy && todayJ.jm === view.jm && todayJ.jd === d;
              return (
                <button
                  key={i}
                  type="button"
                  className={`rounded-md py-1 text-xs transition-colors ${
                    isSel ? 'bg-blue-600 font-bold text-white'
                    : isToday ? 'bg-blue-50 font-bold text-blue-700'
                    : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => { onChange(jalaliToIso(view.jy, view.jm, d)); setOpen(false); }}
                >{faDigits(d)}</button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-[11px]">
            <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => { onChange(jalaliToIso(todayJ.jy, todayJ.jm, todayJ.jd)); setOpen(false); }}>امروز</button>
            <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => { onChange(''); setOpen(false); }}>پاک کردن</button>
          </div>
        </div>
      )}
    </div>
  );
}

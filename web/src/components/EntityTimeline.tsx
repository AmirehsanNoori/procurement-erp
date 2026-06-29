import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { JDatePicker } from './JDatePicker';

interface Event {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  eventDate: string | null;
  notes: string | null;
  reference: string | null;
  supplier: string | null;
}

// Event types a user can add manually (mirrors the prototype's event list).
const EVENT_TYPES = [
  'note', 'followup', 'status_changed', 'delivery', 'payment_registered', 'converted', 'document_uploaded',
];
const EVENT_TYPE_FA: Record<string, string> = {
  note: 'یادداشت', followup: 'پیگیری', status_changed: 'تغییر وضعیت', delivery: 'تحویل',
  payment_registered: 'پرداخت', converted: 'تبدیل', document_uploaded: 'سند',
};

/**
 * Inline activity history for an entity (request/quotation/invoice/…). Lists the
 * entity's timeline events and lets the user add a quick event. Backed by the
 * central Timeline API so the events also appear on the Activity Timeline page.
 */
export function EntityTimeline({ entityType, entityId }: { entityType: string; entityId: string | null }) {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const [eventType, setEventType] = useState('note');
  const [eventDate, setEventDate] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const key = ['entity-timeline', tid, entityType, entityId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get(`/${tid}/timeline`, { params: { entityType, entityId } })).data.events as Event[],
    enabled: Boolean(tid && entityId),
  });

  const addMut = useMutation({
    mutationFn: async () => api.post(`/${tid}/timeline`, {
      entityType, entityId, eventType,
      eventDate: eventDate || undefined,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      setNotes('');
      setEventDate('');
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['timeline', tid] });
    },
    onError: (e) => setErr(apiError(e)),
  });

  if (!entityId) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">ابتدا رکورد را ذخیره کنید تا بتوانید رویداد ثبت کنید.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
        <label className="block">
          <span className="mb-1 block text-[10px] text-slate-500">نوع رویداد</span>
          <select className="input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {EVENT_TYPES.map((ev) => <option key={ev} value={ev}>{EVENT_TYPE_FA[ev]}</option>)}
          </select>
        </label>
        <label className="block w-36">
          <span className="mb-1 block text-[10px] text-slate-500">تاریخ</span>
          <JDatePicker className="input" value={eventDate} onChange={setEventDate} />
        </label>
        <label className="block flex-1 min-w-[140px]">
          <span className="mb-1 block text-[10px] text-slate-500">یادداشت</span>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" disabled={addMut.isPending} onClick={() => { setErr(''); addMut.mutate(); }}>＋ رویداد</button>
      </div>
      {err && <div className="text-xs text-rose-600">{err}</div>}

      {isLoading ? (
        <div className="text-center text-xs text-slate-400 py-3">در حال بارگذاری...</div>
      ) : (data ?? []).length === 0 ? (
        <div className="text-center text-xs text-slate-400 py-3">رویدادی ثبت نشده است.</div>
      ) : (
        <div className="space-y-1">
          {data!.map((e) => (
            <div key={e.id} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 whitespace-nowrap">{e.eventTypeLabel}</span>
              <span className="text-slate-400 whitespace-nowrap">{faDate(e.eventDate)}</span>
              {e.notes && <span className="flex-1 text-slate-600">{e.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

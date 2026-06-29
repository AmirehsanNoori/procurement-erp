import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { downloadBlob } from '../lib/download';

interface Doc {
  id: string;
  originalFilename: string | null;
  filename: string;
  category: string | null;
  mimeType: string | null;
  size: number;
  createdAt: string;
}

const CATEGORIES = ['سایر', 'قرارداد', 'فاکتور', 'پیش‌فاکتور', 'حسابداری', 'تحویل', 'نامه'];

/**
 * Inline attachments panel for an entity (request/quotation/invoice/…). Backed by
 * the Document Center API, so files are centrally stored yet editable on the form.
 * For unsaved records (no entityId) it shows a hint to save first.
 */
export function EntityAttachments({ entityType, entityId }: { entityType: string; entityId: string | null }) {
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('سایر');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const key = ['entity-docs', tid, entityType, entityId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get(`/${tid}/documents`, { params: { entityType, entityId } })).data.documents as Doc[],
    enabled: Boolean(tid && entityId),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !entityId) return;
    setBusy(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entityType', entityType);
      fd.append('entityId', entityId);
      fd.append('category', category);
      await api.post(`/${tid}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!entityId) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">ابتدا رکورد را ذخیره کنید، سپس می‌توانید فایل پیوست کنید.</div>;
  }

  return (
    <div className="space-y-3">
      {can('document_center.upload_document') && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] text-slate-500">دسته</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-[10px] text-slate-500">فایل</span>
            <input ref={fileRef} type="file" className="input text-xs" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx" />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={upload}>{busy ? '...' : '＋ افزودن'}</button>
        </div>
      )}
      {err && <div className="text-xs text-rose-600">{err}</div>}

      {isLoading ? (
        <div className="text-center text-xs text-slate-400 py-3">در حال بارگذاری...</div>
      ) : (data ?? []).length === 0 ? (
        <div className="text-center text-xs text-slate-400 py-3">فایلی پیوست نشده است.</div>
      ) : (
        <div className="space-y-1">
          {data!.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
              <span className="flex-1 truncate" title={d.originalFilename ?? d.filename}>📎 {d.originalFilename ?? d.filename}</span>
              {d.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{d.category}</span>}
              <button type="button" className="text-blue-600 hover:underline" onClick={() => downloadBlob(`/${tid}/documents/${d.id}/file`, d.originalFilename ?? d.filename)}>دانلود</button>
              {can('document_center.delete_document') && (
                <button type="button" className="text-rose-600 hover:underline" onClick={() => { if (confirm('حذف فایل؟')) delMut.mutate(d.id); }}>حذف</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

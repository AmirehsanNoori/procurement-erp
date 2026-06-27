import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';

interface Doc {
  id: string;
  entityType: string;
  entityTypeLabel: string;
  entityId: string;
  category: string | null;
  originalFilename: string | null;
  filename: string;
  mimeType: string | null;
  size: number;
  createdAt: string;
}

const ENTITY_TYPE_KEYS = [
  { key: '', labelKey: 'documents.entityTypes.all' },
  { key: 'request', labelKey: 'documents.entityTypes.request' },
  { key: 'quotation', labelKey: 'documents.entityTypes.quotation' },
  { key: 'invoice', labelKey: 'documents.entityTypes.invoice' },
  { key: 'budget', labelKey: 'documents.entityTypes.budget' },
  { key: 'supplier', labelKey: 'documents.entityTypes.supplier' },
  { key: 'payment', labelKey: 'documents.entityTypes.payment' },
];

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string | null): boolean {
  return Boolean(mime?.startsWith('image/'));
}
function isPdf(mime: string | null): boolean {
  return mime === 'application/pdf';
}
function isPreviewable(mime: string | null): boolean {
  return isImage(mime) || isPdf(mime);
}

export function Documents() {
  const { t } = useTranslation();
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ entityType: 'request', entityId: '', category: '' });
  const [uploadErr, setUploadErr] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ doc: Doc; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const listKey = ['documents', tid, entityTypeFilter, search];

  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: async () =>
      (
        await api.get(`/${tid}/documents`, {
          params: {
            entityType: entityTypeFilter || undefined,
            search: search || undefined,
          },
        })
      ).data as { documents: Doc[]; total: number },
    enabled: Boolean(tid),
  });

  // ── Upload ──────────────────────────────────────────────────────────────
  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setUploadErr('لطفاً یک فایل انتخاب کنید'); return; }
    if (!uploadForm.entityId.trim()) { setUploadErr('شناسه موجودیت (Entity ID) لازم است'); return; }

    setUploadErr('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entityType', uploadForm.entityType);
      fd.append('entityId', uploadForm.entityId.trim());
      if (uploadForm.category.trim()) fd.append('category', uploadForm.category.trim());
      await api.post(`/${tid}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: ['documents', tid] });
      setShowUpload(false);
      setUploadForm({ entityType: 'request', entityId: '', category: '' });
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setUploadErr(apiError(err));
    } finally {
      setUploading(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  const delMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/${tid}/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', tid] }),
  });

  // ── Preview ─────────────────────────────────────────────────────────────
  async function openPreview(doc: Doc) {
    setPreviewLoading(true);
    try {
      const res = await api.get(`/${tid}/documents/${doc.id}/file`, {
        params: { inline: 'true' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: doc.mimeType ?? undefined }));
      setPreview({ doc, url });
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  // ── Download ─────────────────────────────────────────────────────────────
  async function downloadDoc(doc: Doc) {
    const res = await api.get(`/${tid}/documents/${doc.id}/file`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.originalFilename ?? doc.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── File type icon ───────────────────────────────────────────────────────
  function fileIcon(mime: string | null): string {
    if (!mime) return '📄';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime === 'application/pdf') return '📕';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('sheet') || mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '🗜️';
    return '📄';
  }

  function handleFileChange(_e: ChangeEvent<HTMLInputElement>) {
    // clear any previous error when user picks a new file
    setUploadErr('');
  }

  const docs = data?.documents ?? [];

  return (
    <Layout title={t('documents.title')}>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder={t('documents.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        {can('document_center.upload_document') && (
          <button
            className="btn btn-primary"
            onClick={() => { setUploadErr(''); setShowUpload((v) => !v); }}
          >
            {t('documents.uploadBtn')}
          </button>
        )}
      </div>

      {/* Entity-type tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {ENTITY_TYPE_KEYS.map((et) => (
          <button
            key={et.key}
            onClick={() => setEntityTypeFilter(et.key)}
            className={`btn ${entityTypeFilter === et.key ? 'btn-primary' : 'btn-outline'}`}
          >
            {t(et.labelKey)}
            {et.key === entityTypeFilter && data ? ` (${data.total})` : ''}
          </button>
        ))}
      </div>

      {/* Upload form */}
      {showUpload && (
        <form onSubmit={handleUpload} className="card mb-4 grid gap-3 sm:grid-cols-2">
          {uploadErr && <div className="sm:col-span-2 text-sm text-rose-600">{uploadErr}</div>}

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('documents.upload.entityType')}</span>
            <select
              className="input"
              value={uploadForm.entityType}
              onChange={(e) => setUploadForm({ ...uploadForm, entityType: e.target.value })}
              required
            >
              {ENTITY_TYPE_KEYS.slice(1).map((et) => (
                <option key={et.key} value={et.key}>{t(et.labelKey)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('documents.upload.entityId')}</span>
            <input
              className="input font-mono text-xs"
              placeholder="مثال: cmqo46xk30000..."
              value={uploadForm.entityId}
              onChange={(e) => setUploadForm({ ...uploadForm, entityId: e.target.value })}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('documents.upload.category')}</span>
            <input
              className="input"
              placeholder="مثال: قرارداد، فیش پرداخت..."
              value={uploadForm.category}
              onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-600">{t('documents.upload.file')}</span>
            <input
              ref={fileRef}
              type="file"
              className="input"
              accept="*/*"
              onChange={handleFileChange}
              required
            />
          </label>

          <div className="sm:col-span-2 flex items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? t('documents.upload.submitting') : t('documents.upload.submit')}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowUpload(false)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Documents table */}
      <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-3">{t('common.type')}</th>
                <th className="p-3">{t('documents.cols.filename')}</th>
                <th className="p-3">{t('documents.cols.category')}</th>
                <th className="p-3">{t('documents.cols.entity')}</th>
                <th className="p-3">{t('documents.cols.size')}</th>
                <th className="p-3">{t('documents.cols.date')}</th>
                <th className="p-3">{t('documents.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-lg">{fileIcon(d.mimeType)}</td>
                  <td className="p-3 max-w-[200px]">
                    <div className="truncate font-medium text-slate-800" title={d.originalFilename ?? d.filename}>
                      {d.originalFilename ?? d.filename}
                    </div>
                    <div className="text-[10px] text-slate-400">{d.mimeType ?? '—'}</div>
                  </td>
                  <td className="p-3">
                    {d.category
                      ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{d.category}</span>
                      : '—'}
                  </td>
                  <td className="p-3">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{d.entityTypeLabel}</span>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400 truncate max-w-[120px]">{d.entityId}</div>
                  </td>
                  <td className="p-3 whitespace-nowrap text-slate-500">{formatBytes(d.size)}</td>
                  <td className="p-3 whitespace-nowrap">{faDate(d.createdAt)}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {can('document_center.view_document') && isPreviewable(d.mimeType) && (
                        <button
                          className="btn btn-outline px-2 py-1"
                          title={t('common.view')}
                          disabled={previewLoading}
                          onClick={() => openPreview(d)}
                        >
                          👁️
                        </button>
                      )}
                      {can('document_center.view_document') && (
                        <button
                          className="btn btn-outline px-2 py-1"
                          title={t('common.download')}
                          onClick={() => downloadDoc(d)}
                        >
                          ⬇️
                        </button>
                      )}
                      {can('document_center.delete_document') && (
                        <button
                          className="btn btn-outline px-2 py-1 text-rose-600"
                          title={t('common.delete')}
                          onClick={() => { if (confirm(t('documents.confirm.delete'))) delMut.mutate(d.id); }}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {t('documents.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-2 text-xs text-slate-400 text-left">
        {data ? `${data.total} سند` : ''}
      </div>

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closePreview}
        >
          <div
            className="relative flex w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <div className="font-semibold text-slate-800">
                  {preview.doc.originalFilename ?? preview.doc.filename}
                </div>
                <div className="text-xs text-slate-400">{formatBytes(preview.doc.size)}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-outline px-3 py-1.5 text-sm"
                  onClick={() => downloadDoc(preview.doc)}
                >
                  ⬇️ {t('common.download')}
                </button>
                <button
                  className="btn btn-outline px-3 py-1.5 text-sm"
                  onClick={closePreview}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Preview body */}
            <div className="flex-1 overflow-auto bg-slate-50 p-4 flex items-center justify-center">
              {isImage(preview.doc.mimeType) && (
                <img
                  src={preview.url}
                  alt={preview.doc.originalFilename ?? ''}
                  className="max-w-full max-h-[70vh] object-contain rounded shadow"
                />
              )}
              {isPdf(preview.doc.mimeType) && (
                <iframe
                  src={preview.url}
                  className="w-full rounded shadow"
                  style={{ height: '70vh' }}
                  title={preview.doc.originalFilename ?? 'PDF'}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

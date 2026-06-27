import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';

interface ImportResult {
  ok: boolean;
  result: Record<string, { created: number; updated: number; skipped: number }>;
}

const ENTITY_LABELS: Record<string, string> = {
  suppliers: 'تأمین‌کنندگان',
  requests: 'درخواست‌ها',
  budgets: 'بودجه‌ها',
  quotations: 'پیش‌فاکتورها',
  invoices: 'فاکتورها',
  payments: 'پرداخت‌ها',
};

export function ImportExport() {
  const { currentTenantId } = useAuth();
  const { t } = useTranslation();
  const tid = currentTenantId!;
  const fileRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      const res = await api.get(`/${tid}/import-export/export`, { responseType: 'blob' });
      const disposition = res.headers['content-disposition'] ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `erp-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(apiError(err));
    } finally {
      setExporting(false);
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setImportError('لطفاً یک فایل JSON انتخاب کنید'); return; }

    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/${tid}/import-export/import`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data as ImportResult);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setImportError(apiError(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Layout title={t('importExport.title')}>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Export panel */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-1">{t('importExport.export.title')}</h2>
          <p className="text-xs text-slate-500 mb-4 leading-5">
            {t('importExport.export.desc')}
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4 text-xs text-slate-600 space-y-1">
            <div className="font-bold text-slate-700 mb-2">محتوای فایل خروجی:</div>
            {Object.entries(ENTITY_LABELS).map(([, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          {exportError && (
            <div className="mb-3 text-sm text-rose-600">{exportError}</div>
          )}

          <button
            className="btn btn-primary w-full"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? t('importExport.export.exporting') : t('importExport.export.btn')}
          </button>

          <div className="mt-3 text-[10px] text-slate-400">
            تاریخ خروجی: {faDate(new Date().toISOString())}
          </div>
        </div>

        {/* Import panel */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-700 mb-1">{t('importExport.import.title')}</h2>
          <p className="text-xs text-slate-500 mb-4 leading-5">
            {t('importExport.import.desc')}
          </p>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4 text-xs text-amber-700">
            <div className="font-bold mb-1">{t('importExport.import.warningTitle')}</div>
            <ul className="space-y-1 list-disc list-inside">
              <li>{t('importExport.import.w1')}</li>
              <li>{t('importExport.import.w2')}</li>
              <li>{t('importExport.import.w3')}</li>
            </ul>
          </div>

          <label className="block mb-3">
            <span className="text-xs font-bold text-slate-600 mb-1 block">{t('importExport.import.file')}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="input text-xs"
            />
          </label>

          {importError && (
            <div className="mb-3 text-sm text-rose-600">{importError}</div>
          )}

          <button
            className="btn btn-primary w-full"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? t('importExport.import.importing') : t('importExport.import.btn')}
          </button>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className="card mt-4">
          <h2 className="text-sm font-bold text-emerald-700 mb-3">✓ واردسازی با موفقیت انجام شد</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-right text-slate-500 text-xs">
                  <th className="p-2">موجودیت</th>
                  <th className="p-2">{t('importExport.result.created')}</th>
                  <th className="p-2">{t('importExport.result.updated')}</th>
                  <th className="p-2">{t('importExport.result.skipped')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(importResult.result).map(([key, r]) => (
                  <tr key={key} className="border-t border-slate-100">
                    <td className="p-2 font-medium text-slate-700">{ENTITY_LABELS[key] ?? key}</td>
                    <td className="p-2">
                      <span className={r.created > 0 ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                        {r.created}
                      </span>
                    </td>
                    <td className="p-2">
                      <span className={r.updated > 0 ? 'text-blue-600 font-bold' : 'text-slate-400'}>
                        {r.updated}
                      </span>
                    </td>
                    <td className="p-2">
                      <span className={r.skipped > 0 ? 'text-slate-500' : 'text-slate-300'}>
                        {r.skipped}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}

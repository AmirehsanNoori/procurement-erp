import { ChangeEvent, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faDate } from '../lib/format';
import { JDatePicker } from '../components/JDatePicker';

// 12 exact IOID columns per spec §12
interface IoidRow {
  id: string;
  ioidRow: number | null;
  requestNumber: string;
  orderNo: string | null;
  title: string | null;
  category: string | null;
  documentDate: string | null;
  receivedDate: string | null;
  weeklySegmentation: string | null;
  receivedPercentage: number | null;
  cost: number | null;
  ioidRemark: string | null;
  paymentStatus: string;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
}

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  Paid: 'bg-green-100 text-green-700',
  Partial: 'bg-amber-100 text-amber-700',
  Pending: 'bg-blue-100 text-blue-700',
  'No Budget': 'bg-slate-100 text-slate-500',
  Cancelled: 'bg-red-100 text-red-500',
};

type EditForm = {
  receivedDate: string;
  receivedPercentage: string;
  ioidRemark: string;
  // Full-editor fields
  ioidRow: string;
  orderNo: string;
  title: string;
  category: string;
  documentDate: string;
  weeklySegmentation: string;
  cost: string;
};

function toInputDate(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export function ControlCenter() {
  const { t } = useTranslation();
  const { currentTenantId, can } = useAuth();
  const tid = currentTenantId!;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [importErr, setImportErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [editErr, setEditErr] = useState('');
  const [form, setForm] = useState<EditForm>({
    receivedDate: '', receivedPercentage: '', ioidRemark: '',
    ioidRow: '', orderNo: '', title: '', category: '', documentDate: '', weeklySegmentation: '', cost: '',
  });

  const isFullEditor = can('requests.edit');

  const { data, isLoading } = useQuery({
    queryKey: ['control-center', tid, search],
    queryFn: async () =>
      (await api.get(`/${tid}/control-center`, { params: { search: search || undefined } })).data as {
        rows: IoidRow[];
        total: number;
      },
    enabled: Boolean(tid),
  });

  // ── Import Excel ────────────────────────────────────────────────────────────
  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErr('');
    setImportResult(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/${tid}/control-center/import`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      qc.invalidateQueries({ queryKey: ['control-center', tid] });
    } catch (err) {
      setImportErr(apiError(err));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // ── Export Excel ────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get(`/${tid}/control-center/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ioid-export.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // ── Inline edit ─────────────────────────────────────────────────────────────
  function openEdit(row: IoidRow) {
    setEditErr('');
    setInlineId(row.id);
    setForm({
      receivedDate: toInputDate(row.receivedDate),
      receivedPercentage: row.receivedPercentage != null ? String(row.receivedPercentage) : '',
      ioidRemark: row.ioidRemark ?? '',
      ioidRow: row.ioidRow != null ? String(row.ioidRow) : '',
      orderNo: row.orderNo ?? '',
      title: row.title ?? '',
      category: row.category ?? '',
      documentDate: toInputDate(row.documentDate),
      weeklySegmentation: row.weeklySegmentation ?? '',
      cost: row.cost != null ? String(row.cost) : '',
    });
  }

  const editMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        receivedDate: form.receivedDate || null,
        receivedPercentage: form.receivedPercentage ? Number(form.receivedPercentage) : null,
        ioidRemark: form.ioidRemark || null,
      };
      if (isFullEditor) {
        body.ioidRow = form.ioidRow ? parseInt(form.ioidRow, 10) : null;
        body.orderNo = form.orderNo || null;
        body.title = form.title || null;
        body.category = form.category || null;
        body.documentDate = form.documentDate || null;
        body.weeklySegmentation = form.weeklySegmentation || null;
        body.cost = form.cost ? Number(form.cost) : null;
      }
      return api.patch(`/${tid}/control-center/${inlineId}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['control-center', tid] });
      setInlineId(null);
      setEditErr('');
    },
    onError: (e) => setEditErr(apiError(e)),
  });

  const rows = data?.rows ?? [];

  return (
    <Layout title={t('controlCenter.title')}>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />

        {/* Import */}
        <label className={`btn btn-outline cursor-pointer ${importing ? 'opacity-50' : ''}`}>
          {importing ? t('controlCenter.importing') : t('controlCenter.importBtn')}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
            disabled={importing}
          />
        </label>

        {/* Export */}
        <button className="btn btn-outline" onClick={handleExport} disabled={exporting}>
          {exporting ? '...' : t('controlCenter.exportBtn')}
        </button>
      </div>

      {/* Import result / error */}
      {importResult && (
        <div className="mb-3 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          {t('controlCenter.importCreated')}: {importResult.created} | {t('controlCenter.importUpdated')}: {importResult.updated} | {t('controlCenter.importSkipped')}: {importResult.skipped}
        </div>
      )}
      {importErr && (
        <div className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{importErr}</div>
      )}

      {/* IOID Table — 12 columns per spec §12 */}
      <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-right text-slate-500">
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.row')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.quoteNo')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.orderNo')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.title')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.category')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.docDate')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.receivedDate')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.weeklySegm')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.rcvPct')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.cost')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.remark')}</th>
                <th className="p-2 whitespace-nowrap">{t('controlCenter.cols.payStatus')}</th>
                {can('control_center.edit') && <th className="p-2"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEditing = inlineId === r.id;

                if (isEditing) {
                  return (
                    <tr key={r.id} className="border-t border-blue-200 bg-blue-50">
                      {/* ROW — full editor only */}
                      <td className="p-1">
                        {isFullEditor
                          ? <input className="input text-xs w-14" type="number" value={form.ioidRow} onChange={(e) => setForm({ ...form, ioidRow: e.target.value })} />
                          : (r.ioidRow ?? '—')}
                      </td>
                      {/* QUOTE NO — read-only */}
                      <td className="p-1 font-bold text-slate-800">{r.requestNumber}</td>
                      {/* ORDER NO — full editor only */}
                      <td className="p-1">
                        {isFullEditor
                          ? <input className="input text-xs w-20" value={form.orderNo} onChange={(e) => setForm({ ...form, orderNo: e.target.value })} />
                          : (r.orderNo ?? '—')}
                      </td>
                      {/* TITLE — full editor only */}
                      <td className="p-1">
                        {isFullEditor
                          ? <input className="input text-xs w-28" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                          : (r.title ?? '—')}
                      </td>
                      {/* CATEGORY — full editor only */}
                      <td className="p-1">
                        {isFullEditor
                          ? <input className="input text-xs w-20" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                          : (r.category ?? '—')}
                      </td>
                      {/* DOCUMENT DATE — full editor only */}
                      <td className="p-1">
                        {isFullEditor
                          ? <JDatePicker className="input text-xs" value={form.documentDate} onChange={(v) => setForm({ ...form, documentDate: v })} />
                          : faDate(r.documentDate)}
                      </td>
                      {/* RECEIVED DATE — always editable */}
                      <td className="p-1">
                        <JDatePicker className="input text-xs" value={form.receivedDate} onChange={(v) => setForm({ ...form, receivedDate: v })} />
                      </td>
                      {/* WEEKLY SEGM — full editor only */}
                      <td className="p-1">
                        {isFullEditor
                          ? <input className="input text-xs w-24" value={form.weeklySegmentation} onChange={(e) => setForm({ ...form, weeklySegmentation: e.target.value })} />
                          : (r.weeklySegmentation ?? '—')}
                      </td>
                      {/* RCV % — always editable */}
                      <td className="p-1">
                        <input className="input text-xs w-14" type="number" min="0" max="100" value={form.receivedPercentage} onChange={(e) => setForm({ ...form, receivedPercentage: e.target.value })} />
                      </td>
                      {/* COST — full editor only */}
                      <td className="p-1">
                        {isFullEditor
                          ? <input className="input text-xs w-24" type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                          : (r.cost != null ? r.cost.toLocaleString('fa-IR') : '—')}
                      </td>
                      {/* REMARK — always editable */}
                      <td className="p-1">
                        <input className="input text-xs w-28" value={form.ioidRemark} onChange={(e) => setForm({ ...form, ioidRemark: e.target.value })} />
                      </td>
                      {/* PAYMENT STATUS — read-only */}
                      <td className="p-1">
                        {r.paymentStatus ? (
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${PAYMENT_STATUS_BADGE[r.paymentStatus] ?? 'bg-slate-100 text-slate-500'}`}>
                            {r.paymentStatus}
                          </span>
                        ) : '—'}
                      </td>
                      {/* Save / Cancel */}
                      <td className="p-1">
                        <div className="flex flex-col gap-1 items-end">
                          {editErr && (
                            <span className="text-rose-500 text-[9px] max-w-[90px] text-right leading-tight">{editErr}</span>
                          )}
                          <div className="flex gap-1">
                            <button
                              className="btn btn-primary px-2 py-1 text-xs"
                              disabled={editMut.isPending}
                              onClick={() => editMut.mutate()}
                            >
                              {editMut.isPending ? '...' : '✓'}
                            </button>
                            <button
                              className="btn btn-outline px-2 py-1 text-xs"
                              onClick={() => { setInlineId(null); setEditErr(''); }}
                            >✕</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-2 text-slate-400">{r.ioidRow ?? '—'}</td>
                    <td className="p-2 font-bold text-slate-800">{r.requestNumber}</td>
                    <td className="p-2">{r.orderNo ?? '—'}</td>
                    <td className="p-2 max-w-[160px] truncate" title={r.title ?? ''}>{r.title ?? '—'}</td>
                    <td className="p-2">{r.category ?? '—'}</td>
                    <td className="p-2 whitespace-nowrap">{faDate(r.documentDate)}</td>
                    <td className="p-2 whitespace-nowrap">{faDate(r.receivedDate)}</td>
                    <td className="p-2">{r.weeklySegmentation ?? '—'}</td>
                    <td className="p-2">{r.receivedPercentage != null ? `${r.receivedPercentage}%` : '—'}</td>
                    <td className="p-2">{r.cost != null ? r.cost.toLocaleString('fa-IR') : '—'}</td>
                    <td className="p-2 max-w-[120px] truncate" title={r.ioidRemark ?? ''}>{r.ioidRemark ?? '—'}</td>
                    <td className="p-2">
                      {r.paymentStatus ? (
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${PAYMENT_STATUS_BADGE[r.paymentStatus] ?? 'bg-slate-100 text-slate-500'}`}>
                          {r.paymentStatus}
                        </span>
                      ) : '—'}
                    </td>
                    {can('control_center.edit') && (
                      <td className="p-2">
                        <button className="btn btn-outline px-2 py-1" onClick={() => openEdit(r)}>✏️</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={can('control_center.edit') ? 13 : 12} className="p-8 text-center text-slate-400">
                    {t('controlCenter.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-2 text-xs text-slate-400 text-left">
        {data ? `${data.total} ردیف` : ''}
      </div>
    </Layout>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../lib/api';
import { faMoney, faDate } from '../lib/format';

interface QuotationRow {
  id: string;
  quotationNumber: string | null;
  supplier: string;
  supplierId: string | null;
  date: string | null;
  amount: number;
  currency: string;
  status: string;
  deliveryDate: string | null;
  notes: string | null;
  advancePaymentAmount: number | null;
  paymentBatchNumber: string | null;
  archived: boolean;
  isLowest: boolean;
}

interface CompareResult {
  request: { id: string; requestNumber: string; description: string | null };
  quotations: QuotationRow[];
}

const STATUS_COLOR: Record<string, string> = {
  'در انتظار سفارش': 'bg-amber-100 text-amber-700',
  'تأیید شده': 'bg-emerald-100 text-emerald-700',
  'رد شده': 'bg-rose-100 text-rose-700',
  'آرشیو': 'bg-slate-100 text-slate-500',
  'تبدیل شده': 'bg-blue-100 text-blue-700',
};

export function RFQCompare() {
  const { currentTenantId } = useAuth();
  const [requestId, setRequestId] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [fetchError, setFetchError] = useState('');

  const tid = currentTenantId ?? '';

  // Search requests by requestNumber
  const requestsQ = useQuery({
    queryKey: ['requests-search', tid, inputVal],
    queryFn: async () => {
      const res = await api.get(`/${tid}/requests`, { params: { search: inputVal, limit: 20 } });
      return res.data.requests as { id: string; requestNumber: string; description: string | null }[];
    },
    enabled: !!tid && inputVal.trim().length > 0,
  });

  const compareQ = useQuery({
    queryKey: ['rfq-compare', tid, requestId],
    queryFn: async () => {
      setFetchError('');
      try {
        const res = await api.get(`/${tid}/quotations/compare`, { params: { requestId } });
        return res.data as CompareResult;
      } catch (e) {
        setFetchError(apiError(e));
        return null;
      }
    },
    enabled: !!tid && !!requestId,
  });

  const data = compareQ.data;
  const quotations = data?.quotations ?? [];
  const minAmount = quotations.length > 0 ? Math.min(...quotations.map((q) => q.amount)) : 0;

  return (
    <Layout title="مقایسه رقابتی پیش‌فاکتورها">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">مقایسه رقابتی پیش‌فاکتورها (RFQ)</h1>
          <p className="text-sm text-slate-500 mt-1">مقایسه پیش‌فاکتورهای مختلف برای یک درخواست به صورت جدول کنار هم</p>
        </div>

        {/* Request selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700 mb-2">انتخاب درخواست</label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="شماره درخواست یا توضیحات را وارد کنید..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
              />
              {requestsQ.data && requestsQ.data.length > 0 && inputVal && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                  {requestsQ.data.map((r) => (
                    <button
                      key={r.id}
                      className="w-full text-right px-4 py-2.5 hover:bg-slate-50 text-sm flex items-center gap-3"
                      onClick={() => {
                        setRequestId(r.id);
                        setInputVal(r.requestNumber);
                      }}
                    >
                      <span className="font-bold text-indigo-700">{r.requestNumber}</span>
                      <span className="text-slate-500 truncate">{r.description ?? ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {requestId && (
              <button
                onClick={() => { setRequestId(''); setInputVal(''); }}
                className="px-4 py-2 text-sm text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                پاک کردن
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {fetchError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">{fetchError}</div>
        )}

        {/* Loading */}
        {compareQ.isLoading && requestId && (
          <div className="text-center py-12 text-slate-400">در حال بارگذاری...</div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-4">
            {/* Request info */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-indigo-500 font-medium">درخواست:</span>
                <span className="font-bold text-indigo-800">{data.request.requestNumber}</span>
                {data.request.description && (
                  <span className="text-sm text-indigo-600">{data.request.description}</span>
                )}
                <span className="mr-auto text-xs text-indigo-400">
                  {quotations.length} پیش‌فاکتور
                </span>
              </div>
            </div>

            {quotations.length === 0 ? (
              <div className="text-center py-12 text-slate-400">هیچ پیش‌فاکتوری برای این درخواست ثبت نشده</div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-xs text-slate-500">تعداد پیشنهادات</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">{quotations.length}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-sm">
                    <div className="text-xs text-emerald-600">کمترین مبلغ</div>
                    <div className="text-2xl font-bold text-emerald-700 mt-1">{faMoney(minAmount)}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {quotations.find((q) => q.isLowest)?.supplier ?? '—'}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="text-xs text-slate-500">میانگین مبلغ</div>
                    <div className="text-2xl font-bold text-slate-800 mt-1">
                      {faMoney(Math.round(quotations.reduce((s, q) => s + q.amount, 0) / quotations.length))}
                    </div>
                  </div>
                </div>

                {/* Comparison table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="p-3 text-right font-medium text-slate-600">ردیف</th>
                        <th className="p-3 text-right font-medium text-slate-600">شماره</th>
                        <th className="p-3 text-right font-medium text-slate-600">تأمین‌کننده</th>
                        <th className="p-3 text-right font-medium text-slate-600">تاریخ</th>
                        <th className="p-3 text-right font-medium text-slate-600">مبلغ (ریال)</th>
                        <th className="p-3 text-right font-medium text-slate-600">تفاوت از کمترین</th>
                        <th className="p-3 text-right font-medium text-slate-600">تاریخ تحویل</th>
                        <th className="p-3 text-right font-medium text-slate-600">پیش‌پرداخت</th>
                        <th className="p-3 text-right font-medium text-slate-600">وضعیت</th>
                        <th className="p-3 text-right font-medium text-slate-600">یادداشت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotations.map((q, i) => {
                        const diff = q.amount - minAmount;
                        const diffPct = minAmount > 0 ? ((diff / minAmount) * 100).toFixed(1) : '0';
                        return (
                          <tr
                            key={q.id}
                            className={`border-b border-slate-100 ${q.isLowest ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                          >
                            <td className="p-3 text-slate-400">{i + 1}</td>
                            <td className="p-3 font-mono text-xs text-slate-600">
                              {q.quotationNumber || '—'}
                            </td>
                            <td className="p-3 font-semibold text-slate-800">
                              {q.supplier}
                              {q.isLowest && (
                                <span className="mr-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">برنده</span>
                              )}
                            </td>
                            <td className="p-3 text-slate-600">{faDate(q.date)}</td>
                            <td className={`p-3 font-bold tabular-nums ${q.isLowest ? 'text-emerald-700' : 'text-slate-800'}`}>
                              {faMoney(q.amount)}
                            </td>
                            <td className="p-3">
                              {diff === 0 ? (
                                <span className="text-emerald-600 font-semibold">—</span>
                              ) : (
                                <span className="text-rose-600">+{faMoney(diff)} ({diffPct}٪)</span>
                              )}
                            </td>
                            <td className="p-3 text-slate-600">{faDate(q.deliveryDate)}</td>
                            <td className="p-3 text-slate-600">
                              {q.advancePaymentAmount ? faMoney(q.advancePaymentAmount) : '—'}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[q.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                {q.status}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 text-xs max-w-[200px] truncate" title={q.notes ?? ''}>
                              {q.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Winner highlight */}
                {quotations.find((q) => q.isLowest) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-4">
                    <span className="text-2xl">🏆</span>
                    <div>
                      <div className="font-bold text-emerald-800">
                        پیشنهاد برتر: {quotations.find((q) => q.isLowest)?.supplier}
                      </div>
                      <div className="text-sm text-emerald-600">
                        مبلغ: {faMoney(minAmount)} ریال
                        {quotations.find((q) => q.isLowest)?.deliveryDate && (
                          <span className="mr-3">
                            تاریخ تحویل: {faDate(quotations.find((q) => q.isLowest)?.deliveryDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

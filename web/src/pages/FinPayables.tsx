import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { faMoney } from '../lib/format';

interface Row { supplierId: string; supplierName: string; invoiced: number; paid: number; outstanding: number; invoiceCount: number; overdue: number; }

export function FinPayables() {
  const { currentTenantId } = useAuth();
  const tid = currentTenantId!;
  const { data, isLoading } = useQuery({
    queryKey: ['fin-payables', tid],
    queryFn: async () => (await api.get(`/${tid}/finance/payables`)).data as { rows: Row[]; totals: { invoiced: number; paid: number; outstanding: number } },
    enabled: !!tid,
  });
  const rows = data?.rows ?? [];

  return (
    <Layout title="حساب‌های پرداختنی">
      <p className="mb-3 text-sm text-slate-500">وضعیت بدهی به تفکیک تأمین‌کننده (برگرفته از فاکتورها و پرداخت‌های تدارکات). فقط اسناد قطعی در دفتر کل اثر دارند؛ این نما مانده عملیاتی است.</p>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-xs text-slate-500">مجموع فاکتور</div><div className="mt-1 text-lg font-bold tabular-nums">{faMoney(data?.totals.invoiced ?? 0)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">پرداخت‌شده</div><div className="mt-1 text-lg font-bold tabular-nums text-emerald-600">{faMoney(data?.totals.paid ?? 0)}</div></div>
        <div className="card"><div className="text-xs text-slate-500">مانده بدهی</div><div className="mt-1 text-lg font-bold tabular-nums text-rose-600">{faMoney(data?.totals.outstanding ?? 0)}</div></div>
      </div>

      <div className="card overflow-x-auto p-0">
        {isLoading ? <div className="p-8 text-center text-slate-400">در حال بارگذاری...</div> : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">فاکتوری برای نمایش وجود ندارد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-right text-slate-500"><th className="p-3">تأمین‌کننده</th><th className="p-3">تعداد فاکتور</th><th className="p-3">مجموع فاکتور</th><th className="p-3">پرداخت‌شده</th><th className="p-3">مانده</th><th className="p-3">معوق</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supplierId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-800">{r.supplierName}</td>
                  <td className="p-3 tabular-nums text-slate-500">{r.invoiceCount}</td>
                  <td className="p-3 tabular-nums">{faMoney(r.invoiced)}</td>
                  <td className="p-3 tabular-nums text-emerald-600">{faMoney(r.paid)}</td>
                  <td className="p-3 tabular-nums font-semibold">{r.outstanding ? faMoney(r.outstanding) : '—'}</td>
                  <td className="p-3 tabular-nums">{r.overdue ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">{faMoney(r.overdue)}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="p-3" colSpan={2}>جمع کل</td>
                <td className="p-3 tabular-nums">{faMoney(data?.totals.invoiced ?? 0)}</td>
                <td className="p-3 tabular-nums text-emerald-600">{faMoney(data?.totals.paid ?? 0)}</td>
                <td className="p-3 tabular-nums text-rose-600">{faMoney(data?.totals.outstanding ?? 0)}</td>
                <td className="p-3"></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </Layout>
  );
}

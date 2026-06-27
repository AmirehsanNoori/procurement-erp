interface Props {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
  label?: string;
}

export function Pagination({ page, totalPages, total, onPageChange, label = 'ردیف' }: Props) {
  if (totalPages <= 1 && total <= 50) return null;

  const pages: (number | 'ellipsis')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('ellipsis');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('ellipsis');
    if (totalPages > 1) pages.push(totalPages);
  }

  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-xs text-slate-400">
        {total.toLocaleString('fa-IR')} {label} — صفحه {page} از {totalPages}
      </span>
      <div className="flex gap-1">
        <button
          className="btn btn-outline px-2 py-1 text-xs disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ›
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 py-1 text-slate-400 text-xs">…</span>
          ) : (
            <button
              key={p}
              className={`btn px-2.5 py-1 text-xs ${p === page ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}
        <button
          className="btn btn-outline px-2 py-1 text-xs disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          ‹
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { downloadStoreExcel } from '../lib/download';

/** Toolbar button that exports a business store to Excel with Jalali dates. */
export function ExcelButton({ store, label }: { store: string; label?: string }) {
  const { currentTenantId } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-outline"
      disabled={busy || !currentTenantId}
      title="خروجی Excel (تاریخ شمسی)"
      onClick={async () => {
        if (!currentTenantId) return;
        setBusy(true);
        try { await downloadStoreExcel(currentTenantId, store); } finally { setBusy(false); }
      }}
    >
      {busy ? '...' : `📥 ${label ?? 'Excel'}`}
    </button>
  );
}

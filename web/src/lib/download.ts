import { api } from './api';

/** Download a binary response from the API as a file (Excel, etc.). */
export async function downloadBlob(url: string, fallbackName: string): Promise<void> {
  const res = await api.get(url, { responseType: 'blob' });
  const disposition = (res.headers['content-disposition'] as string | undefined) ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackName;
  const blobUrl = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

/** Export one business "store" to Excel (requests, quotations, invoices, payments, suppliers, tasks). */
export async function downloadStoreExcel(tenantId: string, store: string): Promise<void> {
  await downloadBlob(`/${tenantId}/import-export/excel/${store}`, `${store}.xlsx`);
}
